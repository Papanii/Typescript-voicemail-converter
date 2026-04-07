/**
 * Detects FFmpeg and ffprobe installation — port of FFmpegDetector.java.
 */

import { execFileSync } from 'node:child_process';
import type { Logger } from '../types.js';
import { noopLogger } from '../types.js';
import { DependencyError } from '../errors.js';

const VERSION_PATTERN = /version\s+([0-9.]+)/;

export interface FFmpegInfo {
  ffmpegPath: string;
  ffprobePath: string;
  ffmpegVersion: string | null;
  ffprobeVersion: string | null;
}

/**
 * Detect FFmpeg and ffprobe installation.
 * @throws DependencyError if either binary is not found
 */
export function detectFFmpeg(logger: Logger = noopLogger): FFmpegInfo {
  logger.info('Detecting FFmpeg installation');

  const ffmpegPath = 'ffmpeg';
  const ffprobePath = 'ffprobe';

  const ffmpegVersion = detectBinary(ffmpegPath, logger);
  if (ffmpegVersion === null) {
    throw new DependencyError('ffmpeg', 'FFmpeg not found in PATH');
  }

  const ffprobeVersion = detectBinary(ffprobePath, logger);
  if (ffprobeVersion === null) {
    throw new DependencyError('ffprobe', 'ffprobe not found in PATH');
  }

  logger.info('FFmpeg detected: version %s', ffmpegVersion);
  logger.info('ffprobe detected: version %s', ffprobeVersion);

  return { ffmpegPath, ffprobePath, ffmpegVersion, ffprobeVersion };
}

/**
 * Check FFmpeg availability without throwing.
 */
export function checkFFmpegAvailability(logger: Logger = noopLogger): {
  available: boolean;
  ffmpegVersion: string | null;
  ffprobeVersion: string | null;
} {
  const ffmpegVersion = detectBinary('ffmpeg', logger);
  const ffprobeVersion = detectBinary('ffprobe', logger);

  return {
    available: ffmpegVersion !== null && ffprobeVersion !== null,
    ffmpegVersion,
    ffprobeVersion,
  };
}

function detectBinary(binaryPath: string, logger: Logger): string | null {
  try {
    const output = execFileSync(binaryPath, ['-version'], {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const firstLine = output.split('\n')[0] ?? '';
    const match = VERSION_PATTERN.exec(firstLine);
    if (match?.[1]) {
      logger.debug('Found %s version: %s', binaryPath, match[1]);
      return match[1];
    }

    return 'unknown';
  } catch (e) {
    logger.warn('%s not detected: %s', binaryPath, e instanceof Error ? e.message : String(e));
    return null;
  }
}
