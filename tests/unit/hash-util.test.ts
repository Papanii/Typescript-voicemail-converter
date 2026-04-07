import { describe, it, expect } from 'vitest';
import { sha1, calculateBackupFileHash, getBackupFilePath } from '../../src/util/hash-util.js';

describe('hash-util', () => {
  describe('sha1', () => {
    it('should compute correct SHA-1 hash', () => {
      // Known SHA-1 hash of empty string
      expect(sha1('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    });

    it('should compute correct SHA-1 for "hello"', () => {
      expect(sha1('hello')).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
    });

    it('should return lowercase hex string', () => {
      const result = sha1('test');
      expect(result).toMatch(/^[0-9a-f]{40}$/);
    });
  });

  describe('calculateBackupFileHash', () => {
    it('should combine domain and relativePath with dash separator', () => {
      const hash = calculateBackupFileHash('HomeDomain', 'Library/Voicemail/voicemail.db');
      // SHA-1 of "HomeDomain-Library/Voicemail/voicemail.db"
      expect(hash).toBe(sha1('HomeDomain-Library/Voicemail/voicemail.db'));
    });

    it('should produce 40-character hex string', () => {
      const hash = calculateBackupFileHash('HomeDomain', 'Library/Voicemail/1234.amr');
      expect(hash).toHaveLength(40);
      expect(hash).toMatch(/^[0-9a-f]{40}$/);
    });

    it('should produce different hashes for different paths', () => {
      const hash1 = calculateBackupFileHash('HomeDomain', 'Library/Voicemail/1.amr');
      const hash2 = calculateBackupFileHash('HomeDomain', 'Library/Voicemail/2.amr');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getBackupFilePath', () => {
    it('should use first 2 chars as directory', () => {
      expect(getBackupFilePath('abcdef1234567890')).toBe('ab/abcdef1234567890');
    });

    it('should handle exact 2-char hash', () => {
      expect(getBackupFilePath('ab')).toBe('ab/ab');
    });

    it('should throw for hash shorter than 2 chars', () => {
      expect(() => getBackupFilePath('a')).toThrow('Hash too short');
    });

    it('should throw for empty hash', () => {
      expect(() => getBackupFilePath('')).toThrow('Hash too short');
    });

    it('should work with full SHA-1 hash', () => {
      const hash = sha1('test');
      const path = getBackupFilePath(hash);
      expect(path).toBe(`${hash.substring(0, 2)}/${hash}`);
    });
  });
});
