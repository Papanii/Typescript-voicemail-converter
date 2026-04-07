/**
 * Reads iOS Manifest.db (SQLite file catalog) — port of ManifestDbReader.java.
 *
 * Manifest.db contains a Files table that maps logical iOS file paths to
 * SHA-1 hashes used as on-disk filenames in the backup.
 */

import Database from 'better-sqlite3';
import { join } from 'node:path';
import type { ManifestFileInfo, Logger } from '../types.js';
import { noopLogger } from '../types.js';

export class ManifestDbReader {
  private db: Database.Database | null = null;
  private readonly manifestDbPath: string;
  private readonly logger: Logger;

  constructor(backupPath: string, logger: Logger = noopLogger) {
    this.manifestDbPath = join(backupPath, 'Manifest.db');
    this.logger = logger;
  }

  /** Open connection to Manifest.db */
  open(): void {
    this.logger.debug('Opening Manifest.db: %s', this.manifestDbPath);
    this.db = new Database(this.manifestDbPath, { readonly: true });
  }

  /** Close connection */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.logger.debug('Closed Manifest.db connection');
    }
  }

  /**
   * Query voicemail.db file info using fallback query strategy.
   * Tries most specific query first, falls back to broader patterns.
   */
  queryVoicemailDbFile(): ManifestFileInfo | null {
    this.logger.info('Querying voicemail.db from Manifest.db');
    this.ensureOpen();

    const queries = [
      // Most specific — exact match (iOS 10+)
      "SELECT fileID, domain, relativePath FROM Files WHERE domain = 'HomeDomain' AND relativePath = 'Library/Voicemail/voicemail.db'",
      // Pattern match on path with directory
      "SELECT fileID, domain, relativePath FROM Files WHERE relativePath LIKE '%/Voicemail/voicemail.db'",
      // Broad match — last resort
      "SELECT fileID, domain, relativePath FROM Files WHERE relativePath LIKE '%voicemail.db'",
    ];

    for (const sql of queries) {
      const row = this.db!.prepare(sql).get() as { fileID: string; domain: string; relativePath: string } | undefined;
      if (row) {
        this.logger.info('Found voicemail.db: domain=%s, relativePath=%s, fileID=%s',
          row.domain, row.relativePath, row.fileID);
        return { fileId: row.fileID, domain: row.domain, relativePath: row.relativePath };
      }
    }

    this.logger.warn('voicemail.db not found in Manifest.db');

    // Debug: list sample .db files
    const samples = this.db!.prepare(
      "SELECT fileID, domain, relativePath FROM Files WHERE relativePath LIKE '%.db' LIMIT 10",
    ).all() as { fileID: string; domain: string; relativePath: string }[];

    this.logger.debug('Sample .db files in backup:');
    for (const s of samples) {
      this.logger.debug('  %s: %s', s.domain, s.relativePath);
    }

    return null;
  }

  /**
   * Query AddressBook.sqlitedb file info for contact lookup.
   */
  queryAddressBookFile(): ManifestFileInfo | null {
    this.logger.info('Querying AddressBook.sqlitedb from Manifest.db');
    this.ensureOpen();

    const queries = [
      "SELECT fileID, domain, relativePath FROM Files WHERE domain = 'HomeDomain' AND relativePath = 'Library/AddressBook/AddressBook.sqlitedb'",
      "SELECT fileID, domain, relativePath FROM Files WHERE relativePath LIKE '%AddressBook/AddressBook.sqlitedb'",
    ];

    for (const sql of queries) {
      const row = this.db!.prepare(sql).get() as { fileID: string; domain: string; relativePath: string } | undefined;
      if (row) {
        this.logger.info('Found AddressBook: domain=%s, relativePath=%s, fileID=%s',
          row.domain, row.relativePath, row.fileID);
        return { fileId: row.fileID, domain: row.domain, relativePath: row.relativePath };
      }
    }

    this.logger.info('AddressBook.sqlitedb not found in backup');
    return null;
  }

  /**
   * Query all voicemail audio files (.amr, .awb, .m4a) using fallback strategy.
   */
  queryVoicemailFiles(): ManifestFileInfo[] {
    this.logger.info('Querying voicemail files from Manifest.db');
    this.ensureOpen();

    // Try most specific query first — HomeDomain with Library/Voicemail/ path (iOS 10+)
    let files = this.db!.prepare(
      `SELECT fileID, domain, relativePath FROM Files
       WHERE domain = 'HomeDomain'
         AND relativePath LIKE 'Library/Voicemail/%'
         AND (relativePath LIKE '%.amr'
              OR relativePath LIKE '%.awb'
              OR relativePath LIKE '%.m4a')
       ORDER BY relativePath`,
    ).all() as { fileID: string; domain: string; relativePath: string }[];

    // Fallback: any path containing /Voicemail/ with audio extensions
    if (files.length === 0) {
      this.logger.info('No files found with HomeDomain/Library/Voicemail/, trying fallback...');
      files = this.db!.prepare(
        `SELECT fileID, domain, relativePath FROM Files
         WHERE relativePath LIKE '%/Voicemail/%'
           AND (relativePath LIKE '%.amr'
                OR relativePath LIKE '%.awb'
                OR relativePath LIKE '%.m4a')
         ORDER BY relativePath`,
      ).all() as { fileID: string; domain: string; relativePath: string }[];
    }

    const result: ManifestFileInfo[] = files.map((f) => ({
      fileId: f.fileID,
      domain: f.domain,
      relativePath: f.relativePath,
    }));

    this.logger.info('Found %d voicemail audio files', result.length);

    if (result.length === 0) {
      this.logger.warn('No voicemail audio files found with any query pattern');

      // Debug info
      const countRow = this.db!.prepare(
        "SELECT COUNT(*) as cnt FROM Files WHERE relativePath LIKE '%.amr' OR relativePath LIKE '%.awb' OR relativePath LIKE '%.m4a'",
      ).get() as { cnt: number } | undefined;
      this.logger.info('Total audio files (.amr/.awb/.m4a) in backup: %d', countRow?.cnt ?? 0);
    }

    return result;
  }

  /** List all files in voicemail-related domains (debug) */
  listLibraryVoicemailFiles(): ManifestFileInfo[] {
    this.ensureOpen();

    const rows = this.db!.prepare(
      "SELECT fileID, domain, relativePath FROM Files WHERE domain LIKE '%Voicemail%' ORDER BY relativePath",
    ).all() as { fileID: string; domain: string; relativePath: string }[];

    this.logger.info('Found %d files in voicemail-related domains', rows.length);
    return rows.map((r) => ({ fileId: r.fileID, domain: r.domain, relativePath: r.relativePath }));
  }

  private ensureOpen(): void {
    if (!this.db) {
      throw new Error('ManifestDbReader not opened; call open() first');
    }
  }
}
