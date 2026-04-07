/**
 * Formats and normalizes phone numbers — port of PhoneNumberFormatter.java.
 */

const E164_PATTERN = /^\+[1-9]\d{1,14}$/;

/**
 * Normalize phone number to E.164 format if possible.
 */
export function normalizePhoneNumber(phoneNumber: string | null): string {
  if (!phoneNumber || phoneNumber.length === 0) {
    return 'Unknown';
  }

  if (phoneNumber.toLowerCase() === 'unknown') {
    return 'Unknown';
  }

  // Remove all non-digit characters except +
  let cleaned = phoneNumber.replace(/[^0-9+]/g, '');

  if (cleaned.length === 0) {
    return 'Unknown';
  }

  // Already in E.164 format
  if (cleaned.startsWith('+')) {
    // Ensure + is only at start
    cleaned = '+' + cleaned.replace(/\+/g, '');
    return cleaned;
  }

  // Try to add US country code
  if (cleaned.length === 10) {
    return '+1' + cleaned;
  }

  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return '+' + cleaned;
  }

  // Return as-is with + prefix
  return '+' + cleaned;
}

/**
 * Format phone number for display (E.164 -> formatted).
 */
export function formatPhoneNumber(phoneNumber: string | null): string {
  if (!phoneNumber || phoneNumber.length === 0) {
    return 'Unknown';
  }

  if (phoneNumber.toLowerCase() === 'unknown') {
    return 'Unknown';
  }

  // US format: +1-234-567-8900
  if (phoneNumber.startsWith('+1') && phoneNumber.length === 12) {
    return (
      phoneNumber.substring(0, 2) + '-' +
      phoneNumber.substring(2, 5) + '-' +
      phoneNumber.substring(5, 8) + '-' +
      phoneNumber.substring(8)
    );
  }

  // International format: +XX-XXX-XXX-XXXX (generic)
  if (phoneNumber.startsWith('+') && phoneNumber.length > 5) {
    const countryCode = phoneNumber.substring(0, 3);
    const rest = phoneNumber.substring(3);

    if (rest.length > 6) {
      return (
        countryCode + '-' +
        rest.substring(0, 3) + '-' +
        rest.substring(3, 6) + '-' +
        rest.substring(6)
      );
    }
  }

  return phoneNumber;
}

/**
 * Format phone number for filename (safe for filesystem).
 */
export function formatForFilename(phoneNumber: string | null): string {
  const normalized = normalizePhoneNumber(phoneNumber);

  if (normalized === 'Unknown') {
    return 'Unknown';
  }

  // Remove all non-digit/non-+ characters
  let safe = normalized.replace(/[^0-9+]/g, '');

  // Limit length
  if (safe.length > 20) {
    safe = safe.substring(0, 20);
  }

  return safe;
}

/**
 * Get caller display name (formatted phone number or "Unknown").
 */
export function getCallerDisplayName(phoneNumber: string | null): string {
  if (!phoneNumber || phoneNumber.length === 0) {
    return 'Unknown';
  }

  if (phoneNumber.toLowerCase() === 'unknown') {
    return 'Unknown';
  }

  return formatPhoneNumber(phoneNumber);
}

/**
 * Check if phone number is valid (E.164 format after normalization).
 */
export function isValidPhoneNumber(phoneNumber: string | null): boolean {
  if (!phoneNumber || phoneNumber.length === 0) {
    return false;
  }

  if (phoneNumber.toLowerCase() === 'unknown') {
    return false;
  }

  const normalized = normalizePhoneNumber(phoneNumber);
  return E164_PATTERN.test(normalized);
}
