/**
 * Handles encrypted iOS backup detection and validation — port of EncryptionHandler.java.
 *
 * Detects encrypted backups and provides clear error messages.
 * Actual decryption of encrypted backup data is not yet implemented.
 */

import type { BackupInfo, Logger } from '../types.js';
import { noopLogger } from '../types.js';
import { EncryptionError } from '../errors.js';

/**
 * Check if a backup is encrypted and validate that it can be accessed.
 *
 * @throws EncryptionError if the backup is encrypted
 */
export function validateEncryption(
  backup: BackupInfo,
  backupPassword: string | undefined,
  logger: Logger = noopLogger,
): void {
  if (!backup.isEncrypted) {
    logger.debug('Backup is not encrypted, no password required');
    return;
  }

  logger.info('Backup is encrypted: %s', backup.deviceName ?? backup.udid);

  const passwordProvided = !!backupPassword && backupPassword.length > 0;

  if (!passwordProvided) {
    throw new EncryptionError(false);
  }

  // Password was provided for an encrypted backup.
  // Actual decryption is not yet implemented.
  logger.warn('Encrypted backup decryption is not yet implemented');
  throw new EncryptionError(true);
}
