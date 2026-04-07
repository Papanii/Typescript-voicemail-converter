import { describe, it, expect } from 'vitest';
import { matchFilesWithMetadata, createSyntheticMetadata } from '../../src/extractor/file-matcher.js';
import type { VoicemailFileBuilder } from '../../src/extractor/file-matcher.js';
import type { VoicemailMetadata } from '../../src/types.js';
import { AudioFormat } from '../../src/types.js';

function makeBuilder(overrides: Partial<VoicemailFileBuilder> = {}): VoicemailFileBuilder {
  return {
    fileId: 'abc123',
    domain: 'HomeDomain',
    relativePath: 'Library/Voicemail/1234.amr',
    backupFilePath: 'ab/abc123',
    extractedPath: '/tmp/audio/1234.amr',
    format: AudioFormat.AMR_NB,
    fileSize: 5000,
    originalFilename: '1234.amr',
    ...overrides,
  };
}

function makeMetadata(overrides: Partial<VoicemailMetadata> = {}): VoicemailMetadata {
  return {
    rowId: 1,
    remoteUid: 1234,
    receivedDate: new Date('2024-03-12T14:30:22.000Z'),
    callerNumber: '+12345678900',
    callbackNumber: null,
    durationSeconds: 30,
    expirationDate: null,
    trashedDate: null,
    flags: 0,
    isRead: false,
    isSpam: false,
    ...overrides,
  };
}

describe('file-matcher', () => {
  describe('matchFilesWithMetadata', () => {
    it('should match by remote_uid (strategy 1)', () => {
      const files = [makeBuilder({ originalFilename: '1234.amr' })];
      const metadata = [makeMetadata({ remoteUid: 1234 })];

      const result = matchFilesWithMetadata(files, metadata);

      expect(result).toHaveLength(1);
      expect(result[0]!.metadata).not.toBeNull();
      expect(result[0]!.metadata!.remoteUid).toBe(1234);
    });

    it('should match by ROWID (strategy 2)', () => {
      const files = [makeBuilder({ originalFilename: '5.amr' })];
      const metadata = [makeMetadata({ remoteUid: 999, rowId: 5 })];

      const result = matchFilesWithMetadata(files, metadata);

      expect(result).toHaveLength(1);
      expect(result[0]!.metadata).not.toBeNull();
      expect(result[0]!.metadata!.rowId).toBe(5);
    });

    it('should match by timestamp (strategy 3) within 5s tolerance', () => {
      // Unix timestamp 1710253822 = 2024-03-12T14:30:22Z
      const files = [makeBuilder({ originalFilename: '1710253822.amr' })];
      const metadata = [makeMetadata({
        remoteUid: 999,
        rowId: 999,
        receivedDate: new Date('2024-03-12T14:30:24.000Z'), // 2 seconds later
      })];

      const result = matchFilesWithMetadata(files, metadata);

      expect(result).toHaveLength(1);
      expect(result[0]!.metadata).not.toBeNull();
    });

    it('should NOT match by timestamp when difference > 5s', () => {
      const files = [makeBuilder({ originalFilename: '1710253822.amr' })];
      const metadata = [makeMetadata({
        remoteUid: 999,
        rowId: 999,
        receivedDate: new Date('2024-03-12T14:30:30.000Z'), // 8 seconds later
      })];

      const result = matchFilesWithMetadata(files, metadata);

      expect(result).toHaveLength(1);
      expect(result[0]!.metadata).toBeNull();
    });

    it('should not use timestamp matching for numbers < 10 digits', () => {
      const files = [makeBuilder({ originalFilename: '99999.amr' })];
      const metadata = [makeMetadata({ remoteUid: 0, rowId: 0 })];

      const result = matchFilesWithMetadata(files, metadata);

      expect(result).toHaveLength(1);
      expect(result[0]!.metadata).toBeNull();
    });

    it('should handle no metadata records', () => {
      const files = [makeBuilder()];
      const result = matchFilesWithMetadata(files, []);

      expect(result).toHaveLength(1);
      expect(result[0]!.metadata).toBeNull();
    });

    it('should handle no files', () => {
      const metadata = [makeMetadata()];
      const result = matchFilesWithMetadata([], metadata);
      expect(result).toHaveLength(0);
    });

    it('should not double-match metadata records', () => {
      const files = [
        makeBuilder({ fileId: 'a', originalFilename: '1234.amr' }),
        makeBuilder({ fileId: 'b', originalFilename: '1234.amr' }),
      ];
      const metadata = [makeMetadata({ remoteUid: 1234 })];

      const result = matchFilesWithMetadata(files, metadata);

      const matched = result.filter((f) => f.metadata !== null);
      expect(matched).toHaveLength(1);
    });

    it('should handle non-numeric filenames', () => {
      const files = [makeBuilder({ originalFilename: 'voicemail.amr' })];
      const metadata = [makeMetadata()];

      const result = matchFilesWithMetadata(files, metadata);

      expect(result).toHaveLength(1);
      expect(result[0]!.metadata).toBeNull();
    });
  });

  describe('createSyntheticMetadata', () => {
    it('should create metadata with the given timestamp', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      const meta = createSyntheticMetadata(date);

      expect(meta.receivedDate).toEqual(date);
      expect(meta.callerNumber).toBe('Unknown');
      expect(meta.durationSeconds).toBe(0);
      expect(meta.isRead).toBe(false);
      expect(meta.isSpam).toBe(false);
    });
  });
});
