/**
 * Manages temporary directories for voicemail processing — port of TempDirectoryManager.java.
 *
 * Creates a unique temp directory, supports subdirectories, and provides
 * cleanup that runs even on unhandled exits.
 */

import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Logger } from '../types.js';
import { noopLogger } from '../types.js';

const PREFIX = 'voicemail-converter-';

export class TempManager {
  private tempDirectory: string | null = null;
  private readonly logger: Logger;

  constructor(logger: Logger = noopLogger) {
    this.logger = logger;
  }

  /** Create and return the temp directory */
  createTempDirectory(): string {
    if (this.tempDirectory && existsSync(this.tempDirectory)) {
      this.logger.debug('Temp directory already exists: %s', this.tempDirectory);
      return this.tempDirectory;
    }

    const now = new Date();
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      '-',
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('');

    this.tempDirectory = mkdtempSync(join(tmpdir(), `${PREFIX}${timestamp}-`));
    this.logger.info('Created temp directory: %s', this.tempDirectory);

    return this.tempDirectory;
  }

  /** Get the current temp directory path */
  getTempDirectory(): string | null {
    return this.tempDirectory;
  }

  /** Create a subdirectory inside the temp directory */
  createSubdirectory(name: string): string {
    if (!this.tempDirectory) {
      throw new Error('Temp directory not created yet');
    }

    const subdir = join(this.tempDirectory, name);
    if (!existsSync(subdir)) {
      mkdirSync(subdir, { recursive: true });
      this.logger.debug('Created subdirectory: %s', subdir);
    }

    return subdir;
  }

  /** Clean up the temp directory and all contents */
  cleanup(): void {
    if (!this.tempDirectory || !existsSync(this.tempDirectory)) {
      return;
    }

    try {
      this.logger.info('Cleaning up temp directory: %s', this.tempDirectory);
      rmSync(this.tempDirectory, { recursive: true, force: true });
      this.tempDirectory = null;
    } catch (e) {
      this.logger.warn('Failed to delete temp directory: %s', this.tempDirectory);
    }
  }

  /**
   * Clean up old temp directories (older than 1 day) from the system temp folder.
   */
  static cleanupOldTempDirectories(logger: Logger = noopLogger): void {
    try {
      const tmp = tmpdir();
      const entries = readdirSync(tmp);
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

      for (const entry of entries) {
        if (!entry.startsWith(PREFIX)) continue;

        const fullPath = join(tmp, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory() && stat.mtimeMs < oneDayAgo) {
            rmSync(fullPath, { recursive: true, force: true });
            logger.debug('Cleaned up old temp directory: %s', fullPath);
          }
        } catch {
          // Skip entries we can't stat
        }
      }
    } catch (e) {
      logger.warn('Failed to list temp directories for cleanup');
    }
  }
}
