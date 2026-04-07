/**
 * Discovers and selects iOS backups — port of BackupDiscovery.java.
 *
 * Enumerates backup directories, parses their plist files, and selects
 * the appropriate backup based on device ID or automatically (single backup).
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import type { BackupInfo, Logger } from '../types.js';
import { noopLogger } from '../types.js';
import { parseInfoPlist, parseManifestPlist } from './plist-parser.js';
import { validateBackup, checkBackupAge } from './backup-validator.js';
import { validateEncryption } from './encryption-handler.js';
import { BackupError } from '../errors.js';

/** UDID validation patterns — port of ValidationUtil.java */
const UDID_HEX_PATTERN = /^[0-9a-fA-F]{40}$/;
const UDID_UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const UDID_APPLE_UUID_PATTERN = /[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}/;

function isValidUdid(udid: string): boolean {
  return UDID_HEX_PATTERN.test(udid) ||
    UDID_UUID_PATTERN.test(udid) ||
    UDID_APPLE_UUID_PATTERN.test(udid);
}

/**
 * Get the default iOS backup directory for the current platform.
 */
export function getDefaultBackupDir(): string {
  const home = homedir();
  const os = platform();

  if (os === 'darwin') {
    return join(home, 'Library', 'Application Support', 'MobileSync', 'Backup');
  }
  if (os === 'win32') {
    const appData = process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming');
    return join(appData, 'Apple Computer', 'MobileSync', 'Backup');
  }
  // Linux — not officially supported by Apple but some tools put backups here
  return join(home, '.local', 'share', 'MobileSync', 'Backup');
}

/**
 * Discover all available iOS backups in a directory.
 */
export function discoverAllBackups(
  backupDir: string,
  logger: Logger = noopLogger,
): BackupInfo[] {
  logger.info('Discovering iOS backups in: %s', backupDir);

  if (!existsSync(backupDir)) {
    return [];
  }

  const backups: BackupInfo[] = [];
  let entries: string[];

  try {
    entries = readdirSync(backupDir);
  } catch (e) {
    throw new BackupError(
      `Failed to list backups in ${backupDir}`,
      'Check directory permissions',
      e instanceof Error ? e : undefined,
    );
  }

  for (const entry of entries) {
    const fullPath = join(backupDir, entry);

    try {
      const stat = statSync(fullPath);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }

    if (!isValidUdid(entry)) {
      logger.debug('Skipping non-backup directory: %s', entry);
      continue;
    }

    try {
      const backup = parseBackup(fullPath, logger);
      backups.push(backup);
      logger.debug('Found backup: %s', backup.deviceName ?? backup.udid);
    } catch (e) {
      logger.warn('Failed to parse backup at %s: %s', fullPath, e instanceof Error ? e.message : String(e));
    }
  }

  return backups;
}

/**
 * Discover and select a backup, then validate it.
 */
export function discoverBackup(
  backupDir: string,
  deviceId: string | undefined,
  logger: Logger = noopLogger,
): BackupInfo {
  const backups = discoverAllBackups(backupDir, logger);

  if (backups.length === 0) {
    throw new BackupError(
      `No iOS backups found in ${backupDir}`,
      [
        'Create an iOS backup via iTunes/Finder first:',
        '  1. Connect iPhone to computer',
        '  2. Open Finder (macOS) or iTunes (Windows)',
        "  3. Select device and click 'Back Up Now'",
        '  4. Wait for backup to complete',
        '  5. Try again',
      ].join('\n'),
    );
  }

  logger.info('Found %d backup(s)', backups.length);

  let selected: BackupInfo;

  if (deviceId) {
    const match = backups.find((b) => b.udid === deviceId);
    if (!match) {
      const available = backups
        .map((b) => `  - ${b.deviceName ?? 'Unknown'} (iOS ${b.productVersion ?? 'Unknown'}) [${b.udid}]`)
        .join('\n');
      throw new BackupError(
        `No backup found for device ID: ${deviceId}\n\nAvailable backups:\n${available}`,
        'Use one of the UDIDs shown above',
      );
    }
    selected = match;
  } else if (backups.length === 1) {
    selected = backups[0]!;
  } else {
    // Sort by date newest first
    const sorted = [...backups].sort((a, b) => {
      const da = a.lastBackupDate?.getTime() ?? 0;
      const db = b.lastBackupDate?.getTime() ?? 0;
      return db - da;
    });

    const list = sorted
      .map((b, i) => `${i + 1}. ${b.deviceName ?? 'Unknown'} (iOS ${b.productVersion ?? 'Unknown'}) - Last backup: ${b.lastBackupDate?.toISOString() ?? 'Unknown'} [${b.udid}]`)
      .join('\n');

    throw new BackupError(
      `Multiple backups found. Please specify device with deviceId option:\n\n${list}`,
    );
  }

  // Validate
  validateBackup(selected, logger);
  checkBackupAge(selected, logger);

  // Check encryption
  validateEncryption(selected, undefined, logger);

  logger.info('Selected backup: %s', selected.deviceName ?? selected.udid);
  return selected;
}

function parseBackup(backupPath: string, logger: Logger): BackupInfo {
  const infoPlist = join(backupPath, 'Info.plist');
  const manifestPlist = join(backupPath, 'Manifest.plist');

  if (!existsSync(infoPlist)) {
    throw new Error('Info.plist not found');
  }

  let partial = parseInfoPlist(infoPlist, backupPath, logger);

  if (existsSync(manifestPlist)) {
    return parseManifestPlist(manifestPlist, partial, logger);
  }

  return partial;
}
