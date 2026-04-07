/**
 * Main orchestrator for metadata processing — port of MetadataProcessor.java.
 */

import type { VoicemailFile, ProcessedMetadata, Logger } from '../types.js';
import { noopLogger } from '../types.js';
import { buildMetadataMap, formatMetadataForLogging } from './metadata-embedder.js';
import { exportMetadata } from './json-exporter.js';

/**
 * Process metadata for a voicemail file.
 */
export function processMetadata(
  voicemailFile: VoicemailFile,
  deviceName: string | null,
  iosVersion: string | null,
  backupDate: Date | null,
  logger: Logger = noopLogger,
): ProcessedMetadata {
  logger.debug('Processing metadata for: %s', voicemailFile.originalFilename);

  const wavMetadata = buildMetadataMap(voicemailFile, deviceName, logger);

  const processed: ProcessedMetadata = {
    voicemailFile,
    wavMetadata,
    deviceName,
    iosVersion,
    backupDate,
  };

  logger.debug('Processed metadata: %s', formatMetadataForLogging(wavMetadata));
  return processed;
}

/**
 * Export metadata to a JSON file.
 */
export function exportMetadataToJSON(
  metadata: ProcessedMetadata,
  outputPath: string,
  logger: Logger = noopLogger,
): void {
  logger.info('Exporting metadata to JSON: %s', outputPath);

  exportMetadata(
    metadata.voicemailFile,
    outputPath,
    metadata.deviceName,
    metadata.iosVersion,
    metadata.backupDate,
    logger,
  );
}
