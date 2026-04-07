/**
 * Matches extracted audio files with voicemail metadata — port of FileMatcher.java.
 *
 * Uses three strategies in order:
 * 1. Match filename number against metadata remote_uid
 * 2. Match filename number against metadata ROWID
 * 3. Match 10-digit filename as Unix timestamp (+-5s tolerance)
 */

import type { VoicemailFile, VoicemailMetadata, Logger } from '../types.js';
import { noopLogger } from '../types.js';

/** Leading digits in filename: "1090.amr" -> "1090" */
const NUMERIC_PREFIX_PATTERN = /^(\d+)/;

/** Tolerance for timestamp matching: +-5 seconds */
const TIMESTAMP_TOLERANCE_MS = 5_000;

/** Intermediate type used during matching before metadata is assigned */
export interface VoicemailFileBuilder {
  fileId: string;
  domain: string | null;
  relativePath: string;
  backupFilePath: string;
  extractedPath: string;
  format: import('../types.js').AudioFormat;
  fileSize: number;
  originalFilename: string;
}

/**
 * Match audio files with metadata records, returning complete VoicemailFile objects.
 */
export function matchFilesWithMetadata(
  audioFiles: VoicemailFileBuilder[],
  metadataList: VoicemailMetadata[],
  logger: Logger = noopLogger,
): VoicemailFile[] {
  logger.info('Matching %d audio files with %d metadata records',
    audioFiles.length, metadataList.length);

  // Build lookup indexes
  const byRemoteUid = new Map<number, VoicemailMetadata>();
  const byRowId = new Map<number, VoicemailMetadata>();
  const unmatchedMetadata = new Set<VoicemailMetadata>(metadataList);

  for (const meta of metadataList) {
    if (meta.remoteUid > 0) {
      byRemoteUid.set(meta.remoteUid, meta);
    }
    if (meta.rowId > 0) {
      byRowId.set(meta.rowId, meta);
    }
  }

  const matched: VoicemailFile[] = [];

  for (const fileBuilder of audioFiles) {
    const filename = fileBuilder.originalFilename;
    const fileNumber = extractNumberFromFilename(filename);

    let bestMatch: VoicemailMetadata | null = null;

    if (fileNumber !== null) {
      // Strategy 1: Match against remote_uid
      const remoteMatch = byRemoteUid.get(fileNumber);
      if (remoteMatch && unmatchedMetadata.has(remoteMatch)) {
        bestMatch = remoteMatch;
        unmatchedMetadata.delete(remoteMatch);
        logger.debug('Matched %s by remote_uid=%d', filename, fileNumber);
      }

      // Strategy 2: Match against ROWID
      if (!bestMatch) {
        const rowIdMatch = byRowId.get(fileNumber);
        if (rowIdMatch && unmatchedMetadata.has(rowIdMatch)) {
          bestMatch = rowIdMatch;
          unmatchedMetadata.delete(rowIdMatch);
          logger.debug('Matched %s by ROWID=%d', filename, fileNumber);
        }
      }

      // Strategy 3: 10-digit Unix timestamp matching (+-5s tolerance)
      if (!bestMatch && fileNumber >= 1_000_000_000 && fileNumber <= 9_999_999_999) {
        const fileTimestampMs = fileNumber * 1000;
        bestMatch = findByTimestamp(fileTimestampMs, unmatchedMetadata);
        if (bestMatch) {
          unmatchedMetadata.delete(bestMatch);
          logger.debug('Matched %s by timestamp', filename);
        }
      }
    }

    if (!bestMatch) {
      logger.debug('No metadata match for: %s', filename);
    }

    matched.push({
      ...fileBuilder,
      metadata: bestMatch,
    });
  }

  const matchedCount = matched.filter((f) => f.metadata !== null).length;
  const unmatchedFileCount = matched.filter((f) => f.metadata === null).length;

  logger.info('Matching complete: %d matched, %d unmatched files, %d unmatched metadata',
    matchedCount, unmatchedFileCount, unmatchedMetadata.size);

  return matched;
}

function extractNumberFromFilename(filename: string): number | null {
  const match = NUMERIC_PREFIX_PATTERN.exec(filename);
  if (!match?.[1]) return null;

  const num = parseInt(match[1], 10);
  return isNaN(num) ? null : num;
}

function findByTimestamp(
  fileTimestampMs: number,
  metadataSet: Set<VoicemailMetadata>,
): VoicemailMetadata | null {
  let bestMatch: VoicemailMetadata | null = null;
  let bestDiff = Infinity;

  for (const metadata of metadataSet) {
    if (!metadata.receivedDate) continue;

    const diffMs = Math.abs(fileTimestampMs - metadata.receivedDate.getTime());

    if (diffMs <= TIMESTAMP_TOLERANCE_MS && diffMs < bestDiff) {
      bestMatch = metadata;
      bestDiff = diffMs;
    }
  }

  return bestMatch;
}

/**
 * Create synthetic metadata for unmatched files.
 */
export function createSyntheticMetadata(timestamp: Date): VoicemailMetadata {
  return {
    rowId: 0,
    remoteUid: 0,
    receivedDate: timestamp,
    callerNumber: 'Unknown',
    callbackNumber: null,
    durationSeconds: 0,
    expirationDate: null,
    trashedDate: null,
    flags: 0,
    isRead: false,
    isSpam: false,
  };
}
