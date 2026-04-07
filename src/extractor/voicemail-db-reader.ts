/**
 * Reads voicemail.db (voicemail metadata database) — port of VoicemailDbReader.java.
 *
 * The voicemail table stores metadata for each voicemail including caller info,
 * timestamps, duration, and status flags.
 */

import Database from 'better-sqlite3';
import type { VoicemailMetadata, Logger } from '../types.js';
import { noopLogger } from '../types.js';

export class VoicemailDbReader {
  private db: Database.Database | null = null;
  private readonly dbPath: string;
  private readonly logger: Logger;

  constructor(voicemailDbPath: string, logger: Logger = noopLogger) {
    this.dbPath = voicemailDbPath;
    this.logger = logger;
  }

  /** Open connection to voicemail.db */
  open(): void {
    this.logger.debug('Opening voicemail.db: %s', this.dbPath);
    this.db = new Database(this.dbPath, { readonly: true });
  }

  /** Close connection */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.logger.debug('Closed voicemail.db connection');
    }
  }

  /**
   * Read all voicemail metadata records.
   *
   * @param includeTrashed whether to include trashed voicemails
   */
  readAllMetadata(includeTrashed: boolean): VoicemailMetadata[] {
    this.logger.info('Reading voicemail metadata (includeTrashed=%s)', includeTrashed);
    this.ensureOpen();

    let sql = `SELECT ROWID, remote_uid, date, sender, callback_num,
                      duration, expiration, trashed_date, flags
               FROM voicemail `;

    if (!includeTrashed) {
      sql += 'WHERE (trashed_date IS NULL OR trashed_date = 0) ';
    }

    sql += 'ORDER BY date DESC';

    const rows = this.db!.prepare(sql).all() as {
      ROWID: number;
      remote_uid: number;
      date: number;
      sender: string | null;
      callback_num: string | null;
      duration: number;
      expiration: number;
      trashed_date: number;
      flags: number;
    }[];

    const result: VoicemailMetadata[] = rows.map((row) => {
      const dateUnix = row.date;
      const receivedDate = dateUnix > 0 ? new Date(dateUnix * 1000) : null;
      const expirationDate = row.expiration > 0 ? new Date(row.expiration * 1000) : null;
      const trashedDate = row.trashed_date > 0 ? new Date(row.trashed_date * 1000) : null;
      const flags = row.flags ?? 0;

      return {
        rowId: row.ROWID,
        remoteUid: row.remote_uid,
        receivedDate,
        callerNumber: row.sender,
        callbackNumber: row.callback_num,
        durationSeconds: row.duration ?? 0,
        expirationDate,
        trashedDate,
        flags,
        isRead: (flags & 0x01) !== 0,
        isSpam: (flags & 0x04) !== 0,
      };
    });

    this.logger.info('Read %d voicemail metadata records', result.length);
    return result;
  }

  /**
   * Check if a database file is a valid voicemail.db (has voicemail table).
   */
  static isValidVoicemailDb(dbPath: string, logger: Logger = noopLogger): boolean {
    let db: Database.Database | null = null;
    try {
      db = new Database(dbPath, { readonly: true });
      const row = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='voicemail'",
      ).get();
      return !!row;
    } catch (e) {
      logger.warn('Invalid voicemail.db: %s', dbPath);
      return false;
    } finally {
      db?.close();
    }
  }

  private ensureOpen(): void {
    if (!this.db) {
      throw new Error('VoicemailDbReader not opened; call open() first');
    }
  }
}
