/**
 * EXIF Viewer & Remover logic that needs no browser: reading the EXIF tags
 * out of a JPEG, and naming the cleaned files of a batch.
 *
 * The reader takes the raw bytes of a file and never throws. A file that is
 * not a JPEG, has no EXIF block, or has one that is cut short or points
 * outside the file simply yields fewer fields.
 */

import { splitFileName } from '@/lib/files';

export interface ExifField {
  label: string;
  value: string;
}

export interface ExifSection {
  title: string;
  fields: ExifField[];
}

const TAG_NAMES: Record<number, string> = {
  0x010f: 'Camera Make',
  0x0110: 'Camera Model',
  0x0112: 'Orientation',
  0x0131: 'Software',
  0x0132: 'Modified',
  0x013b: 'Artist',
  0x8298: 'Copyright',
  0x829a: 'Exposure Time',
  0x829d: 'Aperture',
  0x8827: 'ISO',
  0x9003: 'Taken',
  0x9004: 'Digitized',
  0x9201: 'Shutter Speed',
  0x9202: 'Aperture Value',
  0x9204: 'Exposure Bias',
  0x9207: 'Metering Mode',
  0x9209: 'Flash',
  0x920a: 'Focal Length',
  0x9286: 'Comment',
  0xa002: 'Width',
  0xa003: 'Height',
  0xa405: 'Focal Length (35mm)',
  0xa406: 'Scene Capture Type',
  0xa430: 'Owner',
  0xa431: 'Serial Number',
  0xa432: 'Lens Info',
  0xa433: 'Lens Make',
  0xa434: 'Lens Model',
  0x0001: 'Latitude Ref',
  0x0002: 'Latitude',
  0x0003: 'Longitude Ref',
  0x0004: 'Longitude',
  0x0005: 'Altitude Ref',
  0x0006: 'Altitude',
  0x0012: 'Map Datum',
  0x001d: 'Captured',
};

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
// A camera maker's private block, often tens of kilobytes. It is not shown.
const TAG_MAKER_NOTE = 0x927c;
const TAG_USER_COMMENT = 0x9286;

const TYPE_ASCII = 2;
const TYPE_RATIONAL = 5;
const TYPE_UNDEFINED = 7;
const TYPE_SLONG = 9;
const TYPE_SRATIONAL = 10;

const TYPE_SIZES: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  7: 1,
  9: 4,
  10: 8,
};

const MAX_TEXT_LENGTH = 140;
// Bytes read for one text value. Far more than the 140 characters shown, and
// a bound on the work a file with absurd lengths can cause.
const MAX_TEXT_BYTES = 1024;
// Numbers listed for one value before the rest is summarised.
const MAX_LISTED_VALUES = 16;

function formatNumber(value: number, maximumFractionDigits = 6): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(value);
}

function clampText(value: string, maxLength = MAX_TEXT_LENGTH): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x;
}

/** A fraction below one stays a fraction in lowest terms (`1/250`); anything else becomes a decimal. */
function formatRational(numerator: number, denominator: number): string {
  if (denominator === 0 || numerator === 0) return '0';

  const raw = numerator / denominator;
  if (Math.abs(raw) >= 1) return formatNumber(raw);

  const divisor = greatestCommonDivisor(numerator, denominator) * Math.sign(denominator);
  return `${numerator / divisor}/${denominator / divisor}`;
}

/**
 * Bytes as text. EXIF says ASCII, but cameras and editors write UTF-8 into
 * names and copyright lines, so that is tried first; bytes that are not valid
 * UTF-8 are read as Latin-1.
 */
function decodeText(bytes: Uint8Array): string {
  // A value cut at the read limit may end inside a character. Only then is a
  // broken tail dropped: anywhere else it means the text is not UTF-8.
  const spare = bytes.length === MAX_TEXT_BYTES ? 3 : 0;

  for (let trim = 0; trim <= spare; trim += 1) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytes.length - trim));
    } catch {
      // Not UTF-8 at this length.
    }
  }
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
}

/** Up to `length` bytes from `start`, never reaching past the end of the data or the read limit. */
function readBytes(view: DataView, start: number, length: number): Uint8Array {
  if (start < 0 || start >= view.byteLength || length <= 0) return new Uint8Array(0);
  const available = Math.min(length, view.byteLength - start, MAX_TEXT_BYTES);
  return new Uint8Array(view.buffer, view.byteOffset + start, available);
}

/** NUL-terminated text of at most `length` bytes. */
function readText(view: DataView, start: number, length: number): string {
  const bytes = readBytes(view, start, length);
  const terminator = bytes.indexOf(0);
  return decodeText(terminator < 0 ? bytes : bytes.subarray(0, terminator)).trim();
}

function hasAscii(view: DataView, start: number, text: string): boolean {
  if (start < 0 || start + text.length > view.byteLength) return false;
  for (let index = 0; index < text.length; index += 1) {
    if (view.getUint8(start + index) !== text.charCodeAt(index)) return false;
  }
  return true;
}

/** The values that were read, with a note when the list stops at the limit and more were stored. */
function listValues(values: Array<number | string>, count: number): string {
  const text = values.join(', ');
  return values.length === MAX_LISTED_VALUES && count > MAX_LISTED_VALUES
    ? `${text}, ... (${count} values)`
    : text;
}

/**
 * The text of a UserComment: eight bytes naming the character set, then the
 * comment itself. Returns null for a character set that cannot be read here.
 */
function readUserComment(view: DataView, start: number, count: number, littleEndian: boolean): string | null {
  if (count <= 8) return 'Empty';

  const body = readBytes(view, start + 8, count - 8);
  let text: string;

  if (hasAscii(view, start, 'UNICODE')) {
    const evenLength = body.length - (body.length % 2);
    text = new TextDecoder(littleEndian ? 'utf-16le' : 'utf-16be').decode(body.subarray(0, evenLength));
  } else if (hasAscii(view, start, 'JIS')) {
    return null;
  } else {
    // "ASCII", or eight zero bytes for "undefined", which in practice is plain text too.
    text = decodeText(body);
  }

  // Comments are padded with NULs or spaces to their allotted size.
  const end = text.indexOf('\0');
  return clampText((end < 0 ? text : text.slice(0, end)).trim()) || 'Empty';
}

function readValue(
  view: DataView,
  tiffStart: number,
  tag: number,
  type: number,
  count: number,
  valueOffset: number,
  littleEndian: boolean
): string {
  const typeSize = TYPE_SIZES[type];

  if (!typeSize) {
    return 'Unsupported value type';
  }

  // Up to four bytes sit in the entry itself; anything longer is stored elsewhere.
  const totalSize = typeSize * count;
  const valueStart =
    totalSize <= 4 ? valueOffset : tiffStart + view.getUint32(valueOffset, littleEndian);

  if (valueStart < 0 || valueStart >= view.byteLength) {
    return 'Out of bounds';
  }

  if (type === TYPE_ASCII) {
    return clampText(readText(view, valueStart, count)) || 'Empty';
  }

  if (type === TYPE_UNDEFINED) {
    if (tag === TAG_USER_COMMENT) {
      const comment = readUserComment(view, valueStart, count, littleEndian);
      if (comment !== null) return comment;
    }

    // Version stamps such as "0232" are stored as untyped bytes but are text.
    const bytes = readBytes(view, valueStart, count);
    if (count >= 4 && bytes.length === count && bytes.every((byte) => byte >= 0x20 && byte <= 0x7e)) {
      return clampText(decodeText(bytes).trim()) || 'Empty';
    }
  }

  const values: Array<number | string> = [];
  const listed = Math.min(count, MAX_LISTED_VALUES);

  for (let index = 0; index < listed; index += 1) {
    const itemOffset = valueStart + index * typeSize;

    if (itemOffset + typeSize > view.byteLength) {
      break;
    }

    if (type === TYPE_RATIONAL) {
      values.push(
        formatRational(
          view.getUint32(itemOffset, littleEndian),
          view.getUint32(itemOffset + 4, littleEndian)
        )
      );
    } else if (type === TYPE_SRATIONAL) {
      values.push(
        formatRational(
          view.getInt32(itemOffset, littleEndian),
          view.getInt32(itemOffset + 4, littleEndian)
        )
      );
    } else if (type === TYPE_SLONG) {
      values.push(view.getInt32(itemOffset, littleEndian));
    } else if (typeSize === 4) {
      values.push(view.getUint32(itemOffset, littleEndian));
    } else if (typeSize === 2) {
      values.push(view.getUint16(itemOffset, littleEndian));
    } else {
      values.push(view.getUint8(itemOffset));
    }
  }

  return listValues(values, count);
}

function parseIfd(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  littleEndian: boolean,
  title: string,
  visited: Set<number>
): ExifSection[] {
  const absoluteOffset = tiffStart + ifdOffset;

  if (visited.has(absoluteOffset) || absoluteOffset + 2 > view.byteLength) {
    return [];
  }

  visited.add(absoluteOffset);

  const entryCount = view.getUint16(absoluteOffset, littleEndian);
  const fields: ExifField[] = [];
  let exifPointer: number | null = null;
  let gpsPointer: number | null = null;

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = absoluteOffset + 2 + index * 12;

    if (entryOffset + 12 > view.byteLength) {
      break;
    }

    const tag = view.getUint16(entryOffset, littleEndian);
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    const label = TAG_NAMES[tag] ?? `Tag 0x${tag.toString(16).padStart(4, '0')}`;

    if (tag === TAG_EXIF_IFD) {
      exifPointer = view.getUint32(entryOffset + 8, littleEndian);
      continue;
    }

    if (tag === TAG_GPS_IFD) {
      gpsPointer = view.getUint32(entryOffset + 8, littleEndian);
      continue;
    }

    if (tag === TAG_MAKER_NOTE) {
      continue;
    }

    const value = readValue(view, tiffStart, tag, type, count, entryOffset + 8, littleEndian);

    if (value) {
      fields.push({ label, value });
    }
  }

  const sections: ExifSection[] = fields.length > 0 ? [{ title, fields }] : [];

  if (exifPointer !== null) {
    sections.push(
      ...parseIfd(view, tiffStart, exifPointer, littleEndian, 'EXIF', visited)
    );
  }

  if (gpsPointer !== null) {
    sections.push(
      ...parseIfd(view, tiffStart, gpsPointer, littleEndian, 'GPS', visited)
    );
  }

  return sections;
}

function parseTiff(view: DataView, tiffStart: number): ExifSection[] {
  // Byte order mark, the number 42 and the offset of the first directory.
  if (tiffStart + 8 > view.byteLength) {
    return [];
  }

  const littleEndian = hasAscii(view, tiffStart, 'II');

  if (!littleEndian && !hasAscii(view, tiffStart, 'MM')) {
    return [];
  }

  if (view.getUint16(tiffStart + 2, littleEndian) !== 42) {
    return [];
  }

  const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
  const sections = parseIfd(view, tiffStart, firstIfdOffset, littleEndian, 'Image', new Set<number>());

  return sections
    .map((section) => ({
      title: section.title,
      fields: section.fields.filter((field, index, array) => {
        return array.findIndex((candidate) => candidate.label === field.label) === index;
      }),
    }))
    .filter((section) => section.fields.length > 0);
}

function findExifSections(view: DataView): ExifSection[] {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) {
    return [];
  }

  let offset = 2;

  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    offset += 2;

    if (marker === 0xffda || marker === 0xffd9) {
      break;
    }

    const segmentLength = view.getUint16(offset);

    if (segmentLength < 2 || offset + segmentLength > view.byteLength) {
      break;
    }

    if (marker === 0xffe1 && hasAscii(view, offset + 2, 'Exif\0')) {
      return parseTiff(view, offset + 8);
    }

    offset += segmentLength;
  }

  return [];
}

/**
 * The EXIF tags of a JPEG, grouped into its Image, EXIF and GPS directories.
 * Returns an empty list for anything else.
 */
export function parseExifSections(buffer: ArrayBuffer): ExifSection[] {
  try {
    return findExifSections(new DataView(buffer));
  } catch {
    // Every read is bounds-checked; this is only a net under a file crafted to get past them.
    return [];
  }
}

/**
 * Makes every name in the list distinct, the way a file manager does:
 * `photo.jpg`, `photo (2).jpg`, `photo (3).jpg`. Names are compared without
 * regard to case, because that is how most file systems unpack an archive.
 * A ZIP entry added under a name that is already taken replaces the first one.
 */
export function uniqueFileNames(names: readonly string[]): string[] {
  const taken = new Set<string>();

  return names.map((name) => {
    const { base, extension } = splitFileName(name);
    let candidate = name;

    for (let copy = 2; taken.has(candidate.toLowerCase()); copy += 1) {
      candidate = extension ? `${base} (${copy}).${extension}` : `${base} (${copy})`;
    }

    taken.add(candidate.toLowerCase());
    return candidate;
  });
}
