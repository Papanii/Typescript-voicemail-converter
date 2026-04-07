/**
 * Main orchestrator for audio conversion — port of AudioConverter.java.
 *
 * Coordinates FFmpeg detection, audio analysis, and conversion of
 * voicemail files to WAV format with embedded metadata.
 */

import { existsSync, statSync } from 'node:fs';
import type { VoicemailFile, ProcessedMetadata, ConversionResult, Logger } from '../types.js';
import { noopLogger } from '../types.js';
import { detectFFmpeg, type FFmpegInfo } from './ffmpeg-detector.js';
import { analyzeAudio } from './audio-analyzer.js';
import { convertToWav } from './ffmpeg-wrapper.js';

export class AudioConverter {
  private readonly ffmpegInfo: FFmpegInfo;
  private readonly logger: Logger;

  constructor(logger: Logger = noopLogger) {
    this.logger = logger;
    this.ffmpegInfo = detectFFmpeg(logger);
    this.logger.info('AudioConverter initialized with FFmpeg: %s', this.ffmpegInfo.ffmpegVersion);
  }

  /** Get FFmpeg version */
  get ffmpegVersion(): string | null {
    return this.ffmpegInfo.ffmpegVersion;
  }

  /** Get ffprobe version */
  get ffprobeVersion(): string | null {
    return this.ffmpegInfo.ffprobeVersion;
  }

  /**
   * Convert a single voicemail file to WAV format.
   */
  convertSingle(
    voicemailFile: VoicemailFile,
    outputFile: string,
    metadata: ProcessedMetadata,
  ): ConversionResult {
    this.logger.info('Converting voicemail: %s', voicemailFile.originalFilename);

    try {
      // Ensure input file exists
      if (!existsSync(voicemailFile.extractedPath)) {
        const errorMsg = `Input file not found: ${voicemailFile.extractedPath}`;
        this.logger.error(errorMsg);
        return {
          success: false,
          inputFile: voicemailFile.extractedPath,
          outputFile,
          conversionTimeMs: 0,
          inputSize: 0,
          outputSize: 0,
          errorMessage: errorMsg,
          audioInfo: null,
        };
      }

      // Analyze input file
      const audioInfo = analyzeAudio(
        this.ffmpegInfo.ffprobePath,
        voicemailFile.extractedPath,
        this.logger,
      );

      this.logger.debug('Input audio: codec=%s, sampleRate=%d, duration=%ss',
        audioInfo.codec, audioInfo.sampleRate, audioInfo.durationSeconds);

      const inputSize = statSync(voicemailFile.extractedPath).size;

      // Convert with metadata
      const conversionTimeMs = convertToWav(
        this.ffmpegInfo.ffmpegPath,
        voicemailFile.extractedPath,
        outputFile,
        metadata.wavMetadata,
        this.logger,
      );

      const outputSize = statSync(outputFile).size;

      return {
        success: true,
        inputFile: voicemailFile.extractedPath,
        outputFile,
        conversionTimeMs,
        inputSize,
        outputSize,
        errorMessage: null,
        audioInfo,
      };
    } catch (e) {
      this.logger.error('Conversion failed: %s', voicemailFile.originalFilename);

      return {
        success: false,
        inputFile: voicemailFile.extractedPath,
        outputFile,
        conversionTimeMs: 0,
        inputSize: 0,
        outputSize: 0,
        errorMessage: e instanceof Error ? e.message : String(e),
        audioInfo: null,
      };
    }
  }

  /**
   * Convert multiple voicemail files.
   */
  convertAll(
    voicemails: VoicemailFile[],
    metadataList: ProcessedMetadata[],
    outputPathGenerator: (file: VoicemailFile, metadata: ProcessedMetadata) => string,
  ): ConversionResult[] {
    if (voicemails.length !== metadataList.length) {
      throw new Error('Voicemails and metadata lists must have same size');
    }

    this.logger.info('Converting %d voicemails', voicemails.length);

    const results: ConversionResult[] = [];

    for (let i = 0; i < voicemails.length; i++) {
      const vmFile = voicemails[i]!;
      const metadata = metadataList[i]!;

      try {
        const outputPath = outputPathGenerator(vmFile, metadata);
        const result = this.convertSingle(vmFile, outputPath, metadata);
        results.push(result);

        if (result.success) {
          this.logger.info('Converted %d/%d: %s', i + 1, voicemails.length, vmFile.originalFilename);
        } else {
          this.logger.warn('Failed %d/%d: %s - %s', i + 1, voicemails.length, vmFile.originalFilename, result.errorMessage);
        }
      } catch (e) {
        this.logger.error('Error converting %s: %s', vmFile.originalFilename, e instanceof Error ? e.message : String(e));
        results.push({
          success: false,
          inputFile: vmFile.extractedPath,
          outputFile: null,
          conversionTimeMs: 0,
          inputSize: 0,
          outputSize: 0,
          errorMessage: e instanceof Error ? e.message : String(e),
          audioInfo: null,
        });
      }
    }

    const successful = results.filter((r) => r.success).length;
    this.logger.info('Conversion complete: %d successful, %d failed', successful, results.length - successful);

    return results;
  }
}
