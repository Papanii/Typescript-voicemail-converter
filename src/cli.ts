#!/usr/bin/env node

/**
 * CLI wrapper for the voicemail extractor library.
 * Provides a command-line interface for testing and standalone usage.
 */

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import {
  extractVoicemails,
  discoverBackups,
  checkFfmpeg,
} from './index.js';
import type { Logger, ConversionProgress } from './types.js';
import { VoicemailExtractorError } from './errors.js';

const HELP_TEXT = `
Voicemail Extractor - Extract voicemails from iOS backups

Usage:
  voicemail-extract [options]

Options:
  -o, --output-dir <path>    Output directory for converted WAV files (required)
  -b, --backup-dir <path>    iOS backup directory (auto-detected if omitted)
  -d, --device-id <udid>     Target specific device by UDID
  -p, --password <pass>      Password for encrypted backup (not yet supported)
  --keep-originals           Copy original audio files to backup directory
  --include-metadata         Export voicemail metadata as JSON
  --list-backups             List available backups and exit
  --check-ffmpeg             Check FFmpeg installation and exit
  -v, --verbose              Enable verbose logging
  -h, --help                 Show this help message
  --version                  Show version
`;

function createLogger(verbose: boolean): Logger {
  return {
    debug: verbose ? (...args: unknown[]) => console.error('[DEBUG]', ...args) : () => {},
    info: verbose ? (...args: unknown[]) => console.error('[INFO]', ...args) : () => {},
    warn: (...args: unknown[]) => console.error('[WARN]', ...args),
    error: (...args: unknown[]) => console.error('[ERROR]', ...args),
  };
}

function formatProgress(progress: ConversionProgress): string {
  const bar = buildProgressBar(progress.percent);
  const file = progress.currentFile ? ` ${progress.currentFile}` : '';
  return `  ${progress.stage} ${bar} ${progress.percent}%${file}`;
}

function buildProgressBar(percent: number): string {
  const width = 30;
  const filled = Math.round((percent / 100) * width);
  return '[' + '#'.repeat(filled) + '-'.repeat(width - filled) + ']';
}

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        'output-dir': { type: 'string', short: 'o' },
        'backup-dir': { type: 'string', short: 'b' },
        'device-id': { type: 'string', short: 'd' },
        'password': { type: 'string', short: 'p' },
        'keep-originals': { type: 'boolean', default: false },
        'include-metadata': { type: 'boolean', default: false },
        'list-backups': { type: 'boolean', default: false },
        'check-ffmpeg': { type: 'boolean', default: false },
        'verbose': { type: 'boolean', short: 'v', default: false },
        'help': { type: 'boolean', short: 'h', default: false },
        'version': { type: 'boolean', default: false },
      },
      strict: true,
    });
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
    console.error('Run with --help for usage information.');
    return 2;
  }

  const opts = parsed.values;

  if (opts.help) {
    console.log(HELP_TEXT);
    return 0;
  }

  if (opts.version) {
    console.log('voicemail-extractor-lib 1.0.0');
    return 0;
  }

  const verbose = opts.verbose ?? false;
  const logger = createLogger(verbose);

  // --check-ffmpeg
  if (opts['check-ffmpeg']) {
    const result = await checkFfmpeg();
    if (result.available) {
      console.log(`FFmpeg:  ${result.ffmpegVersion}`);
      console.log(`ffprobe: ${result.ffprobeVersion}`);
    } else {
      console.error('FFmpeg is not installed or not in PATH.');
      console.error('Install it: brew install ffmpeg (macOS) / sudo apt install ffmpeg (Linux)');
      return 6;
    }
    return 0;
  }

  // --list-backups
  if (opts['list-backups']) {
    const backupDir = opts['backup-dir'];
    const backups = await discoverBackups(backupDir);
    if (backups.length === 0) {
      console.log('No iOS backups found.');
      return 3;
    }
    console.log(`Found ${backups.length} backup(s):\n`);
    for (const backup of backups) {
      const date = backup.lastBackupDate?.toISOString().split('T')[0] ?? 'Unknown';
      const enc = backup.isEncrypted ? ' [encrypted]' : '';
      console.log(`  ${backup.deviceName ?? 'Unknown'} (iOS ${backup.productVersion ?? '?'})${enc}`);
      console.log(`    UDID:   ${backup.udid}`);
      console.log(`    Date:   ${date}`);
      console.log(`    Path:   ${backup.backupPath}`);
      console.log();
    }
    return 0;
  }

  // Main extraction flow requires --output-dir
  if (!opts['output-dir']) {
    console.error('Error: --output-dir is required.');
    console.error('Run with --help for usage information.');
    return 2;
  }

  const outputDir = resolve(opts['output-dir']);

  console.log('Voicemail Extractor');
  console.log('===================\n');

  let lastLine = '';
  const onProgress = (progress: ConversionProgress): void => {
    const line = formatProgress(progress);
    if (line !== lastLine) {
      if (lastLine) process.stderr.write('\r\x1b[K');
      process.stderr.write(line);
      lastLine = line;
      if (progress.percent === 100) {
        process.stderr.write('\n');
        lastLine = '';
      }
    }
  };

  try {
    const result = await extractVoicemails({
      outputDir,
      backupDir: opts['backup-dir'],
      deviceId: opts['device-id'],
      keepOriginals: opts['keep-originals'],
      includeMetadata: opts['include-metadata'],
      onProgress,
      logger,
    });

    // Clear any in-progress line
    if (lastLine) process.stderr.write('\n');

    // Summary
    console.log('\n===================');
    console.log('Summary');
    console.log('===================\n');

    const successful = result.conversions.filter((c) => c.success).length;
    console.log(`Backup:          ${result.backupInfo.deviceName ?? 'Unknown'} (iOS ${result.backupInfo.productVersion ?? '?'})`);
    console.log(`Voicemails:      ${result.voicemails.length}`);
    console.log(`Converted:       ${successful}/${result.voicemails.length}`);
    console.log(`Organized:       ${result.output.successfulFiles}`);

    if (result.output.failedFiles > 0) {
      console.log(`Errors:          ${result.output.failedFiles}`);
    }

    const seconds = (result.totalDurationMs / 1000).toFixed(1);
    console.log(`Time:            ${seconds}s`);
    console.log(`\nOutput:          ${outputDir}`);

    if (result.output.errors.length > 0) {
      console.log('\nErrors:');
      for (const err of result.output.errors) {
        console.error(`  - ${err.sourceFile}: ${err.errorMessage}`);
      }
    }

    console.log('\nDone.');
    return 0;
  } catch (e) {
    // Clear any in-progress line
    if (lastLine) process.stderr.write('\n');

    if (e instanceof VoicemailExtractorError) {
      console.error(`\nError: ${e.message}`);
      if (e.suggestion) {
        console.error(`\nSuggestion:\n  ${e.suggestion}`);
      }
      return e.code;
    }

    console.error(`\nUnexpected error: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

main().then((code) => process.exit(code));
