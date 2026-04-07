/**
 * Orchestrates organization of converted voicemail files — port of FileOrganizer.java.
 *
 * Creates date-based directory structure, generates descriptive filenames,
 * copies WAV/JSON/original files to output directories, and handles collisions.
 */

import { copyFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { VoicemailFile, OutputResult, OrganizedFile, FileError, Logger } from '../types.js';
import { noopLogger } from '../types.js';
import {
  generateWavFilename,
  generateOriginalFilename,
  generateUniqueFilename,
} from './filename-generator.js';
import { createDateDirectory, ensureBaseDirectoriesExist } from './directory-creator.js';

/** File pairing for organization */
export interface FileToOrganize {
  readonly wavFile: string;
  readonly jsonFile: string | null;
  readonly originalFile: string;
  readonly voicemailFile: VoicemailFile;
}

/**
 * Organize all converted voicemail files into output directories.
 */
export function organizeFiles(
  filesToOrganize: FileToOrganize[],
  wavOutputDir: string,
  backupDir: string | null,
  logger: Logger = noopLogger,
): OutputResult {
  logger.info('Organizing %d converted files to output directories', filesToOrganize.length);

  const startTime = Date.now();

  // Ensure base directories exist
  ensureBaseDirectoriesExist(wavOutputDir, backupDir, logger);

  // Track existing filenames for collision handling
  const existingWavFilenames = new Set<string>();
  const existingBackupFilenames = new Set<string>();

  const organizedFiles: OrganizedFile[] = [];
  const errors: FileError[] = [];

  for (const fileToOrganize of filesToOrganize) {
    try {
      const organized = organizeFile(
        fileToOrganize,
        wavOutputDir,
        backupDir,
        existingWavFilenames,
        existingBackupFilenames,
        logger,
      );
      organizedFiles.push(organized);
    } catch (e) {
      logger.error('Failed to organize file: %s', fileToOrganize.wavFile);
      errors.push({
        sourceFile: fileToOrganize.wavFile,
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info('File organization complete: %d succeeded, %d failed',
    organizedFiles.length, errors.length);

  return {
    totalFiles: filesToOrganize.length,
    successfulFiles: organizedFiles.length,
    failedFiles: errors.length,
    organizedFiles,
    errors,
    durationMs,
  };
}

function organizeFile(
  fileToOrganize: FileToOrganize,
  wavOutputDir: string,
  backupDir: string | null,
  existingWavFilenames: Set<string>,
  existingBackupFilenames: Set<string>,
  logger: Logger,
): OrganizedFile {
  const voicemailFile = fileToOrganize.voicemailFile;
  const wavFile = fileToOrganize.wavFile;
  const jsonFile = fileToOrganize.jsonFile;
  const originalFile = fileToOrganize.originalFile;

  // Get timestamp for directory creation
  const receivedDate = voicemailFile.metadata?.receivedDate ?? new Date();

  // Create date subdirectory for WAV output
  const wavDateDir = createDateDirectory(wavOutputDir, receivedDate, logger);

  // Generate unique WAV filename
  const baseWavFilename = generateWavFilename(voicemailFile);
  const uniqueWavFilename = generateUniqueFilename(baseWavFilename, existingWavFilenames);
  existingWavFilenames.add(uniqueWavFilename);

  // Copy WAV file
  const wavDestination = join(wavDateDir, uniqueWavFilename);
  copyFileSync(wavFile, wavDestination);
  logger.debug('Copied WAV file: %s', wavDestination);

  // Copy JSON metadata if it exists
  let jsonDestination: string;
  if (jsonFile && existsSync(jsonFile)) {
    const jsonFilename = uniqueWavFilename.replace('.wav', '.json');
    jsonDestination = join(wavDateDir, jsonFilename);
    copyFileSync(jsonFile, jsonDestination);
    logger.debug('Copied JSON file: %s', jsonDestination);
  } else {
    jsonDestination = join(wavDateDir, uniqueWavFilename.replace('.wav', '.json'));
  }

  // Copy original file if --keep-originals
  let originalDestination: string | null = null;
  if (backupDir) {
    const originalExtension = extname(originalFile).substring(1) || 'amr';
    const baseOriginalFilename = generateOriginalFilename(voicemailFile, originalExtension);
    const uniqueOriginalFilename = generateUniqueFilename(baseOriginalFilename, existingBackupFilenames);
    existingBackupFilenames.add(uniqueOriginalFilename);

    const backupDateDir = createDateDirectory(backupDir, receivedDate, logger);
    originalDestination = join(backupDateDir, uniqueOriginalFilename);
    copyFileSync(originalFile, originalDestination);
    logger.debug('Copied original file: %s', originalDestination);
  }

  // Get caller info
  const callerInfo = voicemailFile.metadata?.callerNumber ?? 'Unknown';

  return {
    wavFile: wavDestination,
    jsonFile: jsonDestination,
    originalFile: originalDestination,
    callerInfo,
    receivedDate: receivedDate.toISOString(),
  };
}
