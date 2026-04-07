/**
 * Wrapper for FFmpeg command execution — port of FFmpegWrapper.java.
 *
 * Executes FFmpeg to convert audio files to WAV format (44.1kHz mono PCM s16le)
 * with optional metadata embedding.
 */

import { execFileSync } from 'node:child_process';
import type { Logger } from '../types.js';
import { noopLogger } from '../types.js';
import { ConversionError } from '../errors.js';

/**
 * Convert an audio file to WAV format using FFmpeg.
 *
 * @returns conversion time in milliseconds
 * @throws ConversionError if FFmpeg conversion fails
 */
export function convertToWav(
  ffmpegPath: string,
  inputFile: string,
  outputFile: string,
  metadata: Record<string, string>,
  logger: Logger = noopLogger,
): number {
  logger.info('Converting: %s -> %s', inputFile, outputFile);

  const startTime = Date.now();

  const command = buildConversionCommand(ffmpegPath, inputFile, outputFile, metadata);
  logger.debug('FFmpeg command: %s', command.join(' '));

  try {
    execFileSync(command[0]!, command.slice(1), {
      encoding: 'utf-8',
      timeout: 120_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const conversionTimeMs = Date.now() - startTime;
    logger.info('Conversion completed in %dms', conversionTimeMs);
    return conversionTimeMs;
  } catch (e) {
    const stderr = (e as { stderr?: string }).stderr ?? '';
    const errorMsg = extractErrorFromOutput(stderr);

    logger.error('FFmpeg conversion failed: %s', errorMsg);

    throw new ConversionError(
      inputFile,
      'FFmpeg conversion failed',
      errorMsg,
    );
  }
}

function buildConversionCommand(
  ffmpegPath: string,
  inputFile: string,
  outputFile: string,
  metadata: Record<string, string>,
): string[] {
  const command: string[] = [
    ffmpegPath,
    // Input file
    '-i', inputFile,
    // Output format: 44.1kHz mono PCM 16-bit LE
    '-ar', '44100',
    '-ac', '1',
    '-acodec', 'pcm_s16le',
  ];

  // Add metadata
  for (const [key, value] of Object.entries(metadata)) {
    command.push('-metadata', `${key}=${value}`);
  }

  // Overwrite output, logging level
  command.push('-y', '-loglevel', 'info', '-stats');

  // Output file
  command.push(outputFile);

  return command;
}

function extractErrorFromOutput(output: string): string {
  if (output.includes('Invalid data found')) {
    return 'Invalid or corrupted input file';
  }
  if (output.includes('No such file')) {
    return 'Input file not found';
  }
  if (output.includes('Permission denied')) {
    return 'Permission denied accessing file';
  }
  if (output.includes('Unknown decoder')) {
    return 'Unsupported audio format';
  }

  // Return last few lines
  const lines = output.split('\n').filter((l) => l.trim().length > 0);
  const start = Math.max(0, lines.length - 5);
  return lines.slice(start).join('\n') || 'Unknown error';
}
