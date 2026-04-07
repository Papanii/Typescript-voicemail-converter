/**
 * Extracts files from iOS backup to temp directory — port of FileExtractor.java.
 *
 * Files in iOS backups are stored by their SHA-1 hash. This module copies
 * them out to the temp directory with human-readable names.
 */

import { copyFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getBackupFilePath } from '../util/hash-util.js';
import type { Logger } from '../types.js';
import { noopLogger } from '../types.js';
import { VoicemailDbReader } from './voicemail-db-reader.js';
import { ManifestDbReader } from './manifest-db-reader.js';

export class FileExtractor {
  private readonly backupPath: string;
  private readonly tempDirectory: string;
  private readonly logger: Logger;

  constructor(backupPath: string, tempDirectory: string, logger: Logger = noopLogger) {
    this.backupPath = backupPath;
    this.tempDirectory = tempDirectory;
    this.logger = logger;
  }

  /**
   * Extract a file from the backup by its hash.
   * @returns Path to extracted file, or null if source not found.
   */
  extractFile(fileHash: string, outputName: string): string | null {
    const backupFilePath = getBackupFilePath(fileHash);
    const sourceFile = join(this.backupPath, backupFilePath);

    if (!existsSync(sourceFile)) {
      this.logger.warn('Backup file not found: %s', sourceFile);
      return null;
    }

    const destination = join(this.tempDirectory, outputName);
    this.logger.debug('Extracting: %s -> %s', backupFilePath, destination);

    copyFileSync(sourceFile, destination);

    const size = statSync(destination).size;
    this.logger.debug('Extracted %d bytes', size);

    return destination;
  }

  /**
   * Extract voicemail.db to temp directory using ManifestDbReader.
   */
  extractVoicemailDb(manifestReader: ManifestDbReader): string | null {
    this.logger.info('Extracting voicemail.db');

    const voicemailDbInfo = manifestReader.queryVoicemailDbFile();

    if (!voicemailDbInfo) {
      this.logger.warn('voicemail.db not found in Manifest.db');
      manifestReader.listLibraryVoicemailFiles();
      return null;
    }

    const extracted = this.extractFile(voicemailDbInfo.fileId, 'voicemail.db');

    if (!extracted) {
      this.logger.warn('voicemail.db file not found in backup directory');
      return null;
    }

    // Verify it's a valid SQLite database with voicemail table
    if (!VoicemailDbReader.isValidVoicemailDb(extracted, this.logger)) {
      this.logger.error('Extracted voicemail.db is not valid');
      return null;
    }

    this.logger.info('Successfully extracted voicemail.db');
    return extracted;
  }

  /** Get the full backup file path for a given hash */
  getFullBackupFilePath(fileHash: string): string {
    const relativePath = getBackupFilePath(fileHash);
    return join(this.backupPath, relativePath);
  }
}
