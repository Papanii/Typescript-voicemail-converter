/**
 * Validates iOS backup integrity and completeness — port of BackupValidator.java.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { BackupInfo, Logger } from '../types.js';
import { noopLogger } from '../types.js';
import { BackupError } from '../errors.js';
import { isValidPlist } from './plist-parser.js';

/**
 * Validate backup directory structure, files, and database integrity.
 */
export function validateBackup(backup: BackupInfo, logger: Logger = noopLogger): void {
  logger.debug('Validating backup: %s', backup.backupPath);

  validateRequiredFiles(backup);
  validateManifestDatabase(backup, logger);
  validateIOSVersion(backup, logger);
  checkBackupComplete(backup, logger);

  logger.info('Backup validation successful: %s', backup.deviceName ?? backup.udid);
}

function validateRequiredFiles(backup: BackupInfo): void {
  const requiredFiles = ['Info.plist', 'Manifest.plist', 'Manifest.db'];

  for (const filename of requiredFiles) {
    const filePath = join(backup.backupPath, filename);
    if (!existsSync(filePath)) {
      throw new BackupError(
        `Required file missing: ${filename}`,
        'Backup may be corrupted. Create a new backup.',
      );
    }
  }
}

function validateManifestDatabase(backup: BackupInfo, logger: Logger): void {
  const manifestDb = join(backup.backupPath, 'Manifest.db');

  let db: Database.Database | null = null;
  try {
    db = new Database(manifestDb, { readonly: true });
    const row = db.prepare('SELECT COUNT(*) as cnt FROM Files').get() as { cnt: number } | undefined;
    const fileCount = row?.cnt ?? 0;

    logger.debug('Manifest.db contains %d files', fileCount);

    if (fileCount === 0) {
      throw new BackupError(
        'Manifest database is empty',
        'Backup may be incomplete. Create a new backup.',
      );
    }
  } catch (e) {
    if (e instanceof BackupError) throw e;
    throw new BackupError(
      'Manifest database is corrupted or invalid',
      'Create a new backup.',
      e instanceof Error ? e : undefined,
    );
  } finally {
    db?.close();
  }
}

function validateIOSVersion(backup: BackupInfo, logger: Logger): void {
  const version = backup.productVersion;

  if (!version) {
    logger.warn('iOS version unknown, skipping version check');
    return;
  }

  try {
    const parts = version.split('.');
    const majorVersion = parseInt(parts[0] ?? '0', 10);

    if (majorVersion < 7) {
      throw new BackupError(
        `iOS version ${version} is too old`,
        'Voicemail backup is only supported on iOS 7.0 and later',
      );
    }

    logger.debug('iOS version %s is compatible', version);
  } catch (e) {
    if (e instanceof BackupError) throw e;
    logger.warn('Could not parse iOS version: %s', version);
  }
}

function checkBackupComplete(backup: BackupInfo, logger: Logger): void {
  const statusPlist = join(backup.backupPath, 'Status.plist');

  if (!existsSync(statusPlist)) {
    logger.debug('Status.plist not found, assuming backup is complete');
    return;
  }

  try {
    if (!isValidPlist(statusPlist, logger)) {
      throw new BackupError(
        'Status.plist is corrupted',
        'Backup may be incomplete. Create a new backup.',
      );
    }
    logger.debug('Backup appears complete');
  } catch (e) {
    if (e instanceof BackupError) throw e;
    logger.warn('Could not validate Status.plist');
  }
}

/**
 * Estimate backup age and log warnings if old.
 */
export function checkBackupAge(backup: BackupInfo, logger: Logger = noopLogger): void {
  if (!backup.lastBackupDate) {
    logger.warn('Backup date unknown');
    return;
  }

  const daysSinceBackup = Math.floor(
    (Date.now() - backup.lastBackupDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysSinceBackup > 30) {
    logger.warn(
      'Backup is %d days old. Voicemails after %s will not be included.',
      daysSinceBackup,
      backup.lastBackupDate.toISOString().split('T')[0],
    );
  } else if (daysSinceBackup > 7) {
    logger.info(
      'Backup is %d days old (%s)',
      daysSinceBackup,
      backup.lastBackupDate.toISOString().split('T')[0],
    );
  }
}
