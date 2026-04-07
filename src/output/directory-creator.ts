/**
 * Creates date-based directory structure — port of DirectoryCreator.java.
 *
 * Directory format: {baseDir}/{YYYY-MM-DD}/
 */

import { existsSync, mkdirSync, accessSync, constants as fsConstants } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '../types.js';
import { noopLogger } from '../types.js';
import { PermissionError } from '../errors.js';

/**
 * Create a date-based subdirectory for a given timestamp.
 */
export function createDateDirectory(
  baseDir: string,
  timestamp: Date,
  logger: Logger = noopLogger,
): string {
  const dateString = formatDateForDirectory(timestamp);
  const dateDir = join(baseDir, dateString);

  try {
    if (!existsSync(dateDir)) {
      mkdirSync(dateDir, { recursive: true });
      logger.info('Created date directory: %s', dateDir);
    } else {
      logger.debug('Date directory already exists: %s', dateDir);
    }
    return dateDir;
  } catch (e) {
    logger.error('Failed to create date directory: %s', dateDir);
    throw new PermissionError(dateDir, 'WRITE');
  }
}

/**
 * Ensure base output directories exist and are writable.
 */
export function ensureBaseDirectoriesExist(
  wavOutputDir: string,
  backupDir: string | null,
  logger: Logger = noopLogger,
): void {
  createAndValidateDirectory(wavOutputDir, 'WAV output', logger);

  if (backupDir) {
    createAndValidateDirectory(backupDir, 'backup', logger);
  }
}

function createAndValidateDirectory(
  directory: string,
  description: string,
  logger: Logger,
): void {
  try {
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
      logger.info('Created %s directory: %s', description, directory);
    }

    // Verify directory is writable
    try {
      accessSync(directory, fsConstants.W_OK);
    } catch {
      logger.error('%s directory is not writable: %s', description, directory);
      throw new PermissionError(directory, 'WRITE');
    }

    logger.debug('%s directory verified: %s', description, directory);
  } catch (e) {
    if (e instanceof PermissionError) throw e;
    logger.error('Failed to create %s directory: %s', description, directory);
    throw new PermissionError(directory, 'WRITE');
  }
}

function formatDateForDirectory(timestamp: Date): string {
  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, '0');
  const day = String(timestamp.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
