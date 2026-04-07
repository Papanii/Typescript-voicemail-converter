import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { validateBackup, checkBackupAge } from '../../src/backup/backup-validator.js';
import { BackupError } from '../../src/errors.js';
import type { BackupInfo } from '../../src/types.js';

let tempDir: string;

function makeBackup(overrides: Partial<BackupInfo> = {}): BackupInfo {
  return {
    udid: 'test-udid-1234567890abcdef1234567890abcdef12345678',
    deviceName: 'Test iPhone',
    displayName: null,
    productType: null,
    productVersion: '17.0',
    serialNumber: null,
    phoneNumber: null,
    lastBackupDate: new Date(),
    isEncrypted: false,
    backupPath: tempDir,
    ...overrides,
  };
}

function createValidBackupStructure(): void {
  // Create required plist files (minimal valid binary plist)
  // Using XML plist format for simplicity
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Test</key>
  <string>Value</string>
</dict>
</plist>`;

  writeFileSync(join(tempDir, 'Info.plist'), plistContent);
  writeFileSync(join(tempDir, 'Manifest.plist'), plistContent);

  // Create valid Manifest.db
  const db = new Database(join(tempDir, 'Manifest.db'));
  db.exec('CREATE TABLE Files (fileID TEXT, domain TEXT, relativePath TEXT, file BLOB, flags INTEGER)');
  db.exec("INSERT INTO Files VALUES ('abc', 'HomeDomain', 'test.txt', NULL, 0)");
  db.close();
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'backup-validator-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('backup-validator', () => {
  describe('validateBackup', () => {
    it('should pass for a valid backup', () => {
      createValidBackupStructure();
      const backup = makeBackup();
      expect(() => validateBackup(backup)).not.toThrow();
    });

    it('should throw BackupError when Info.plist is missing', () => {
      createValidBackupStructure();
      rmSync(join(tempDir, 'Info.plist'));
      const backup = makeBackup();
      expect(() => validateBackup(backup)).toThrow(BackupError);
    });

    it('should throw BackupError when Manifest.plist is missing', () => {
      createValidBackupStructure();
      rmSync(join(tempDir, 'Manifest.plist'));
      const backup = makeBackup();
      expect(() => validateBackup(backup)).toThrow(BackupError);
    });

    it('should throw BackupError when Manifest.db is missing', () => {
      createValidBackupStructure();
      rmSync(join(tempDir, 'Manifest.db'));
      const backup = makeBackup();
      expect(() => validateBackup(backup)).toThrow(BackupError);
    });

    it('should throw BackupError when Manifest.db is corrupted', () => {
      createValidBackupStructure();
      writeFileSync(join(tempDir, 'Manifest.db'), 'not a sqlite database');
      const backup = makeBackup();
      expect(() => validateBackup(backup)).toThrow(BackupError);
    });

    it('should throw BackupError when Manifest.db has empty Files table', () => {
      createValidBackupStructure();
      rmSync(join(tempDir, 'Manifest.db'));
      const db = new Database(join(tempDir, 'Manifest.db'));
      db.exec('CREATE TABLE Files (fileID TEXT, domain TEXT, relativePath TEXT)');
      db.close();
      const backup = makeBackup();
      expect(() => validateBackup(backup)).toThrow(BackupError);
    });

    it('should throw BackupError for iOS version < 7', () => {
      createValidBackupStructure();
      const backup = makeBackup({ productVersion: '6.1.4' });
      expect(() => validateBackup(backup)).toThrow(BackupError);
    });

    it('should pass for iOS 7.0', () => {
      createValidBackupStructure();
      const backup = makeBackup({ productVersion: '7.0' });
      expect(() => validateBackup(backup)).not.toThrow();
    });

    it('should pass when iOS version is unknown', () => {
      createValidBackupStructure();
      const backup = makeBackup({ productVersion: null });
      expect(() => validateBackup(backup)).not.toThrow();
    });
  });

  describe('checkBackupAge', () => {
    it('should not throw for recent backups', () => {
      const backup = makeBackup({ lastBackupDate: new Date() });
      expect(() => checkBackupAge(backup)).not.toThrow();
    });

    it('should not throw for null backup date', () => {
      const backup = makeBackup({ lastBackupDate: null });
      expect(() => checkBackupAge(backup)).not.toThrow();
    });

    it('should not throw for old backups (only warns)', () => {
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
      const backup = makeBackup({ lastBackupDate: oldDate });
      expect(() => checkBackupAge(backup)).not.toThrow();
    });
  });
});
