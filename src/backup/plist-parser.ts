/**
 * Parser for Apple plist files (Info.plist, Manifest.plist) — port of PlistParser.java.
 *
 * iOS backups contain both binary and XML plist files. This module tries
 * binary parsing first (via bplist-parser), then falls back to XML (via plist).
 */

import { readFileSync } from 'node:fs';
import bplistParser from 'bplist-parser';
import plist from 'plist';
import type { BackupInfo, Logger } from '../types.js';
import { noopLogger } from '../types.js';

type PlistDict = Record<string, unknown>;

/**
 * Parse a plist file, trying binary format first, then XML.
 */
export function parsePlist(filePath: string, logger: Logger = noopLogger): PlistDict {
  const buffer = readFileSync(filePath);

  // Try binary plist first
  try {
    const parsed = bplistParser.parseBuffer(buffer);
    if (parsed && parsed.length > 0) {
      return parsed[0] as PlistDict;
    }
  } catch {
    logger.debug('Not a binary plist, trying XML: %s', filePath);
  }

  // Fall back to XML plist
  try {
    const xml = buffer.toString('utf-8');
    return plist.parse(xml) as PlistDict;
  } catch (e) {
    throw new Error(`Failed to parse plist file: ${filePath}`);
  }
}

/**
 * Parse Info.plist and extract device information into a partial BackupInfo.
 */
export function parseInfoPlist(
  infoPlistPath: string,
  backupPath: string,
  logger: Logger = noopLogger,
): Omit<BackupInfo, 'isEncrypted'> & { isEncrypted: boolean } {
  logger.debug('Parsing Info.plist: %s', infoPlistPath);

  const dict = parsePlist(infoPlistPath, logger);

  const udid =
    getStringField(dict, 'Unique Identifier') ??
    getStringField(dict, 'UDID') ??
    backupPath.split('/').pop() ??
    'unknown';

  const lastBackupDateRaw = dict['Last Backup Date'];
  let lastBackupDate: Date | null = null;
  if (lastBackupDateRaw instanceof Date) {
    lastBackupDate = lastBackupDateRaw;
  } else if (typeof lastBackupDateRaw === 'string') {
    const parsed = new Date(lastBackupDateRaw);
    if (!isNaN(parsed.getTime())) {
      lastBackupDate = parsed;
    }
  }

  return {
    udid,
    deviceName: getStringField(dict, 'Device Name'),
    displayName: getStringField(dict, 'Display Name'),
    productType: getStringField(dict, 'Product Type'),
    productVersion: getStringField(dict, 'Product Version'),
    serialNumber: getStringField(dict, 'Serial Number'),
    phoneNumber: getStringField(dict, 'Phone Number'),
    lastBackupDate,
    isEncrypted: false,
    backupPath,
  };
}

/**
 * Parse Manifest.plist to extract encryption status and backup date.
 */
export function parseManifestPlist(
  manifestPlistPath: string,
  partial: Omit<BackupInfo, 'isEncrypted'> & { isEncrypted: boolean },
  logger: Logger = noopLogger,
): BackupInfo {
  logger.debug('Parsing Manifest.plist: %s', manifestPlistPath);

  const dict = parsePlist(manifestPlistPath, logger);

  let isEncrypted = partial.isEncrypted;
  if ('IsEncrypted' in dict) {
    const val = dict['IsEncrypted'];
    isEncrypted = val === true || val === 'true' || val === 1;
    logger.debug('Backup encrypted: %s', isEncrypted);
  }

  let lastBackupDate = partial.lastBackupDate;
  if (!lastBackupDate && 'Date' in dict) {
    const dateVal = dict['Date'];
    if (dateVal instanceof Date) {
      lastBackupDate = dateVal;
    }
  }

  return {
    ...partial,
    isEncrypted,
    lastBackupDate,
  };
}

/**
 * Check if a plist file is valid (parseable).
 */
export function isValidPlist(filePath: string, logger: Logger = noopLogger): boolean {
  try {
    parsePlist(filePath, logger);
    return true;
  } catch {
    logger.warn('Invalid plist file: %s', filePath);
    return false;
  }
}

function getStringField(dict: PlistDict, key: string): string | null {
  const val = dict[key];
  if (typeof val === 'string' && val.length > 0) {
    return val;
  }
  if (val !== null && val !== undefined) {
    return String(val);
  }
  return null;
}
