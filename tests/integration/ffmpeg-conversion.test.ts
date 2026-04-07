/**
 * Integration tests for FFmpeg-based audio conversion.
 * These tests require FFmpeg to be installed and available in PATH.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { checkFFmpegAvailability } from '../../src/converter/ffmpeg-detector.js';
import { analyzeAudio } from '../../src/converter/audio-analyzer.js';
import { convertToWav } from '../../src/converter/ffmpeg-wrapper.js';

// Detect FFmpeg at module load time so it.skipIf works
const ffmpegAvailable = checkFFmpegAvailability().available;
let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'ffmpeg-integration-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

/**
 * Generate a small test WAV file using FFmpeg (sine wave).
 */
function generateTestAudio(outputPath: string, durationSec = 1): void {
  execFileSync('ffmpeg', [
    '-f', 'lavfi',
    '-i', `sine=frequency=440:duration=${durationSec}`,
    '-ar', '8000',
    '-ac', '1',
    '-y',
    outputPath,
  ], { stdio: 'pipe' });
}

describe('FFmpeg integration', () => {
  describe('FFmpeg detection', () => {
    it('should detect FFmpeg and ffprobe', () => {
      // This test simply checks our detection logic works
      const result = checkFFmpegAvailability();
      // Don't assert available=true — the test suite should still run
      // on machines without FFmpeg (tests will skip)
      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('ffmpegVersion');
      expect(result).toHaveProperty('ffprobeVersion');
    });
  });

  describe('audio analysis', () => {
    it.skipIf(!ffmpegAvailable)('should analyze a WAV file', () => {
      const testFile = join(tempDir, 'test.wav');
      generateTestAudio(testFile, 2);

      const info = analyzeAudio('ffprobe', testFile);

      expect(info.codec).toBeTruthy();
      expect(info.sampleRate).toBe(8000);
      expect(info.channels).toBe(1);
      expect(info.durationSeconds).toBeGreaterThan(1.5);
      expect(info.durationSeconds).toBeLessThan(2.5);
    });
  });

  describe('audio conversion', () => {
    it.skipIf(!ffmpegAvailable)('should convert audio to WAV with correct settings', () => {
      // Create a test AMR-like file (actually a WAV at low sample rate)
      const inputFile = join(tempDir, 'input.wav');
      generateTestAudio(inputFile, 1);

      const outputFile = join(tempDir, 'output.wav');

      const timeMs = convertToWav('ffmpeg', inputFile, outputFile, {
        title: 'Test Call',
        artist: '+12345678900',
      });

      expect(timeMs).toBeGreaterThan(0);
      expect(existsSync(outputFile)).toBe(true);

      // Verify output audio properties
      const info = analyzeAudio('ffprobe', outputFile);
      expect(info.sampleRate).toBe(44100);  // Upsampled to 44.1kHz
      expect(info.channels).toBe(1);        // Mono
      expect(info.codec).toContain('pcm_s16le');
    });

    it.skipIf(!ffmpegAvailable)('should embed metadata in WAV', () => {
      const inputFile = join(tempDir, 'input.wav');
      generateTestAudio(inputFile, 1);

      const outputFile = join(tempDir, 'output.wav');

      convertToWav('ffmpeg', inputFile, outputFile, {
        title: 'John Doe',
        artist: '+12345678900',
        date: '2024-03-12',
        comment: 'Duration: 30s, Device: iPhone 15',
      });

      expect(existsSync(outputFile)).toBe(true);
      expect(statSync(outputFile).size).toBeGreaterThan(0);
    });

    it.skipIf(!ffmpegAvailable)('should produce larger output than input (PCM is uncompressed)', () => {
      const inputFile = join(tempDir, 'input.wav');
      generateTestAudio(inputFile, 2);

      const outputFile = join(tempDir, 'output.wav');
      convertToWav('ffmpeg', inputFile, outputFile, {});

      const inputSize = statSync(inputFile).size;
      const outputSize = statSync(outputFile).size;

      // Output at 44.1kHz should be larger than input at 8kHz
      expect(outputSize).toBeGreaterThan(inputSize);
    });
  });
});
