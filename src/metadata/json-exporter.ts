/**
 * Exports voicemail metadata as JSON files — port of JSONExporter.java.
 */

import { writeFileSync } from 'node:fs';
import type { VoicemailFile, Logger } from '../types.js';
import { AUDIO_FORMAT_DESCRIPTIONS } from '../types.js';
import { noopLogger } from '../types.js';
import { normalizePhoneNumber, getCallerDisplayName } from './phone-number-formatter.js';

const VERSION = '1.0.0';

/**
 * Export voicemail metadata to a JSON file.
 */
export function exportMetadata(
  voicemailFile: VoicemailFile,
  outputPath: string,
  deviceName: string | null,
  iosVersion: string | null,
  backupDate: Date | null,
  logger: Logger = noopLogger,
): void {
  logger.debug('Exporting metadata to: %s', outputPath);

  const json = buildJSON(voicemailFile, deviceName, iosVersion, backupDate);
  writeFileSync(outputPath, json, 'utf-8');

  logger.debug('Exported %d bytes', json.length);
}

function buildJSON(
  file: VoicemailFile,
  deviceName: string | null,
  iosVersion: string | null,
  backupDate: Date | null,
): string {
  const meta = file.metadata;

  const phoneNumber = meta ? normalizePhoneNumber(meta.callerNumber) : 'Unknown';
  const displayName = meta ? getCallerDisplayName(meta.callerNumber) : 'Unknown';
  const callbackNumber = meta?.callbackNumber
    ? normalizePhoneNumber(meta.callbackNumber)
    : null;

  const obj = {
    voicemail: {
      caller: {
        phoneNumber,
        displayName,
        callbackNumber,
      },
      timestamps: {
        received: meta?.receivedDate?.toISOString() ?? null,
        expiration: meta?.expirationDate?.toISOString() ?? null,
        extracted: new Date().toISOString(),
      },
      duration: {
        databaseSeconds: meta?.durationSeconds ?? 0,
        actualMilliseconds: 0,
      },
      status: {
        isRead: meta?.isRead ?? false,
        isSpam: meta?.isSpam ?? false,
        wasDeleted: meta?.trashedDate !== null && meta?.trashedDate !== undefined,
      },
      audio: {
        originalFilename: file.originalFilename,
        originalFormat: AUDIO_FORMAT_DESCRIPTIONS[file.format],
        originalSizeBytes: file.fileSize,
        convertedFormat: 'WAV',
        sampleRate: 0,
        bitRate: 0,
        channels: 1,
      },
      device: {
        name: deviceName,
        model: null,
        iosVersion,
      },
      backup: {
        date: backupDate?.toISOString() ?? null,
        path: null,
      },
      conversion: {
        toolVersion: VERSION,
        date: new Date().toISOString(),
        outputFilename: null,
      },
    },
  };

  return JSON.stringify(obj, null, 2) + '\n';
}
