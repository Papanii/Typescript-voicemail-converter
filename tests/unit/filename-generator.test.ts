import { describe, it, expect } from 'vitest';
import {
  generateWavFilename,
  generateJsonFilename,
  generateOriginalFilename,
  generateUniqueFilename,
} from '../../src/output/filename-generator.js';
import { AudioFormat } from '../../src/types.js';
import type { VoicemailFile, VoicemailMetadata } from '../../src/types.js';

function makeVoicemailFile(overrides: Partial<VoicemailFile> = {}): VoicemailFile {
  return {
    fileId: 'abc123',
    domain: 'HomeDomain',
    relativePath: 'Library/Voicemail/1234.amr',
    backupFilePath: 'ab/abc123',
    extractedPath: '/tmp/audio/1234.amr',
    metadata: null,
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

describe('filename-generator', () => {
  describe('generateWavFilename', () => {
    it('should generate filename from metadata', () => {
      const file = makeVoicemailFile({ metadata: makeMetadata() });
      const filename = generateWavFilename(file);
      // Should contain date, time, and caller info
      expect(filename).toMatch(/^\d{8}-\d{6}-.+\.wav$/);
    });

    it('should fall back to original filename when no metadata', () => {
      const file = makeVoicemailFile();
      const filename = generateWavFilename(file);
      expect(filename).toBe('1234.wav');
    });

    it('should return "Unknown_Voicemail.wav" when no metadata and no filename', () => {
      const file = makeVoicemailFile({ originalFilename: '' });
      const filename = generateWavFilename(file);
      expect(filename).toBe('Unknown_Voicemail.wav');
    });

    it('should sanitize caller info in filename', () => {
      const meta = makeMetadata({ callerNumber: '(234) 567-8900' });
      const file = makeVoicemailFile({ metadata: meta });
      const filename = generateWavFilename(file);
      // Should not contain parentheses or spaces
      expect(filename).not.toMatch(/[() ]/);
      expect(filename).toMatch(/\.wav$/);
    });

    it('should use Unknown_Caller for unknown caller', () => {
      const meta = makeMetadata({ callerNumber: null });
      const file = makeVoicemailFile({ metadata: meta });
      const filename = generateWavFilename(file);
      expect(filename).toContain('Unknown_Caller');
    });
  });

  describe('generateJsonFilename', () => {
    it('should generate .json extension', () => {
      const file = makeVoicemailFile({ metadata: makeMetadata() });
      const filename = generateJsonFilename(file);
      expect(filename).toMatch(/\.json$/);
    });
  });

  describe('generateOriginalFilename', () => {
    it('should use the specified extension', () => {
      const file = makeVoicemailFile({ metadata: makeMetadata() });
      const filename = generateOriginalFilename(file, 'amr');
      expect(filename).toMatch(/\.amr$/);
    });

    it('should handle extension with leading dot', () => {
      const file = makeVoicemailFile({ metadata: makeMetadata() });
      const filename = generateOriginalFilename(file, '.amr');
      expect(filename).toMatch(/\.amr$/);
    });
  });

  describe('generateUniqueFilename', () => {
    it('should return base filename when no collision', () => {
      const existing = new Set<string>();
      expect(generateUniqueFilename('test.wav', existing)).toBe('test.wav');
    });

    it('should add numeric suffix on collision', () => {
      const existing = new Set(['test.wav']);
      expect(generateUniqueFilename('test.wav', existing)).toBe('test-1.wav');
    });

    it('should increment suffix until unique', () => {
      const existing = new Set(['test.wav', 'test-1.wav', 'test-2.wav']);
      expect(generateUniqueFilename('test.wav', existing)).toBe('test-3.wav');
    });

    it('should handle filenames without extension', () => {
      const existing = new Set(['test']);
      expect(generateUniqueFilename('test', existing)).toBe('test-1');
    });

    it('should preserve extension across suffixes', () => {
      const existing = new Set(['file.json']);
      const result = generateUniqueFilename('file.json', existing);
      expect(result).toBe('file-1.json');
    });
  });
});
