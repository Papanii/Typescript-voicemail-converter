/**
 * Voicemail Extractor Library — Public API
 *
 * TypeScript library to extract and convert voicemail audio from iOS device
 * backups (iTunes/Finder) to WAV format.
 */

// Functions
export {
  extractVoicemails,
  discoverBackups,
  checkFfmpeg,
  extractAddressBook,
} from './voicemail-converter.js';

// Types — re-export everything from types.ts
export {
  AudioFormat,
  AUDIO_FORMAT_EXTENSIONS,
  AUDIO_FORMAT_DESCRIPTIONS,
  audioFormatFromExtension,
  PermissionType,
  noopLogger,
} from './types.js';

export type {
  BackupInfo,
  VoicemailMetadata,
  VoicemailFile,
  AudioInfo,
  ConversionResult,
  OrganizedFile,
  FileError,
  OutputResult,
  ManifestFileInfo,
  ProcessedMetadata,
  ContactInfo,
  ExtractorOptions,
  ConversionProgress,
  Logger,
  ExtractorResult,
} from './types.js';

// Errors — re-export everything from errors.ts
export {
  VoicemailExtractorError,
  ConversionError,
  ConfigurationError,
  BackupError,
  EncryptionError,
  NoVoicemailsError,
  DependencyError,
  PermissionError,
  InsufficientStorageError,
} from './errors.js';
