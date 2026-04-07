/**
 * Typed error hierarchy — port of the Java exception package.
 * Each error carries a numeric code matching the Java exit codes (1-8).
 */

/** Base error for all voicemail converter errors */
export class VoicemailExtractorError extends Error {
  readonly code: number;
  readonly suggestion: string | null;
  readonly cause?: Error;

  constructor(message: string, code = 1, suggestion: string | null = null, cause?: Error) {
    super(message);
    this.name = 'VoicemailExtractorError';
    this.code = code;
    this.suggestion = suggestion;
    this.cause = cause;
  }
}

/** Audio conversion failed — exit code 1 */
export class ConversionError extends VoicemailExtractorError {
  readonly inputFile: string | null;
  readonly ffmpegError: string | null;

  constructor(
    inputFile: string | null,
    message: string,
    ffmpegError?: string,
    cause?: Error,
  ) {
    super(message, 1, buildConversionSuggestion(ffmpegError ?? null), cause);
    this.name = 'ConversionError';
    this.inputFile = inputFile;
    this.ffmpegError = ffmpegError ?? null;
  }
}

function buildConversionSuggestion(ffmpegError: string | null): string {
  if (!ffmpegError) {
    return 'Check that the input file is a valid audio file';
  }
  if (ffmpegError.includes('Invalid data')) {
    return 'Input file appears to be corrupted';
  }
  if (ffmpegError.includes('No such file')) {
    return 'Input file not found';
  }
  if (ffmpegError.includes('Permission denied')) {
    return 'Cannot read input file due to permissions';
  }
  return 'Check FFmpeg error details in log output';
}

/** Invalid configuration — exit code 2 */
export class ConfigurationError extends VoicemailExtractorError {
  constructor(message: string, suggestion?: string) {
    super(message, 2, suggestion ?? null);
    this.name = 'ConfigurationError';
  }
}

/** Backup not found or inaccessible — exit code 3 */
export class BackupError extends VoicemailExtractorError {
  readonly backupPath: string | null;

  constructor(message: string, suggestion?: string, cause?: Error) {
    super(message, 3, suggestion ?? null, cause);
    this.name = 'BackupError';
    this.backupPath = null;
  }
}

/** Backup is encrypted — exit code 4 */
export class EncryptionError extends VoicemailExtractorError {
  readonly passwordProvided: boolean;

  constructor(passwordProvided: boolean, cause?: Error) {
    const message = passwordProvided
      ? 'Backup is encrypted and the provided password is incorrect'
      : 'Backup is encrypted and requires a password';

    const suggestion = passwordProvided
      ? 'Check the password and try again, or create an unencrypted backup'
      : [
          'Provide a backup password, or create an unencrypted backup:',
          '  1. Open Finder (macOS) or iTunes (Windows)',
          '  2. Connect your iPhone',
          "  3. Disable 'Encrypt local backup'",
          '  4. Create a new backup',
          '  5. Try again',
        ].join('\n');

    super(message, 4, suggestion, cause);
    this.name = 'EncryptionError';
    this.passwordProvided = passwordProvided;
  }
}

/** No voicemails found — exit code 5 */
export class NoVoicemailsError extends VoicemailExtractorError {
  constructor(additionalInfo?: string) {
    const message = additionalInfo
      ? `No voicemails found in backup: ${additionalInfo}`
      : 'No voicemails found in backup';

    const suggestion = additionalInfo
      ? 'Check that voicemails exist on device before creating backup'
      : [
          'This could mean:',
          '  - No voicemails were saved at time of backup',
          '  - Voicemails were deleted before backup',
          "  - Backup doesn't include voicemail data",
          '',
          'To fix:',
          '  1. Ensure voicemails exist on device',
          '  2. Create a new backup',
          '  3. Try again',
        ].join('\n');

    super(message, 5, suggestion);
    this.name = 'NoVoicemailsError';
  }
}

/** Required dependency missing — exit code 6 */
export class DependencyError extends VoicemailExtractorError {
  readonly dependency: string;

  constructor(dependency: string, message: string, cause?: Error) {
    super(message, 6, buildDependencySuggestion(dependency), cause);
    this.name = 'DependencyError';
    this.dependency = dependency;
  }
}

function buildDependencySuggestion(dependency: string): string {
  switch (dependency.toLowerCase()) {
    case 'ffmpeg':
      return [
        'Install FFmpeg:',
        '  macOS:    brew install ffmpeg',
        '  Ubuntu:   sudo apt install ffmpeg',
        '  Windows:  Download from https://ffmpeg.org/download.html',
      ].join('\n');
    case 'ffprobe':
      return 'FFprobe is included with FFmpeg. Install FFmpeg.';
    default:
      return `Install ${dependency} and ensure it's in your PATH`;
  }
}

/** File system permission denied — exit code 7 */
export class PermissionError extends VoicemailExtractorError {
  readonly deniedPath: string;
  readonly permissionType: string;

  constructor(deniedPath: string, permissionType: 'READ' | 'WRITE' | 'EXECUTE', customSuggestion?: string) {
    const typeDesc =
      permissionType === 'READ' ? 'read from' :
      permissionType === 'WRITE' ? 'write to' :
      'execute';

    super(
      `Permission denied: Cannot ${typeDesc} ${deniedPath}`,
      7,
      customSuggestion ?? 'Check file permissions or run with appropriate privileges',
    );
    this.name = 'PermissionError';
    this.deniedPath = deniedPath;
    this.permissionType = permissionType;
  }
}

/** Insufficient disk space — exit code 8 */
export class InsufficientStorageError extends VoicemailExtractorError {
  readonly location: string;
  readonly requiredBytes: number;
  readonly availableBytes: number;

  constructor(location: string, requiredBytes: number, availableBytes: number) {
    const shortage = requiredBytes - availableBytes;
    super(
      `Insufficient disk space at ${location}: Need ${formatBytes(requiredBytes)}, have ${formatBytes(availableBytes)}`,
      8,
      [
        `Free up at least ${formatBytes(shortage)} of disk space, or:`,
        '  - Use a different output directory',
        '  - Choose a location with more available space',
      ].join('\n'),
    );
    this.name = 'InsufficientStorageError';
    this.location = location;
    this.requiredBytes = requiredBytes;
    this.availableBytes = availableBytes;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
