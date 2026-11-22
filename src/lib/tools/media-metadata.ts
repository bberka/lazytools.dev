/**
 * The AI Metadata Cleaner's file side: it recognises the file, sends it to the
 * parser for its container, cuts the metadata out, applies the fix-ups that
 * container needs, scans the result again and hands back one report.
 *
 * Cleaned: JPEG, PNG and WebP images, MP4, MOV and M4A video and audio, MP3,
 * FLAC and WAV. Anything else is only scanned for markers, never changed,
 * because cutting bytes out of a structure we do not understand breaks it.
 *
 * Pure functions, no DOM: they run in Node as well as in the browser.
 */

import {
  MetadataParseError,
  cutRemovals,
  distinct,
  findSignals,
  searchable,
  type MetadataFinding,
  type ParsedMedia,
} from './metadata-core';
import {
  IMAGE_MIME_TYPES,
  detectImageFormat,
  stripImageMetadata,
  type ImageFormat,
} from './ai-image-metadata';
import { detectAudioFormat, parseAudio, type AudioFormat } from './ai-audio-metadata';
import {
  detectVideoFormat,
  isoImageBrand,
  parseVideo,
  type VideoFormat,
} from './ai-video-metadata';

export type MediaFormat = ImageFormat | VideoFormat | AudioFormat;

export const MEDIA_MIME_TYPES: Record<MediaFormat, string> = {
  ...IMAGE_MIME_TYPES,
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  wav: 'audio/wav',
};

export interface MediaStripResult {
  format: MediaFormat | null;
  /** The cleaned file, or the input itself when nothing was removed or the input is damaged. */
  bytes: Uint8Array;
  changed: boolean;
  removed: MetadataFinding[];
  signals: string[];
  kept: string[];
  warnings: string[];
  originalSize: number;
  cleanedSize: number;
  /** The cleaned bytes were scanned again and reported nothing. */
  verified: boolean;
  message: string;
}

const FORMAT_NAMES: Record<MediaFormat, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  webp: 'WebP',
  mp4: 'MP4',
  mov: 'MOV',
  m4a: 'M4A',
  mp3: 'MP3',
  flac: 'FLAC',
  wav: 'WAV',
};

/** How much of a file the marker search reads at each end. */
const SCAN_WINDOW_BYTES = 4 * 1024 * 1024;

/** Searches the start and the end of an unknown file for markers, without reading it whole. */
function scanForSignals(bytes: Uint8Array): string[] {
  const windows =
    bytes.length <= SCAN_WINDOW_BYTES * 2
      ? [bytes]
      : [bytes.subarray(0, SCAN_WINDOW_BYTES), bytes.subarray(bytes.length - SCAN_WINDOW_BYTES)];
  return distinct(windows.flatMap((window) => findSignals(searchable(window))));
}

const unchanged = (
  bytes: Uint8Array,
  format: MediaFormat | null,
  message: string,
  verified: boolean,
  extra: Partial<MediaStripResult> = {}
): MediaStripResult => ({
  format,
  bytes,
  changed: false,
  removed: [],
  signals: [],
  kept: [],
  warnings: [],
  originalSize: bytes.length,
  cleanedSize: bytes.length,
  verified,
  message,
  ...extra,
});

const parserFor = (format: MediaFormat) =>
  format === 'mp3' || format === 'flac' || format === 'wav' ? parseAudio : parseVideo;

const failure = (bytes: Uint8Array, format: MediaFormat | null, error: unknown): MediaStripResult =>
  unchanged(
    bytes,
    format,
    error instanceof MetadataParseError
      ? error.message
      : 'The file could not be read, so it was left unchanged.',
    false
  );

/**
 * Lists the metadata that would be removed from a file of a known type, and
 * returns the cleaned file. Never throws: anything damaged, of another type,
 * or still dirty after cutting comes back unchanged with a message.
 */
export function stripMediaMetadata(bytes: Uint8Array): MediaStripResult {
  const imageFormat = detectImageFormat(bytes);
  if (imageFormat) return stripImageMetadata(bytes);

  const videoFormat = detectVideoFormat(bytes);
  const audioFormat = videoFormat ? null : detectAudioFormat(bytes);
  const format = videoFormat ?? audioFormat;

  if (!format) {
    const brand = isoImageBrand(bytes);
    if (brand) {
      // Nothing is rewritten, but the markers still say something worth knowing.
      const signals = scanForSignals(bytes);
      return unchanged(
        bytes,
        null,
        `${brand.toUpperCase()} images are an ISO media container this tool does not rewrite yet, so the file was left unchanged.`,
        false,
        { signals }
      );
    }
    // A type we cannot clean is still worth telling the user about.
    const signals = scanForSignals(bytes);
    if (signals.length > 0)
      return unchanged(
        bytes,
        null,
        `This file type cannot be cleaned here, and it still holds ${signals.join(', ')} markers.`,
        false,
        { signals }
      );
    return unchanged(
      bytes,
      null,
      'This file type is not supported, so it was left unchanged.',
      false
    );
  }

  const parser = parserFor(format);
  let parsed: ParsedMedia;
  try {
    parsed = parser(bytes);
  } catch (error) {
    return failure(bytes, format, error);
  }

  // Every parser reports its blocks in file order; sorting here keeps the
  // cutter and the offset arithmetic safe if one of them ever does not.
  parsed.removals.sort((a, b) => a.start - b.start);

  const findings = parsed.removals.map((removal) => removal.finding);
  const signals = distinct(findings.flatMap((finding) => finding.signals));
  const details = { kept: parsed.kept, warnings: parsed.warnings };

  if (parsed.removals.length === 0)
    return unchanged(
      bytes,
      format,
      'No AI or provenance metadata found. The file was left unchanged.',
      true,
      details
    );

  // Cutting and repairing work on the whole file at once, so they are guarded
  // like the parse: a file is only ever handed back whole or not at all.
  let output: Uint8Array;
  try {
    output = cutRemovals(bytes, parsed.removals);
    if (parsed.finalise && !parsed.finalise(output))
      return unchanged(
        bytes,
        format,
        'The metadata was found but the file could not be put back together, so the original was left unchanged.',
        false,
        details
      );
  } catch (error) {
    return failure(bytes, format, error);
  }

  let rescan: ParsedMedia | null = null;
  try {
    rescan = parser(output);
  } catch {
    rescan = null;
  }
  if (!rescan || rescan.removals.length > 0)
    return unchanged(
      bytes,
      format,
      'The cleaned file did not pass the re-scan, so the original was left unchanged.',
      false,
      details
    );

  return {
    format,
    bytes: output,
    changed: true,
    removed: findings,
    signals,
    ...details,
    originalSize: bytes.length,
    cleanedSize: output.length,
    verified: true,
    message: `Removed ${findings.length} metadata ${findings.length === 1 ? 'block' : 'blocks'} from the ${FORMAT_NAMES[format]}.`,
  };
}
