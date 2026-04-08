/**
 * All shared interfaces, enums, and type definitions for the Voicemail Extractor Library.
 */

/** Audio format enum matching iOS voicemail file types */
export enum AudioFormat {
  AMR_NB = 'AMR_NB',
  AMR_WB = 'AMR_WB',
  AAC = 'AAC',
  UNKNOWN = 'UNKNOWN',
}

/** Map audio format to file extension */
export const AUDIO_FORMAT_EXTENSIONS: Record<AudioFormat, string> = {
  [AudioFormat.AMR_NB]: '.amr',
  [AudioFormat.AMR_WB]: '.awb',
  [AudioFormat.AAC]: '.m4a',
  [AudioFormat.UNKNOWN]: '.bin',
};

/** Map audio format to description */
export const AUDIO_FORMAT_DESCRIPTIONS: Record<AudioFormat, string> = {
  [AudioFormat.AMR_NB]: 'AMR Narrowband',
  [AudioFormat.AMR_WB]: 'AMR Wideband',
  [AudioFormat.AAC]: 'AAC',
  [AudioFormat.UNKNOWN]: 'Unknown',
};

/** Resolve AudioFormat from file extension */
export function audioFormatFromExtension(ext: string): AudioFormat {
  const lower = ext.toLowerCase();
  for (const [format, extension] of Object.entries(AUDIO_FORMAT_EXTENSIONS)) {
    if (extension === lower) {
      return format as AudioFormat;
    }
  }
  return AudioFormat.UNKNOWN;
}

/** iOS backup metadata — port of BackupInfo.java */
export interface BackupInfo {
  readonly udid: string;
  readonly deviceName: string | null;
  readonly displayName: string | null;
  readonly productType: string | null;
  readonly productVersion: string | null;
  readonly serialNumber: string | null;
  readonly phoneNumber: string | null;
  readonly lastBackupDate: Date | null;
  readonly isEncrypted: boolean;
  readonly backupPath: string;
}

/** Voicemail metadata from voicemail.db — port of VoicemailFile.VoicemailMetadata */
export interface VoicemailMetadata {
  readonly rowId: number;
  readonly remoteUid: number;
  readonly receivedDate: Date | null;
  readonly callerNumber: string | null;
  readonly callbackNumber: string | null;
  readonly durationSeconds: number;
  readonly expirationDate: Date | null;
  readonly trashedDate: Date | null;
  readonly flags: number;
  readonly isRead: boolean;
  readonly isSpam: boolean;
}

/** Extracted voicemail file — port of VoicemailFile.java */
export interface VoicemailFile {
  readonly fileId: string;
  readonly domain: string | null;
  readonly relativePath: string;
  readonly backupFilePath: string;
  readonly extractedPath: string;
  readonly metadata: VoicemailMetadata | null;
  readonly format: AudioFormat;
  readonly fileSize: number;
  readonly originalFilename: string;
}

/** Audio analysis info — port of ConversionResult.AudioInfo */
export interface AudioInfo {
  readonly codec: string | null;
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitRate: number;
  readonly durationSeconds: number;
}

/** Result of a single audio conversion — port of ConversionResult.java */
export interface ConversionResult {
  readonly success: boolean;
  readonly inputFile: string;
  readonly outputFile: string | null;
  readonly conversionTimeMs: number;
  readonly inputSize: number;
  readonly outputSize: number;
  readonly errorMessage: string | null;
  readonly audioInfo: AudioInfo | null;
}

/** Info about a successfully organized file — port of OutputResult.OrganizedFile */
export interface OrganizedFile {
  readonly wavFile: string;
  readonly jsonFile: string;
  readonly originalFile: string | null;
  readonly callerInfo: string;
  readonly receivedDate: string;
}

/** Info about a file that failed to organize */
export interface FileError {
  readonly sourceFile: string;
  readonly errorMessage: string;
}

/** Result of output organization — port of OutputResult.java */
export interface OutputResult {
  readonly totalFiles: number;
  readonly successfulFiles: number;
  readonly failedFiles: number;
  readonly organizedFiles: readonly OrganizedFile[];
  readonly errors: readonly FileError[];
  readonly durationMs: number;
}

/** File info from Manifest.db — port of ManifestDbReader.FileInfo */
export interface ManifestFileInfo {
  readonly fileId: string;
  readonly domain: string;
  readonly relativePath: string;
}

/** Processed metadata for embedding/export — port of MetadataProcessor.ProcessedMetadata */
export interface ProcessedMetadata {
  readonly voicemailFile: VoicemailFile;
  readonly wavMetadata: Record<string, string>;
  readonly deviceName: string | null;
  readonly iosVersion: string | null;
  readonly backupDate: Date | null;
}

/** Contact info from iOS AddressBook — port of ContactInfo.java */
export interface ContactInfo {
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly organization: string | null;
  readonly matchedPhoneNumber: string;
  readonly displayName: string;
  readonly isBusiness: boolean;
}

/** Options for the main extractVoicemails API */
export interface ExtractorOptions {
  /** iOS backup directory (auto-detected if omitted) */
  backupDir?: string;
  /** Output directory for converted WAV files */
  outputDir: string;
  /** Target specific device by UDID */
  deviceId?: string;
  /** Copy original audio files to backup directory */
  keepOriginals?: boolean;
  /** Export voicemail metadata as JSON */
  includeMetadata?: boolean;
  /** Progress callback */
  onProgress?: (progress: ConversionProgress) => void;
  /** Optional logger (defaults to no-op) */
  logger?: Logger;
}

/** Progress information reported during extraction */
export interface ConversionProgress {
  stage: 'discovering' | 'extracting' | 'converting' | 'organizing';
  current: number;
  total: number;
  currentFile: string | null;
  percent: number;
}

/** Logger interface — consumers inject their own logger */
export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

/** Result of the main extractVoicemails API */
export interface ExtractorResult {
  readonly backupInfo: BackupInfo;
  readonly voicemails: readonly VoicemailFile[];
  readonly conversions: readonly ConversionResult[];
  readonly output: OutputResult;
  readonly totalDurationMs: number;
}

/** Permission type for permission errors */
export enum PermissionType {
  READ = 'READ',
  WRITE = 'WRITE',
  EXECUTE = 'EXECUTE',
}

/** No-op logger used when no logger is provided */
export const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};
