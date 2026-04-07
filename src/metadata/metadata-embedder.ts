/**
 * Embeds metadata into WAV files using FFmpeg — port of MetadataEmbedder.java.
 *
 * Builds a metadata map that FFmpeg uses as -metadata key=value arguments
 * during audio conversion.
 */

import type { VoicemailFile, Logger } from '../types.js';
import { noopLogger } from '../types.js';
import { normalizePhoneNumber, getCallerDisplayName } from './phone-number-formatter.js';

const VERSION = '1.0.0';

/**
 * Build metadata map for FFmpeg embedding.
 */
export function buildMetadataMap(
  voicemailFile: VoicemailFile,
  deviceName: string | null,
  logger: Logger = noopLogger,
): Record<string, string> {
  const metadata: Record<string, string> = {};

  if (!voicemailFile.metadata) {
    logger.debug('No metadata available for %s', voicemailFile.originalFilename);
    return metadata;
  }

  const vm = voicemailFile.metadata;

  // Title: Caller display name
  metadata['title'] = getCallerDisplayName(vm.callerNumber);

  // Artist: Normalized phone number
  metadata['artist'] = normalizePhoneNumber(vm.callerNumber);

  // Date: Received date
  if (vm.receivedDate) {
    const year = vm.receivedDate.getFullYear();
    const month = String(vm.receivedDate.getMonth() + 1).padStart(2, '0');
    const day = String(vm.receivedDate.getDate()).padStart(2, '0');
    metadata['date'] = `${year}-${month}-${day}`;
  }

  // Comment: Comprehensive metadata
  metadata['comment'] = buildCommentString(vm, deviceName);

  // Encoded by: Tool information
  metadata['encoded_by'] = `iOS Voicemail Converter v${VERSION}`;

  logger.debug('Built metadata map with %d entries', Object.keys(metadata).length);
  return metadata;
}

function buildCommentString(
  metadata: NonNullable<VoicemailFile['metadata']>,
  deviceName: string | null,
): string {
  const parts: string[] = [];

  // Duration
  parts.push(`Duration: ${metadata.durationSeconds}s`);

  // Received date
  if (metadata.receivedDate) {
    const dateStr = formatTimestampForDisplay(metadata.receivedDate);
    parts.push(`Received: ${dateStr}`);
  }

  // Device
  if (deviceName) {
    parts.push(`Device: ${deviceName}`);
  }

  let comment = parts.join(', ');

  // Status flags
  if (metadata.isSpam) {
    comment += ' [SPAM]';
  }
  if (metadata.isRead) {
    comment += ' [Read]';
  }

  return comment;
}

function formatTimestampForDisplay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Format metadata for logging.
 */
export function formatMetadataForLogging(metadata: Record<string, string>): string {
  const entries = Object.entries(metadata);
  if (entries.length === 0) {
    return 'No metadata';
  }
  return 'Metadata: ' + entries.map(([k, v]) => `${k}=${v}`).join(', ');
}
