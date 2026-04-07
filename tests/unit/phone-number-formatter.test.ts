import { describe, it, expect } from 'vitest';
import {
  normalizePhoneNumber,
  formatPhoneNumber,
  formatForFilename,
  getCallerDisplayName,
  isValidPhoneNumber,
} from '../../src/metadata/phone-number-formatter.js';

describe('phone-number-formatter', () => {
  describe('normalizePhoneNumber', () => {
    it('should return "Unknown" for null', () => {
      expect(normalizePhoneNumber(null)).toBe('Unknown');
    });

    it('should return "Unknown" for empty string', () => {
      expect(normalizePhoneNumber('')).toBe('Unknown');
    });

    it('should return "Unknown" for "Unknown" (case-insensitive)', () => {
      expect(normalizePhoneNumber('Unknown')).toBe('Unknown');
      expect(normalizePhoneNumber('unknown')).toBe('Unknown');
      expect(normalizePhoneNumber('UNKNOWN')).toBe('Unknown');
    });

    it('should keep E.164 format as-is', () => {
      expect(normalizePhoneNumber('+12345678900')).toBe('+12345678900');
    });

    it('should add +1 to 10-digit US numbers', () => {
      expect(normalizePhoneNumber('2345678900')).toBe('+12345678900');
    });

    it('should add + to 11-digit numbers starting with 1', () => {
      expect(normalizePhoneNumber('12345678900')).toBe('+12345678900');
    });

    it('should strip non-digit characters except +', () => {
      expect(normalizePhoneNumber('(234) 567-8900')).toBe('+12345678900');
    });

    it('should handle international numbers', () => {
      expect(normalizePhoneNumber('+44207123456')).toBe('+44207123456');
    });

    it('should add + prefix to numbers without it', () => {
      expect(normalizePhoneNumber('44207123456')).toBe('+44207123456');
    });

    it('should handle numbers with dashes and spaces', () => {
      expect(normalizePhoneNumber('1-234-567-8900')).toBe('+12345678900');
    });

    it('should return "Unknown" for non-numeric input', () => {
      expect(normalizePhoneNumber('abc')).toBe('Unknown');
    });

    it('should handle + appearing multiple times', () => {
      expect(normalizePhoneNumber('+1+234+5678900')).toBe('+12345678900');
    });
  });

  describe('formatPhoneNumber', () => {
    it('should return "Unknown" for null', () => {
      expect(formatPhoneNumber(null)).toBe('Unknown');
    });

    it('should format US numbers as +1-234-567-8900', () => {
      expect(formatPhoneNumber('+12345678900')).toBe('+1-234-567-8900');
    });

    it('should format +1XXXXXXXXXX as +1-XXX-XXX-XXXX', () => {
      const result = formatPhoneNumber('+12345678900');
      // US format: substring(0,2) + "-" + substring(2,5) + "-" + substring(5,8) + "-" + substring(8)
      expect(result).toBe('+1-234-567-8900');
    });

    it('should return short numbers as-is', () => {
      expect(formatPhoneNumber('+1234')).toBe('+1234');
    });

    it('should format international numbers generically', () => {
      const result = formatPhoneNumber('+442071234567');
      // countryCode = "+44", rest = "2071234567"
      // "+44-207-123-4567"
      expect(result).toBe('+44-207-123-4567');
    });
  });

  describe('formatForFilename', () => {
    it('should return "Unknown" for null', () => {
      expect(formatForFilename(null)).toBe('Unknown');
    });

    it('should return digits and + only', () => {
      expect(formatForFilename('+12345678900')).toBe('+12345678900');
    });

    it('should normalize first then clean', () => {
      expect(formatForFilename('(234) 567-8900')).toBe('+12345678900');
    });

    it('should limit length to 20 characters', () => {
      const result = formatForFilename('+12345678901234567890123');
      expect(result.length).toBeLessThanOrEqual(20);
    });
  });

  describe('getCallerDisplayName', () => {
    it('should return "Unknown" for null', () => {
      expect(getCallerDisplayName(null)).toBe('Unknown');
    });

    it('should return "Unknown" for "Unknown"', () => {
      expect(getCallerDisplayName('Unknown')).toBe('Unknown');
    });

    it('should format the phone number for display', () => {
      const result = getCallerDisplayName('+12345678900');
      expect(result).toBe('+1-234-567-8900');
    });
  });

  describe('isValidPhoneNumber', () => {
    it('should return false for null', () => {
      expect(isValidPhoneNumber(null)).toBe(false);
    });

    it('should return false for "Unknown"', () => {
      expect(isValidPhoneNumber('Unknown')).toBe(false);
    });

    it('should return true for valid E.164 numbers', () => {
      expect(isValidPhoneNumber('+12345678900')).toBe(true);
    });

    it('should return true for 10-digit US numbers (normalizes to E.164)', () => {
      expect(isValidPhoneNumber('2345678900')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isValidPhoneNumber('')).toBe(false);
    });
  });
});
