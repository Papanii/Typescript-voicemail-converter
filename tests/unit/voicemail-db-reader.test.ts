import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { VoicemailDbReader } from '../../src/extractor/voicemail-db-reader.js';

let tempDir: string;
let dbPath: string;

function createVoicemailDb(entries: {
  remote_uid: number;
  date: number;
  sender: string | null;
  callback_num: string | null;
  duration: number;
  expiration: number;
  trashed_date: number;
  flags: number;
}[]): void {
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE voicemail (
    ROWID INTEGER PRIMARY KEY AUTOINCREMENT,
    remote_uid INTEGER,
    date INTEGER,
    sender TEXT,
    callback_num TEXT,
    duration INTEGER,
    expiration INTEGER,
    trashed_date INTEGER,
    flags INTEGER
  )`);

  const insert = db.prepare(
    'INSERT INTO voicemail (remote_uid, date, sender, callback_num, duration, expiration, trashed_date, flags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const e of entries) {
    insert.run(e.remote_uid, e.date, e.sender, e.callback_num, e.duration, e.expiration, e.trashed_date, e.flags);
  }
  db.close();
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'voicemail-db-test-'));
  dbPath = join(tempDir, 'voicemail.db');
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('VoicemailDbReader', () => {
  describe('readAllMetadata', () => {
    it('should read voicemail records', () => {
      createVoicemailDb([
        { remote_uid: 100, date: 1710253822, sender: '+12345678900', callback_num: null, duration: 30, expiration: 0, trashed_date: 0, flags: 0 },
      ]);

      const reader = new VoicemailDbReader(dbPath);
      reader.open();
      try {
        const records = reader.readAllMetadata(false);
        expect(records).toHaveLength(1);
        expect(records[0]!.remoteUid).toBe(100);
        expect(records[0]!.callerNumber).toBe('+12345678900');
        expect(records[0]!.durationSeconds).toBe(30);
      } finally {
        reader.close();
      }
    });

    it('should exclude trashed voicemails by default', () => {
      createVoicemailDb([
        { remote_uid: 1, date: 1710253822, sender: '+1111', callback_num: null, duration: 10, expiration: 0, trashed_date: 0, flags: 0 },
        { remote_uid: 2, date: 1710253823, sender: '+2222', callback_num: null, duration: 20, expiration: 0, trashed_date: 1710253900, flags: 0 },
      ]);

      const reader = new VoicemailDbReader(dbPath);
      reader.open();
      try {
        const records = reader.readAllMetadata(false);
        expect(records).toHaveLength(1);
        expect(records[0]!.remoteUid).toBe(1);
      } finally {
        reader.close();
      }
    });

    it('should include trashed voicemails when requested', () => {
      createVoicemailDb([
        { remote_uid: 1, date: 1710253822, sender: '+1111', callback_num: null, duration: 10, expiration: 0, trashed_date: 0, flags: 0 },
        { remote_uid: 2, date: 1710253823, sender: '+2222', callback_num: null, duration: 20, expiration: 0, trashed_date: 1710253900, flags: 0 },
      ]);

      const reader = new VoicemailDbReader(dbPath);
      reader.open();
      try {
        const records = reader.readAllMetadata(true);
        expect(records).toHaveLength(2);
      } finally {
        reader.close();
      }
    });

    it('should parse flags correctly (bit 0 = read, bit 2 = spam)', () => {
      createVoicemailDb([
        { remote_uid: 1, date: 1710253822, sender: '+1111', callback_num: null, duration: 10, expiration: 0, trashed_date: 0, flags: 1 },  // read
        { remote_uid: 2, date: 1710253823, sender: '+2222', callback_num: null, duration: 20, expiration: 0, trashed_date: 0, flags: 4 },  // spam
        { remote_uid: 3, date: 1710253824, sender: '+3333', callback_num: null, duration: 30, expiration: 0, trashed_date: 0, flags: 5 },  // read + spam
      ]);

      const reader = new VoicemailDbReader(dbPath);
      reader.open();
      try {
        const records = reader.readAllMetadata(false);
        expect(records).toHaveLength(3);

        // Sort by remoteUid for consistent testing
        records.sort((a, b) => a.remoteUid - b.remoteUid);

        expect(records[0]!.isRead).toBe(true);
        expect(records[0]!.isSpam).toBe(false);

        expect(records[1]!.isRead).toBe(false);
        expect(records[1]!.isSpam).toBe(true);

        expect(records[2]!.isRead).toBe(true);
        expect(records[2]!.isSpam).toBe(true);
      } finally {
        reader.close();
      }
    });

    it('should convert Unix timestamps to Date objects', () => {
      createVoicemailDb([
        { remote_uid: 1, date: 1710253822, sender: null, callback_num: null, duration: 0, expiration: 1710340222, trashed_date: 0, flags: 0 },
      ]);

      const reader = new VoicemailDbReader(dbPath);
      reader.open();
      try {
        const records = reader.readAllMetadata(false);
        expect(records[0]!.receivedDate).toBeInstanceOf(Date);
        expect(records[0]!.receivedDate!.getTime()).toBe(1710253822000);
        expect(records[0]!.expirationDate).toBeInstanceOf(Date);
        expect(records[0]!.expirationDate!.getTime()).toBe(1710340222000);
      } finally {
        reader.close();
      }
    });

    it('should return null for zero timestamps', () => {
      createVoicemailDb([
        { remote_uid: 1, date: 0, sender: null, callback_num: null, duration: 0, expiration: 0, trashed_date: 0, flags: 0 },
      ]);

      const reader = new VoicemailDbReader(dbPath);
      reader.open();
      try {
        const records = reader.readAllMetadata(false);
        expect(records[0]!.receivedDate).toBeNull();
        expect(records[0]!.expirationDate).toBeNull();
        expect(records[0]!.trashedDate).toBeNull();
      } finally {
        reader.close();
      }
    });
  });

  describe('isValidVoicemailDb', () => {
    it('should return true for valid voicemail.db', () => {
      createVoicemailDb([]);
      expect(VoicemailDbReader.isValidVoicemailDb(dbPath)).toBe(true);
    });

    it('should return false for database without voicemail table', () => {
      const db = new Database(dbPath);
      db.exec('CREATE TABLE other_table (id INTEGER)');
      db.close();
      expect(VoicemailDbReader.isValidVoicemailDb(dbPath)).toBe(false);
    });

    it('should return false for non-existent file', () => {
      expect(VoicemailDbReader.isValidVoicemailDb('/nonexistent/path.db')).toBe(false);
    });
  });
});
