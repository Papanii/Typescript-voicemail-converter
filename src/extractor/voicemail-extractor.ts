/**
 * Main orchestrator for voicemail extraction — port of VoicemailExtractor.java.
 *
 * Opens Manifest.db, extracts voicemail.db and audio files, reads metadata,
 * and matches files with their metadata records.
 */

import { existsSync, statSync } from 'node:fs';
import type { BackupInfo, VoicemailFile, VoicemailMetadata, ManifestFileInfo, Logger } from '../types.js';
import { audioFormatFromExtension, noopLogger } from '../types.js';
import { NoVoicemailsError } from '../errors.js';
import { TempManager } from '../util/temp-manager.js';
import { ManifestDbReader } from './manifest-db-reader.js';
import { VoicemailDbReader } from './voicemail-db-reader.js';
import { FileExtractor } from './file-extractor.js';
import { matchFilesWithMetadata, type VoicemailFileBuilder } from './file-matcher.js';

export class VoicemailExtractor {
  private readonly backup: BackupInfo;
  private readonly tempManager: TempManager;
  private readonly logger: Logger;

  constructor(backup: BackupInfo, tempManager: TempManager, logger: Logger = noopLogger) {
    this.backup = backup;
    this.tempManager = tempManager;
    this.logger = logger;
  }

  /**
   * Extract all voicemails from the backup.
   */
  extractVoicemails(): VoicemailFile[] {
    this.logger.info('Starting voicemail extraction from backup');

    const manifestReader = new ManifestDbReader(this.backup.backupPath, this.logger);
    manifestReader.open();

    try {
      // Extract voicemail.db
      const voicemailDb = this.extractVoicemailDatabase(manifestReader);

      // Read metadata if available
      let metadataList: VoicemailMetadata[] = [];
      if (voicemailDb) {
        metadataList = this.readVoicemailMetadata(voicemailDb);
      } else {
        this.logger.warn('No voicemail.db found, will use file-only mode');
      }

      // Query audio files from manifest
      const audioFileInfos = manifestReader.queryVoicemailFiles();

      if (audioFileInfos.length === 0) {
        throw new NoVoicemailsError();
      }

      // Extract audio files
      const audioBuilders = this.extractAudioFiles(audioFileInfos);

      // Match files with metadata
      const voicemails = matchFilesWithMetadata(audioBuilders, metadataList, this.logger);

      this.logger.info('Successfully extracted %d voicemails', voicemails.length);
      return voicemails;
    } finally {
      manifestReader.close();
    }
  }

  /**
   * Extract AddressBook.sqlitedb from the backup for contact lookup.
   * Returns null if not present.
   */
  extractAddressBook(): string | null {
    this.logger.info('Attempting to extract AddressBook from backup');

    const manifestReader = new ManifestDbReader(this.backup.backupPath, this.logger);
    manifestReader.open();

    try {
      const abInfo = manifestReader.queryAddressBookFile();
      if (!abInfo) {
        this.logger.info('No AddressBook found in backup');
        return null;
      }

      const tempDir = this.tempManager.getTempDirectory();
      if (!tempDir) {
        this.logger.warn('Temp directory not available');
        return null;
      }

      const extractor = new FileExtractor(this.backup.backupPath, tempDir, this.logger);
      const extracted = extractor.extractFile(abInfo.fileId, 'AddressBook.sqlitedb');

      if (extracted && existsSync(extracted)) {
        this.logger.info('Successfully extracted AddressBook.sqlitedb');
        return extracted;
      }
    } catch (e) {
      this.logger.warn('Failed to extract AddressBook: %s', e instanceof Error ? e.message : String(e));
    } finally {
      manifestReader.close();
    }

    return null;
  }

  private extractVoicemailDatabase(manifestReader: ManifestDbReader): string | null {
    this.logger.info('Extracting voicemail database');

    const tempDir = this.tempManager.getTempDirectory();
    if (!tempDir) {
      throw new Error('Temp directory not created');
    }

    const extractor = new FileExtractor(this.backup.backupPath, tempDir, this.logger);
    return extractor.extractVoicemailDb(manifestReader);
  }

  private readVoicemailMetadata(voicemailDbPath: string): VoicemailMetadata[] {
    this.logger.info('Reading voicemail metadata');

    const reader = new VoicemailDbReader(voicemailDbPath, this.logger);
    reader.open();
    try {
      return reader.readAllMetadata(false);
    } finally {
      reader.close();
    }
  }

  private extractAudioFiles(audioFileInfos: ManifestFileInfo[]): VoicemailFileBuilder[] {
    this.logger.info('Extracting %d audio files', audioFileInfos.length);

    const audioDir = this.tempManager.createSubdirectory('audio');
    const extractor = new FileExtractor(this.backup.backupPath, audioDir, this.logger);

    const builders: VoicemailFileBuilder[] = [];

    for (const fileInfo of audioFileInfos) {
      try {
        const filename = extractFilename(fileInfo.relativePath);
        const extractedPath = extractor.extractFile(fileInfo.fileId, filename);

        if (!extractedPath) {
          this.logger.warn('Failed to extract: %s', fileInfo.relativePath);
          continue;
        }

        const backupFilePath = extractor.getFullBackupFilePath(fileInfo.fileId);
        const fileSize = statSync(extractedPath).size;

        // Auto-detect format from extension
        const dotIndex = fileInfo.relativePath.lastIndexOf('.');
        const ext = dotIndex > 0 ? fileInfo.relativePath.substring(dotIndex) : '';
        const format = audioFormatFromExtension(ext);

        builders.push({
          fileId: fileInfo.fileId,
          domain: fileInfo.domain,
          relativePath: fileInfo.relativePath,
          backupFilePath,
          extractedPath,
          format,
          fileSize,
          originalFilename: filename,
        });

        this.logger.debug('Extracted: %s (%d bytes)', filename, fileSize);
      } catch (e) {
        this.logger.error('Error extracting %s: %s',
          fileInfo.relativePath, e instanceof Error ? e.message : String(e));
      }
    }

    this.logger.info('Successfully extracted %d audio files', builders.length);
    return builders;
  }
}

function extractFilename(relativePath: string): string {
  const lastSlash = relativePath.lastIndexOf('/');
  return lastSlash >= 0 ? relativePath.substring(lastSlash + 1) : relativePath;
}
