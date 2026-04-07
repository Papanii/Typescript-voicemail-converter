/**
 * SHA-1 hashing for iOS backup file lookup — port of HashUtil.java.
 *
 * iOS backups store files using SHA-1 hashes of "domain-relativePath"
 * as their on-disk names. The first two hex characters form a subdirectory.
 */

import { createHash } from 'node:crypto';

/**
 * Calculate SHA-1 hash of a string.
 * @returns lowercase hex-encoded SHA-1 digest
 */
export function sha1(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

/**
 * Calculate the iOS backup file hash for a given domain and relative path.
 *
 * The hash is SHA-1 of `domain + "-" + relativePath`.
 * This is how iOS maps logical file paths to hashed filenames on disk.
 */
export function calculateBackupFileHash(domain: string, relativePath: string): string {
  const combined = `${domain}-${relativePath}`;
  return sha1(combined);
}

/**
 * Convert a hash to the backup file path structure: `{first2chars}/{hash}`.
 */
export function getBackupFilePath(hash: string): string {
  if (hash.length < 2) {
    throw new Error(`Hash too short: ${hash}`);
  }
  return `${hash.substring(0, 2)}/${hash}`;
}
