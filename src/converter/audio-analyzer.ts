/**
 * Analyzes audio files using ffprobe — port of AudioAnalyzer.java.
 */

import { execFileSync } from 'node:child_process';
import type { AudioInfo, Logger } from '../types.js';
import { noopLogger } from '../types.js';

const CODEC_PATTERN = /codec_name=(.+)/;
const SAMPLE_RATE_PATTERN = /sample_rate=(\d+)/;
const CHANNELS_PATTERN = /channels=(\d+)/;
const BIT_RATE_PATTERN = /bit_rate=(\d+)/;
const DURATION_PATTERN = /duration=([0-9.]+)/;

/**
 * Analyze an audio file with ffprobe.
 */
export function analyzeAudio(
  ffprobePath: string,
  audioFile: string,
  logger: Logger = noopLogger,
): AudioInfo {
  logger.debug('Analyzing audio file: %s', audioFile);

  let output: string;
  try {
    output = execFileSync(ffprobePath, [
      '-v', 'quiet',
      '-print_format', 'default=noprint_wrappers=1',
      '-show_format',
      '-show_streams',
      audioFile,
    ], {
      encoding: 'utf-8',
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    throw new Error(`ffprobe failed for ${audioFile}: ${e instanceof Error ? e.message : String(e)}`);
  }

  let codec: string | null = null;
  let sampleRate = 0;
  let channels = 0;
  let bitRate = 0;
  let duration = 0;

  for (const line of output.split('\n')) {
    let match: RegExpExecArray | null;

    if ((match = CODEC_PATTERN.exec(line))) {
      codec = match[1] ?? null;
    } else if ((match = SAMPLE_RATE_PATTERN.exec(line))) {
      sampleRate = parseInt(match[1]!, 10);
    } else if ((match = CHANNELS_PATTERN.exec(line))) {
      channels = parseInt(match[1]!, 10);
    } else if ((match = BIT_RATE_PATTERN.exec(line))) {
      bitRate = parseInt(match[1]!, 10);
    } else if ((match = DURATION_PATTERN.exec(line))) {
      duration = parseFloat(match[1]!);
    }
  }

  const info: AudioInfo = { codec, sampleRate, channels, bitRate, durationSeconds: duration };
  logger.debug('Audio info: %s, %d Hz, %d ch, %.1fs', codec, sampleRate, channels, duration);
  return info;
}
