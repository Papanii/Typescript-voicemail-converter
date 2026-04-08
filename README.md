# Voicemail Extractor Library

TypeScript library to extract and convert voicemail audio from iOS device backups (iTunes/Finder) to WAV format.

## Installation

```bash
npm install voicemail-extractor-lib
```

## Requirements

- Node.js >= 18
- FFmpeg installed and available in PATH

## CLI Usage

```bash
# List available iOS backups
npx voicemail-extract --list-backups

# Check FFmpeg installation
npx voicemail-extract --check-ffmpeg

# Extract voicemails to a directory
npx voicemail-extract -o ./voicemail-output

# With all options
npx voicemail-extract -o ./output --keep-originals --include-metadata --verbose

# Target a specific device
npx voicemail-extract -o ./output -d <UDID>
```

## Library Usage

```typescript
import { extractVoicemails, discoverBackups, checkFfmpeg } from 'voicemail-extractor-lib';

// Check FFmpeg availability
const ffmpeg = await checkFfmpeg();
if (!ffmpeg.available) {
  console.error('FFmpeg is required');
}

// Discover available backups
const backups = await discoverBackups();

// Extract and convert voicemails
const result = await extractVoicemails({
  outputDir: './voicemail-output',
  keepOriginals: true,
  includeMetadata: true,
  onProgress: (progress) => {
    console.log(`${progress.stage}: ${progress.percent}%`);
  },
});
```

## API

### `extractVoicemails(options: ExtractorOptions): Promise<ExtractorResult>`

Extracts voicemails from an iOS backup, converts audio to WAV, and organizes output.

### `discoverBackups(backupDir?: string): Promise<BackupInfo[]>`

Lists available iOS backups in the default or specified directory.

### `checkFfmpeg(): Promise<{ available: boolean; ffmpegVersion: string | null; ffprobeVersion: string | null }>`

Checks whether FFmpeg and ffprobe are installed and available.

### `extractAddressBook(backupPath: string, tempDir?: string): Promise<string | null>`

Extracts the iOS AddressBook database from a backup for contact resolution.

## License

MIT
