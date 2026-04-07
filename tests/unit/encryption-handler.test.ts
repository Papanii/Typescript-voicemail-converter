import { describe, it, expect } from 'vitest';
import { validateEncryption } from '../../src/backup/encryption-handler.js';
import { EncryptionError } from '../../src/errors.js';
import type { BackupInfo } from '../../src/types.js';

function makeBackup(overrides: Partial<BackupInfo> = {}): BackupInfo {
  return {
    udid: 'test-udid',
    deviceName: 'Test iPhone',
    displayName: null,
    productType: null,
    productVersion: '17.0',
    serialNumber: null,
    phoneNumber: null,
    lastBackupDate: new Date(),
    isEncrypted: false,
    backupPath: '/fake/path',
    ...overrides,
  };
}

describe('encryption-handler', () => {
  it('should pass for unencrypted backups', () => {
    const backup = makeBackup({ isEncrypted: false });
    expect(() => validateEncryption(backup, undefined)).not.toThrow();
  });

  it('should throw EncryptionError for encrypted backup without password', () => {
    const backup = makeBackup({ isEncrypted: true });
    expect(() => validateEncryption(backup, undefined)).toThrow(EncryptionError);
  });

  it('should set passwordProvided=false when no password given', () => {
    const backup = makeBackup({ isEncrypted: true });
    try {
      validateEncryption(backup, undefined);
    } catch (e) {
      expect(e).toBeInstanceOf(EncryptionError);
      expect((e as EncryptionError).passwordProvided).toBe(false);
    }
  });

  it('should throw EncryptionError for encrypted backup with password (decryption not implemented)', () => {
    const backup = makeBackup({ isEncrypted: true });
    expect(() => validateEncryption(backup, 'mypassword')).toThrow(EncryptionError);
  });

  it('should set passwordProvided=true when password given', () => {
    const backup = makeBackup({ isEncrypted: true });
    try {
      validateEncryption(backup, 'mypassword');
    } catch (e) {
      expect(e).toBeInstanceOf(EncryptionError);
      expect((e as EncryptionError).passwordProvided).toBe(true);
    }
  });

  it('should have exit code 4', () => {
    const backup = makeBackup({ isEncrypted: true });
    try {
      validateEncryption(backup, undefined);
    } catch (e) {
      expect((e as EncryptionError).code).toBe(4);
    }
  });

  it('should treat empty password same as no password', () => {
    const backup = makeBackup({ isEncrypted: true });
    try {
      validateEncryption(backup, '');
    } catch (e) {
      expect((e as EncryptionError).passwordProvided).toBe(false);
    }
  });
});
