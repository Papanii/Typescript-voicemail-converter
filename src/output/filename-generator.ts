/**
 * Generates safe, descriptive filenames — port of FilenameGenerator.java.
 *
 * Filename format: {YYYYMMDD}-{HHMMSS}-{caller}.{extension}
 */

import type { VoicemailFile, VoicemailMetadata } from '../types.js';
import { formatForFilename } from '../metadata/phone-number-formatter.js';

/** Maximum filename length (excluding extension) */
const MAX_FILENAME_LENGTH = 200;

/** Pattern for safe filename characters */
const UNSAFE_CHARS = /[^a-zA-Z0-9_\-+]/g;

/**
 * Generate a WAV filename from voicemail metadata.
 */
export function generateWavFilename(voicemailFile: VoicemailFile): string {
  if (!voicemailFile.metadata) {
    const filename = voicemailFile.originalFilename;
    if (filename) {
      const baseFilename = filename.replace(/\.[^.]+$/, '');
      return sanitizeForFilename(baseFilename) + '.wav';
    }
    return 'Unknown_Voicemail.wav';
  }

  return generateFilename(voicemailFile.metadata, 'wav');
}

/**
 * Generate a JSON metadata filename.
 */
export function generateJsonFilename(voicemailFile: VoicemailFile): string {
  if (!voicemailFile.metadata) {
    const filename = voicemailFile.originalFilename;
    if (filename) {
      const baseFilename = filename.replace(/\.[^.]+$/, '');
      return sanitizeForFilename(baseFilename) + '.json';
    }
    return 'Unknown_Voicemail.json';
  }

  return generateFilename(voicemailFile.metadata, 'json');
}

/**
 * Generate a filename for the original audio file.
 */
export function generateOriginalFilename(
  voicemailFile: VoicemailFile,
  originalExtension: string,
): string {
  const ext = originalExtension.startsWith('.') ? originalExtension.substring(1) : originalExtension;

  if (!voicemailFile.metadata) {
    const filename = voicemailFile.originalFilename;
    if (filename) {
      const baseFilename = filename.replace(/\.[^.]+$/, '');
      return sanitizeForFilename(baseFilename) + '.' + ext;
    }
    return 'Unknown_Voicemail.' + ext;
  }

  return generateFilename(voicemailFile.metadata, ext);
}

/**
 * Generate a unique filename, handling collisions with numeric suffix (-1, -2, ...).
 */
export function generateUniqueFilename(
  baseFilename: string,
  existingNames: Set<string>,
): string {
  if (!existingNames.has(baseFilename)) {
    return baseFilename;
  }

  const dotIndex = baseFilename.lastIndexOf('.');
  const nameWithoutExt = dotIndex > 0 ? baseFilename.substring(0, dotIndex) : baseFilename;
  const extension = dotIndex > 0 ? baseFilename.substring(dotIndex) : '';

  // Try suffixes -1, -2, ... up to 1000
  for (let i = 1; i <= 1000; i++) {
    const candidate = `${nameWithoutExt}-${i}${extension}`;
    if (!existingNames.has(candidate)) {
      return candidate;
    }
  }

  // Fallback to timestamp suffix
  return `${nameWithoutExt}-${Date.now()}${extension}`;
}

function generateFilename(metadata: VoicemailMetadata, extension: string): string {
  let receivedDate = metadata.receivedDate;
  if (!receivedDate) {
    receivedDate = new Date();
  }

  const datePart = formatDate(receivedDate);
  const timePart = formatTime(receivedDate);
  const callerPart = sanitizeCallerInfo(metadata);

  let filename = `${datePart}-${timePart}-${callerPart}.${extension}`;

  // Truncate if too long
  if (filename.length > MAX_FILENAME_LENGTH) {
    const truncateLength = MAX_FILENAME_LENGTH - extension.length - 1;
    filename = filename.substring(0, truncateLength) + '.' + extension;
  }

  return filename;
}

function formatDate(timestamp: Date): string {
  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, '0');
  const day = String(timestamp.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function formatTime(timestamp: Date): string {
  const hours = String(timestamp.getHours()).padStart(2, '0');
  const minutes = String(timestamp.getMinutes()).padStart(2, '0');
  const seconds = String(timestamp.getSeconds()).padStart(2, '0');
  return `${hours}${minutes}${seconds}`;
}

function sanitizeCallerInfo(metadata: VoicemailMetadata): string {
  let callerInfo: string | null = null;

  if (metadata.callerNumber && metadata.callerNumber.length > 0) {
    callerInfo = formatForFilename(metadata.callerNumber);
  }

  if (!callerInfo || callerInfo.length === 0 || callerInfo === 'Unknown') {
    callerInfo = 'Unknown_Caller';
  }

  // Replace unsafe characters
  let sanitized = callerInfo.replace(UNSAFE_CHARS, '_');

  // Remove leading/trailing underscores
  sanitized = sanitized.replace(/^_+|_+$/g, '');

  // Collapse multiple underscores
  sanitized = sanitized.replace(/_+/g, '_');

  if (sanitized.length === 0) {
    sanitized = 'Unknown_Caller';
  }

  return sanitized;
}

function sanitizeForFilename(input: string): string {
  if (!input || input.length === 0) {
    return 'Unknown';
  }

  let sanitized = input.replace(UNSAFE_CHARS, '_');
  sanitized = sanitized.replace(/^_+|_+$/g, '');
  sanitized = sanitized.replace(/_+/g, '_');

  if (sanitized.length === 0) {
    sanitized = 'Unknown';
  }

  return sanitized;
}
