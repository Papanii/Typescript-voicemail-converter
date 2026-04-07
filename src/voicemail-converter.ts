/**
 * Top-level orchestrator — port of VoicemailConverter.java.
 *
 * Coordinates the entire voicemail extraction pipeline:
 * 1. Create temp directory
 * 2. Discover and select backup
 * 3. Validate backup
 * 4. Check encryption
 * 5. Extract voicemails
 * 6. Enrich with contacts (best-effort)
 * 7. Process metadata
 * 8. Detect FFmpeg
 * 9. Convert audio files
 * 10. Organize output
 * 11. Clean up temp directory
 * 12. Return result
 */

import { join, dirname } from 'node:path';
import Database from 'better-sqlite3';
import type {
  ExtractorOptions,
  ExtractorResult,
  BackupInfo,
  VoicemailFile,
  ConversionResult,
  ConversionProgress,
  ContactInfo,
  Logger,
} from './types.js';
import { noopLogger } from './types.js';
import { VoicemailExtractorError, NoVoicemailsError } from './errors.js';
import { TempManager } from './util/temp-manager.js';
import { discoverBackup, discoverAllBackups, getDefaultBackupDir } from './backup/backup-discovery.js';
import { VoicemailExtractor } from './extractor/voicemail-extractor.js';
import { processMetadata, exportMetadataToJSON } from './metadata/metadata-processor.js';
import { normalizePhoneNumber, formatPhoneNumber } from './metadata/phone-number-formatter.js';
import { AudioConverter } from './converter/audio-converter.js';
import { checkFFmpegAvailability } from './converter/ffmpeg-detector.js';
import { organizeFiles, type FileToOrganize } from './output/file-organizer.js';

/**
 * Extract voicemails from an iOS backup.
 *
 * This is the main public API. It runs the full pipeline: discover backup,
 * extract voicemails, convert to WAV, and organize output files.
 */
export async function extractVoicemails(options: ExtractorOptions): Promise<ExtractorResult> {
  const logger = options.logger ?? noopLogger;
  const onProgress = options.onProgress;
  const tempManager = new TempManager(logger);

  const startTime = Date.now();

  try {
    // Step 1: Create temp directory
    tempManager.createTempDirectory();

    // Step 2: Discover backup
    reportProgress(onProgress, 'discovering', 0, 1, null);
    const backupDir = options.backupDir ?? getDefaultBackupDir();
    const backup = discoverBackup(backupDir, options.deviceId, logger);
    reportProgress(onProgress, 'discovering', 1, 1, backup.deviceName);

    // Step 3-4: Validation and encryption check happen inside discoverBackup

    // Step 5: Extract voicemails
    reportProgress(onProgress, 'extracting', 0, 1, null);
    const extractor = new VoicemailExtractor(backup, tempManager, logger);
    const voicemails = extractor.extractVoicemails();

    if (voicemails.length === 0) {
      throw new NoVoicemailsError();
    }

    reportProgress(onProgress, 'extracting', voicemails.length, voicemails.length, null);
    logger.info('Extracted %d voicemails', voicemails.length);

    // Step 5b: Contact enrichment (best-effort)
    const contactMap = enrichWithContacts(extractor, voicemails, logger);

    // Step 6: Process metadata
    const backupInstant = backup.lastBackupDate ?? new Date();
    const metadataList = voicemails.map((vm) =>
      processMetadata(vm, backup.deviceName, backup.productVersion, backupInstant, logger),
    );

    // Export JSON metadata if requested
    if (options.includeMetadata) {
      const tempDir = tempManager.getTempDirectory()!;
      for (const metadata of metadataList) {
        try {
          const jsonPath = join(tempDir, metadata.voicemailFile.fileId + '.json');
          exportMetadataToJSON(metadata, jsonPath, logger);
        } catch (e) {
          logger.warn('Failed to export metadata for %s: %s',
            metadata.voicemailFile.originalFilename,
            e instanceof Error ? e.message : String(e));
        }
      }
    }

    // Step 7-8: Convert audio files
    const converter = new AudioConverter(logger);
    const conversionResults: ConversionResult[] = [];
    const total = voicemails.length;

    for (let i = 0; i < total; i++) {
      const vm = voicemails[i]!;
      const metadata = metadataList[i]!;

      reportProgress(onProgress, 'converting', i, total, buildLabel(vm, contactMap));

      const outputWav = join(tempManager.getTempDirectory()!, vm.fileId + '.wav');
      const result = converter.convertSingle(vm, outputWav, metadata);
      conversionResults.push(result);
    }

    reportProgress(onProgress, 'converting', total, total, null);

    // Step 9: Organize output files
    reportProgress(onProgress, 'organizing', 0, total, null);

    const filesToOrganize: FileToOrganize[] = [];
    for (let i = 0; i < conversionResults.length; i++) {
      const result = conversionResults[i]!;
      if (!result.success || !result.outputFile) continue;

      const vm = voicemails[i]!;
      let jsonFile: string | null = null;
      if (options.includeMetadata) {
        jsonFile = join(tempManager.getTempDirectory()!, vm.fileId + '.json');
      }

      filesToOrganize.push({
        wavFile: result.outputFile,
        jsonFile,
        originalFile: vm.extractedPath,
        voicemailFile: vm,
      });
    }

    const backupOutputDir = options.keepOriginals
      ? join(dirname(options.outputDir), 'voicemail-backup')
      : null;

    const outputResult = organizeFiles(
      filesToOrganize,
      options.outputDir,
      backupOutputDir,
      logger,
    );

    reportProgress(onProgress, 'organizing', total, total, null);

    const totalDurationMs = Date.now() - startTime;
    logger.info('Conversion completed in %dms', totalDurationMs);

    return {
      backupInfo: backup,
      voicemails,
      conversions: conversionResults,
      output: outputResult,
      totalDurationMs,
    };
  } catch (e) {
    if (e instanceof VoicemailExtractorError) {
      throw e;
    }
    throw new VoicemailExtractorError(
      e instanceof Error ? e.message : String(e),
      1,
      null,
      e instanceof Error ? e : undefined,
    );
  } finally {
    tempManager.cleanup();
  }
}

/**
 * Discover all available iOS backups.
 */
export async function discoverBackups(backupDir?: string): Promise<BackupInfo[]> {
  const dir = backupDir ?? getDefaultBackupDir();
  return discoverAllBackups(dir);
}

/**
 * Check FFmpeg availability.
 */
export async function checkFfmpeg(): Promise<{
  available: boolean;
  ffmpegVersion: string | null;
  ffprobeVersion: string | null;
}> {
  return checkFFmpegAvailability();
}

/**
 * Extract the iOS AddressBook database from a backup.
 */
export async function extractAddressBook(
  backupPath: string,
  tempDir?: string,
): Promise<string | null> {
  const tempManager = new TempManager();

  try {
    if (!tempDir) {
      tempManager.createTempDirectory();
    }

    const backup: BackupInfo = {
      udid: 'extract-addressbook',
      deviceName: null,
      displayName: null,
      productType: null,
      productVersion: null,
      serialNumber: null,
      phoneNumber: null,
      lastBackupDate: null,
      isEncrypted: false,
      backupPath,
    };

    const tm = tempDir
      ? {
          getTempDirectory: () => tempDir,
          createSubdirectory: (n: string) => join(tempDir, n),
          createTempDirectory: () => tempDir,
          cleanup: () => {},
        } as unknown as TempManager
      : tempManager;

    const extractor = new VoicemailExtractor(backup, tm);
    return extractor.extractAddressBook();
  } finally {
    if (!tempDir) {
      tempManager.cleanup();
    }
  }
}

function enrichWithContacts(
  extractor: VoicemailExtractor,
  voicemails: VoicemailFile[],
  logger: Logger,
): Map<string, ContactInfo> {
  const contactMap = new Map<string, ContactInfo>();

  logger.info('Looking for contact book in backup...');
  const addressBookPath = extractor.extractAddressBook();
  if (!addressBookPath) {
    logger.info('No contact book found in backup');
    return contactMap;
  }

  let db: Database.Database | null = null;
  try {
    db = new Database(addressBookPath, { readonly: true });

    // Check schema
    const hasABPerson = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ABPerson'").get();
    const hasABMultiValue = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ABMultiValue'").get();

    if (!hasABPerson || !hasABMultiValue) {
      logger.warn('AddressBook.sqlitedb does not have expected schema');
      return contactMap;
    }

    // Load contacts with phone numbers
    const contactsByPhone = new Map<string, ContactInfo>();

    const rows = db.prepare(`
      SELECT p.First, p.Last, p.Organization, mv.value AS phone
      FROM ABPerson p
      JOIN ABMultiValue mv ON p.ROWID = mv.record_id
      WHERE mv.property = 3
        AND mv.value IS NOT NULL
        AND mv.value != ''
    `).all() as { First: string | null; Last: string | null; Organization: string | null; phone: string }[];

    for (const row of rows) {
      const normalizedKey = normalizeForLookup(row.phone);
      if (!normalizedKey) continue;

      const firstName = row.First;
      const lastName = row.Last;
      const organization = row.Organization;

      const hasFirst = !!firstName;
      const hasLast = !!lastName;
      const hasOrg = !!organization;

      let displayName: string;
      if (hasFirst && hasLast) displayName = `${firstName} ${lastName}`;
      else if (hasFirst) displayName = firstName!;
      else if (hasLast) displayName = lastName!;
      else if (hasOrg) displayName = organization!;
      else displayName = row.phone;

      const isBusiness = !hasFirst && !hasLast && hasOrg;

      contactsByPhone.set(normalizedKey, {
        firstName,
        lastName,
        organization,
        matchedPhoneNumber: row.phone,
        displayName,
        isBusiness,
      });
    }

    logger.info('Loaded %d contact phone entries', contactsByPhone.size);

    // Match voicemails to contacts
    let matched = 0;
    for (const voicemail of voicemails) {
      if (!voicemail.metadata?.callerNumber) continue;

      const normalized = normalizePhoneNumber(voicemail.metadata.callerNumber);
      const lookupKey = normalizeForLookup(normalized);
      if (!lookupKey) continue;

      const contact = contactsByPhone.get(lookupKey);
      if (contact) {
        matched++;
        contactMap.set(voicemail.fileId, contact);
        logger.debug('Matched caller %s -> %s', voicemail.metadata.callerNumber, contact.displayName);
      }
    }

    logger.info('Matched %d/%d voicemails to contacts', matched, voicemails.length);
  } catch (e) {
    logger.warn('Contact enrichment failed (non-fatal): %s', e instanceof Error ? e.message : String(e));
  } finally {
    db?.close();
  }

  return contactMap;
}

/** Normalize phone number to last-10-digits lookup key */
function normalizeForLookup(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length < 7) return null;
  if (digits.length >= 10) return digits.substring(digits.length - 10);
  return digits;
}

function buildLabel(
  voicemail: VoicemailFile,
  contactMap: Map<string, ContactInfo>,
): string {
  const contact = contactMap.get(voicemail.fileId);
  if (contact) return contact.displayName;

  if (voicemail.metadata?.callerNumber) {
    const caller = voicemail.metadata.callerNumber;
    if (caller && caller.toLowerCase() !== 'unknown') {
      return formatPhoneNumber(normalizePhoneNumber(caller));
    }
  }

  return voicemail.originalFilename;
}

function reportProgress(
  onProgress: ((progress: ConversionProgress) => void) | undefined,
  stage: ConversionProgress['stage'],
  current: number,
  total: number,
  currentFile: string | null,
): void {
  if (!onProgress) return;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  onProgress({ stage, current, total, currentFile, percent });
}
