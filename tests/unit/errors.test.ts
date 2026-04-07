import { describe, it, expect } from 'vitest';
import {
  VoicemailExtractorError,
  ConversionError,
  ConfigurationError,
  BackupError,
  EncryptionError,
  NoVoicemailsError,
  DependencyError,
  PermissionError,
  InsufficientStorageError,
} from '../../src/errors.js';

describe('error hierarchy', () => {
  it('VoicemailExtractorError has default code 1', () => {
    const err = new VoicemailExtractorError('test');
    expect(err.code).toBe(1);
    expect(err.suggestion).toBeNull();
    expect(err.message).toBe('test');
    expect(err).toBeInstanceOf(Error);
  });

  it('ConversionError has code 1', () => {
    const err = new ConversionError('/path/to/file', 'conversion failed');
    expect(err.code).toBe(1);
    expect(err.inputFile).toBe('/path/to/file');
    expect(err).toBeInstanceOf(VoicemailExtractorError);
  });

  it('ConversionError provides suggestions based on ffmpeg error', () => {
    const err1 = new ConversionError(null, 'fail', 'Invalid data found');
    expect(err1.suggestion).toContain('corrupted');

    const err2 = new ConversionError(null, 'fail', 'No such file');
    expect(err2.suggestion).toContain('not found');

    const err3 = new ConversionError(null, 'fail', 'Permission denied');
    expect(err3.suggestion).toContain('permissions');
  });

  it('ConfigurationError has code 2', () => {
    const err = new ConfigurationError('bad config');
    expect(err.code).toBe(2);
    expect(err).toBeInstanceOf(VoicemailExtractorError);
  });

  it('BackupError has code 3', () => {
    const err = new BackupError('not found');
    expect(err.code).toBe(3);
    expect(err).toBeInstanceOf(VoicemailExtractorError);
  });

  it('EncryptionError has code 4', () => {
    const err = new EncryptionError(false);
    expect(err.code).toBe(4);
    expect(err.passwordProvided).toBe(false);
    expect(err.message).toContain('requires a password');
    expect(err).toBeInstanceOf(VoicemailExtractorError);
  });

  it('EncryptionError with password provided has different message', () => {
    const err = new EncryptionError(true);
    expect(err.code).toBe(4);
    expect(err.passwordProvided).toBe(true);
    expect(err.message).toContain('incorrect');
  });

  it('NoVoicemailsError has code 5', () => {
    const err = new NoVoicemailsError();
    expect(err.code).toBe(5);
    expect(err.message).toContain('No voicemails found');
    expect(err.suggestion).not.toBeNull();
    expect(err).toBeInstanceOf(VoicemailExtractorError);
  });

  it('NoVoicemailsError with additional info', () => {
    const err = new NoVoicemailsError('backup too old');
    expect(err.message).toContain('backup too old');
  });

  it('DependencyError has code 6', () => {
    const err = new DependencyError('ffmpeg', 'not found');
    expect(err.code).toBe(6);
    expect(err.dependency).toBe('ffmpeg');
    expect(err.suggestion).toContain('Install FFmpeg');
    expect(err).toBeInstanceOf(VoicemailExtractorError);
  });

  it('DependencyError for ffprobe references FFmpeg', () => {
    const err = new DependencyError('ffprobe', 'not found');
    expect(err.suggestion).toContain('FFmpeg');
  });

  it('PermissionError has code 7', () => {
    const err = new PermissionError('/some/path', 'WRITE');
    expect(err.code).toBe(7);
    expect(err.deniedPath).toBe('/some/path');
    expect(err.message).toContain('write to');
    expect(err).toBeInstanceOf(VoicemailExtractorError);
  });

  it('PermissionError READ type', () => {
    const err = new PermissionError('/path', 'READ');
    expect(err.message).toContain('read from');
  });

  it('InsufficientStorageError has code 8', () => {
    const err = new InsufficientStorageError('/disk', 1024 * 1024 * 100, 1024 * 1024 * 10);
    expect(err.code).toBe(8);
    expect(err.location).toBe('/disk');
    expect(err.requiredBytes).toBe(1024 * 1024 * 100);
    expect(err.availableBytes).toBe(1024 * 1024 * 10);
    expect(err.message).toContain('100.0 MB');
    expect(err.message).toContain('10.0 MB');
    expect(err).toBeInstanceOf(VoicemailExtractorError);
  });
});
