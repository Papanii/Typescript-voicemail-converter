import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { ManifestDbReader } from '../../src/extractor/manifest-db-reader.js';

let tempDir: string;

function createManifestDb(entries: { fileID: string; domain: string; relativePath: string }[]): void {
  const dbPath = join(tempDir, 'Manifest.db');
  const db = new Database(dbPath);
  db.exec('CREATE TABLE Files (fileID TEXT, domain TEXT, relativePath TEXT, file BLOB, flags INTEGER)');

  const insert = db.prepare('INSERT INTO Files (fileID, domain, relativePath) VALUES (?, ?, ?)');
  for (const entry of entries) {
    insert.run(entry.fileID, entry.domain, entry.relativePath);
  }
  db.close();
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'manifest-db-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('ManifestDbReader', () => {
  describe('queryVoicemailDbFile', () => {
    it('should find voicemail.db with exact HomeDomain match', () => {
      createManifestDb([
        { fileID: 'abc123', domain: 'HomeDomain', relativePath: 'Library/Voicemail/voicemail.db' },
      ]);

      const reader = new ManifestDbReader(tempDir);
      reader.open();
      try {
        const result = reader.queryVoicemailDbFile();
        expect(result).not.toBeNull();
        expect(result!.fileId).toBe('abc123');
        expect(result!.domain).toBe('HomeDomain');
      } finally {
        reader.close();
      }
    });

    it('should find voicemail.db with fallback pattern', () => {
      createManifestDb([
        { fileID: 'def456', domain: 'OtherDomain', relativePath: 'some/path/Voicemail/voicemail.db' },
      ]);

      const reader = new ManifestDbReader(tempDir);
      reader.open();
      try {
        const result = reader.queryVoicemailDbFile();
        expect(result).not.toBeNull();
        expect(result!.fileId).toBe('def456');
      } finally {
        reader.close();
      }
    });

    it('should return null when no voicemail.db exists', () => {
      createManifestDb([
        { fileID: 'xyz', domain: 'HomeDomain', relativePath: 'Library/other.db' },
      ]);

      const reader = new ManifestDbReader(tempDir);
      reader.open();
      try {
        const result = reader.queryVoicemailDbFile();
        expect(result).toBeNull();
      } finally {
        reader.close();
      }
    });
  });

  describe('queryVoicemailFiles', () => {
    it('should find AMR files in HomeDomain/Library/Voicemail/', () => {
      createManifestDb([
        { fileID: 'a1', domain: 'HomeDomain', relativePath: 'Library/Voicemail/1234.amr' },
        { fileID: 'a2', domain: 'HomeDomain', relativePath: 'Library/Voicemail/5678.amr' },
        { fileID: 'a3', domain: 'HomeDomain', relativePath: 'Library/Voicemail/voicemail.db' },
      ]);

      const reader = new ManifestDbReader(tempDir);
      reader.open();
      try {
        const files = reader.queryVoicemailFiles();
        expect(files).toHaveLength(2);
        expect(files.map((f) => f.fileId)).toContain('a1');
        expect(files.map((f) => f.fileId)).toContain('a2');
      } finally {
        reader.close();
      }
    });

    it('should find AWB and M4A files', () => {
      createManifestDb([
        { fileID: 'b1', domain: 'HomeDomain', relativePath: 'Library/Voicemail/1.awb' },
        { fileID: 'b2', domain: 'HomeDomain', relativePath: 'Library/Voicemail/2.m4a' },
      ]);

      const reader = new ManifestDbReader(tempDir);
      reader.open();
      try {
        const files = reader.queryVoicemailFiles();
        expect(files).toHaveLength(2);
      } finally {
        reader.close();
      }
    });

    it('should use fallback query when no HomeDomain files found', () => {
      createManifestDb([
        { fileID: 'c1', domain: 'Other', relativePath: 'path/Voicemail/1.amr' },
      ]);

      const reader = new ManifestDbReader(tempDir);
      reader.open();
      try {
        const files = reader.queryVoicemailFiles();
        expect(files).toHaveLength(1);
        expect(files[0]!.fileId).toBe('c1');
      } finally {
        reader.close();
      }
    });

    it('should return empty array when no voicemail audio files exist', () => {
      createManifestDb([
        { fileID: 'd1', domain: 'HomeDomain', relativePath: 'Library/Photos/photo.jpg' },
      ]);

      const reader = new ManifestDbReader(tempDir);
      reader.open();
      try {
        const files = reader.queryVoicemailFiles();
        expect(files).toHaveLength(0);
      } finally {
        reader.close();
      }
    });
  });

  describe('queryAddressBookFile', () => {
    it('should find AddressBook.sqlitedb', () => {
      createManifestDb([
        { fileID: 'ab1', domain: 'HomeDomain', relativePath: 'Library/AddressBook/AddressBook.sqlitedb' },
      ]);

      const reader = new ManifestDbReader(tempDir);
      reader.open();
      try {
        const result = reader.queryAddressBookFile();
        expect(result).not.toBeNull();
        expect(result!.fileId).toBe('ab1');
      } finally {
        reader.close();
      }
    });

    it('should return null when no AddressBook exists', () => {
      createManifestDb([]);

      const reader = new ManifestDbReader(tempDir);
      reader.open();
      try {
        const result = reader.queryAddressBookFile();
        expect(result).toBeNull();
      } finally {
        reader.close();
      }
    });
  });
});
