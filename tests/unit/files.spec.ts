import { test, expect } from '@playwright/test';
import {
  downloadBlob,
  downloadBytes,
  downloadDataUrl,
  downloadText,
  formatBytes,
  matchesAccept,
  outputFileName,
  sanitizeFileName,
  splitFileName,
  validateFile,
  validateFiles,
} from '@/lib/files';

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;
const TB = 1024 * GB;

const file = (name: string, type = '', size = 0) => ({ name, type, size });

test.describe('formatBytes', () => {
  test('labels whole bytes below 1 KB', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
    expect(formatBytes(1)).toBe('1 Byte');
    expect(formatBytes(2)).toBe('2 Bytes');
    expect(formatBytes(1023)).toBe('1023 Bytes');
  });

  test('switches unit at each power of 1024', () => {
    expect(formatBytes(KB)).toBe('1 KB');
    expect(formatBytes(MB)).toBe('1 MB');
    expect(formatBytes(GB)).toBe('1 GB');
    expect(formatBytes(TB)).toBe('1 TB');
  });

  test('keeps at most two decimals and trims trailing zeros', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1234567)).toBe('1.18 MB');
    expect(formatBytes(2.25 * MB)).toBe('2.25 MB');
    expect(formatBytes(5.5 * GB)).toBe('5.5 GB');
  });

  test('stays in the largest unit for sizes beyond it', () => {
    expect(formatBytes(2048 * TB)).toBe('2048 TB');
  });

  test('rounds within the unit rather than up to the next one', () => {
    expect(formatBytes(MB - 1)).toBe('1024 KB');
  });

  test('treats anything that is not a positive size as zero', () => {
    expect(formatBytes(-5)).toBe('0 Bytes');
    expect(formatBytes(Number.NaN)).toBe('0 Bytes');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 Bytes');
  });

  test('can keep trailing zeros and use the short byte label', () => {
    const style = { fixed: true, byteUnit: 'B' } as const;
    expect(formatBytes(0, style)).toBe('0 B');
    expect(formatBytes(1, style)).toBe('1 B');
    expect(formatBytes(1023, style)).toBe('1023 B');
    expect(formatBytes(KB, style)).toBe('1.00 KB');
    expect(formatBytes(1536, style)).toBe('1.50 KB');
    expect(formatBytes(2.5 * MB, style)).toBe('2.50 MB');
  });

  test('takes the number of decimals for every unit or per unit', () => {
    expect(formatBytes(1536, { decimals: 0 })).toBe('2 KB');
    expect(formatBytes(1234567, { decimals: 1, fixed: true })).toBe('1.2 MB');
    expect(formatBytes(KB, { decimals: 1, fixed: true })).toBe('1.0 KB');

    const perUnit = { fixed: true, decimals: { KB: 1 } } as const;
    expect(formatBytes(1536, perUnit)).toBe('1.5 KB');
    expect(formatBytes(2.5 * MB, perUnit)).toBe('2.50 MB');
  });
});

test.describe('file names', () => {
  test('splitFileName splits at the last dot', () => {
    expect(splitFileName('photo.jpg')).toEqual({ base: 'photo', extension: 'jpg' });
    expect(splitFileName('photo.final.JPG')).toEqual({ base: 'photo.final', extension: 'JPG' });
    expect(splitFileName('archive.tar.gz')).toEqual({ base: 'archive.tar', extension: 'gz' });
  });

  test('splitFileName finds no extension without a dot, after a leading dot or a trailing one', () => {
    expect(splitFileName('README')).toEqual({ base: 'README', extension: '' });
    expect(splitFileName('.gitignore')).toEqual({ base: '.gitignore', extension: '' });
    expect(splitFileName('notes.')).toEqual({ base: 'notes', extension: '' });
  });

  test('outputFileName replaces the extension', () => {
    expect(outputFileName('scan.pdf', { extension: 'docx' })).toBe('scan.docx');
    expect(outputFileName('scan.pdf', { extension: '.docx' })).toBe('scan.docx');
    expect(outputFileName('Report.PDF', { extension: 'docx' })).toBe('Report.docx');
  });

  test('outputFileName only replaces the last of several extensions', () => {
    expect(outputFileName('archive.tar.gz', { extension: 'zip' })).toBe('archive.tar.zip');
    expect(outputFileName('v1.2.final.png', { extension: 'webp' })).toBe('v1.2.final.webp');
  });

  test('outputFileName adds an extension to a name that has none', () => {
    expect(outputFileName('README', { extension: 'md' })).toBe('README.md');
    expect(outputFileName('.env', { extension: 'txt' })).toBe('.env.txt');
  });

  test('outputFileName keeps the extension unless told otherwise', () => {
    expect(outputFileName('scan.pdf')).toBe('scan.pdf');
    expect(outputFileName('scan.pdf', { prefix: 'edited-' })).toBe('edited-scan.pdf');
    expect(outputFileName('scan.pdf', { extension: '' })).toBe('scan');
    expect(outputFileName('README', { suffix: '-copy' })).toBe('README-copy');
  });

  test('outputFileName puts the suffix before the extension', () => {
    expect(outputFileName('photo.jpg', { suffix: '-clean', extension: 'png' })).toBe('photo-clean.png');
    expect(outputFileName('photo.jpg', { prefix: 'x-', suffix: '-y' })).toBe('x-photo-y.jpg');
  });

  test('outputFileName falls back to a generic base for an empty name', () => {
    expect(outputFileName('', { extension: 'png' })).toBe('file.png');
  });

  test('sanitizeFileName replaces characters a file system rejects', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j');
    expect(sanitizeFileName('line one\nline\ttwo\u0000')).toBe('line one line two');
  });

  test('sanitizeFileName collapses whitespace and trims', () => {
    expect(sanitizeFileName('  My   Report:  Q3  ')).toBe('My Report Q3');
  });

  test('sanitizeFileName leaves ordinary names, dots and non-ASCII letters alone', () => {
    expect(sanitizeFileName('Version 2.0 notes')).toBe('Version 2.0 notes');
    expect(sanitizeFileName('Özgeçmiş – 2026')).toBe('Özgeçmiş – 2026');
  });

  test('sanitizeFileName falls back when nothing usable is left', () => {
    expect(sanitizeFileName('')).toBe('download');
    expect(sanitizeFileName(' ?*: ')).toBe('download');
    expect(sanitizeFileName('///', 'markdown-export')).toBe('markdown-export');
  });
});

test.describe('matchesAccept', () => {
  test('accepts everything when there is no list', () => {
    expect(matchesAccept(file('anything.bin'))).toBe(true);
    expect(matchesAccept(file('anything.bin'), '')).toBe(true);
    expect(matchesAccept(file('anything.bin'), '*/*')).toBe(true);
  });

  test('matches a MIME wildcard on the type only', () => {
    expect(matchesAccept(file('a.png', 'image/png'), 'image/*')).toBe(true);
    expect(matchesAccept(file('a.svg', 'image/svg+xml'), 'image/*')).toBe(true);
    expect(matchesAccept(file('a.png', ''), 'image/*')).toBe(false);
    expect(matchesAccept(file('a.txt', 'text/plain'), 'image/*')).toBe(false);
    expect(matchesAccept(file('a.bin', 'imagery/x'), 'image/*')).toBe(false);
  });

  test('matches an exact MIME type, ignoring case and parameters', () => {
    expect(matchesAccept(file('a.pdf', 'application/pdf'), 'application/pdf')).toBe(true);
    expect(matchesAccept(file('a.pdf', 'Application/PDF'), 'application/pdf')).toBe(true);
    expect(matchesAccept(file('a.html', 'text/html;charset=utf-8'), 'text/html')).toBe(true);
    expect(matchesAccept(file('a.pdf', ''), 'application/pdf')).toBe(false);
  });

  test('matches an extension on the name, ignoring case', () => {
    expect(matchesAccept(file('doc.pdf'), '.pdf')).toBe(true);
    expect(matchesAccept(file('DOC.PDF'), '.pdf')).toBe(true);
    expect(matchesAccept(file('doc.pdf.txt'), '.pdf')).toBe(false);
    expect(matchesAccept(file('pdf'), '.pdf')).toBe(false);
  });

  test('passes when any entry of a list matches', () => {
    const accept = ' .svg , image/svg+xml ';
    expect(matchesAccept(file('icon.svg', ''), accept)).toBe(true);
    expect(matchesAccept(file('icon', 'image/svg+xml'), accept)).toBe(true);
    expect(matchesAccept(file('icon.png', 'image/png'), accept)).toBe(false);
  });
});

test.describe('validateFile', () => {
  test('returns null for a file that passes', () => {
    expect(validateFile(file('a.png', 'image/png', 10))).toBeNull();
    expect(validateFile(file('a.png', 'image/png', 10), { accept: 'image/*', maxSize: 10 })).toBeNull();
  });

  test('rejects a wrong type and names what is accepted', () => {
    const notes = file('notes.txt', 'text/plain', 10);

    expect(validateFile(notes, { accept: 'image/*' })).toEqual({
      file: notes,
      reason: 'type',
      message: '"notes.txt" is not a supported file type. Accepted: image files.',
    });
    expect(validateFile(notes, { accept: '.pdf,application/pdf' })?.message).toBe(
      '"notes.txt" is not a supported file type. Accepted: .pdf.'
    );
    expect(validateFile(notes, { accept: 'image/png, image/jpeg' })?.message).toBe(
      '"notes.txt" is not a supported file type. Accepted: image/png, image/jpeg.'
    );
    expect(validateFile(notes, { accept: 'image/*,.pdf,.docx' })?.message).toBe(
      '"notes.txt" is not a supported file type. Accepted: image files, .pdf, .docx.'
    );
  });

  test('rejects a file over the size limit and states both sizes', () => {
    const big = file('scan.pdf', 'application/pdf', 12.5 * MB);

    expect(validateFile(big, { accept: '.pdf', maxSize: 10 * MB })).toEqual({
      file: big,
      reason: 'size',
      message: '"scan.pdf" is too large (12.5 MB). The limit is 10 MB.',
    });
  });

  test('allows a file exactly at the size limit', () => {
    expect(validateFile(file('a.pdf', 'application/pdf', 10 * MB), { maxSize: 10 * MB })).toBeNull();
    expect(validateFile(file('a.pdf', 'application/pdf', 10 * MB + 1), { maxSize: 10 * MB })?.reason).toBe('size');
  });

  test('reports the type before the size', () => {
    const rejection = validateFile(file('huge.txt', 'text/plain', GB), { accept: 'image/*', maxSize: MB });
    expect(rejection?.reason).toBe('type');
  });
});

test.describe('validateFiles', () => {
  const rules = { accept: 'image/*', maxSize: MB };
  const photo = file('photo.jpg', 'image/jpeg', 1000);
  const icon = file('icon.png', 'image/png', 2000);
  const notes = file('notes.txt', 'text/plain', 10);
  const poster = file('poster.png', 'image/png', 3 * MB);
  const sheet = file('sheet.csv', 'text/csv', 10);

  test('accepts everything when nothing is wrong', () => {
    expect(validateFiles([photo, icon], rules)).toEqual({ accepted: [photo, icon], rejected: [], error: null });
    expect(validateFiles([], rules)).toEqual({ accepted: [], rejected: [], error: null });
  });

  test('separates accepted from rejected files and keeps their order', () => {
    const result = validateFiles([notes, photo, poster, icon], rules);

    expect(result.accepted).toEqual([photo, icon]);
    expect(result.rejected.map((rejection) => [rejection.file, rejection.reason])).toEqual([
      [notes, 'type'],
      [poster, 'size'],
    ]);
  });

  test('uses the rejection message as the error when one file is rejected', () => {
    expect(validateFiles([photo, notes], rules).error).toBe(
      '"notes.txt" is not a supported file type. Accepted: image files.'
    );
  });

  test('counts the other rejected files in the error', () => {
    expect(validateFiles([notes, poster], rules).error).toBe(
      '"notes.txt" is not a supported file type. Accepted: image files. 1 more file was skipped.'
    );
    expect(validateFiles([poster, notes, sheet], rules).error).toBe(
      '"poster.png" is too large (3 MB). The limit is 1 MB. 2 more files were skipped.'
    );
  });
});

// The download functions only reach for `document`, `URL` and `setTimeout`,
// so hand-written stand-ins are enough to check what they do with them.
test.describe('downloads', () => {
  interface FakeBrowser {
    /** Every link click, with whether the link was in the document at the time. */
    clicks: Array<{ href: string; download: string; attached: boolean }>;
    /** Blobs an object URL was made for; the nth one gets `blob:fake/n`. */
    blobs: Blob[];
    revoked: string[];
    /** Callbacks passed to setTimeout, not yet run. */
    timers: Array<() => void>;
    /** Links currently in the document. */
    attached: number;
    failClick: boolean;
  }

  const globals = globalThis as unknown as { document?: unknown; setTimeout: unknown };
  const urls = URL as unknown as {
    createObjectURL: (blob: Blob) => string;
    revokeObjectURL: (url: string) => void;
  };

  // Swaps the stand-ins in for the duration of `run`, which is synchronous.
  function withFakeBrowser(run: (browser: FakeBrowser) => void): FakeBrowser {
    const browser: FakeBrowser = {
      clicks: [],
      blobs: [],
      revoked: [],
      timers: [],
      attached: 0,
      failClick: false,
    };
    const original = {
      document: globals.document,
      setTimeout: globals.setTimeout,
      createObjectURL: urls.createObjectURL,
      revokeObjectURL: urls.revokeObjectURL,
    };

    globals.document = {
      createElement: () => {
        const link = {
          href: '',
          download: '',
          style: {},
          click() {
            if (browser.failClick) throw new Error('click failed');
            browser.clicks.push({ href: link.href, download: link.download, attached: browser.attached > 0 });
          },
          remove() {
            browser.attached -= 1;
          },
        };
        return link;
      },
      body: {
        appendChild() {
          browser.attached += 1;
        },
      },
    };
    globals.setTimeout = (callback: () => void) => {
      browser.timers.push(callback);
      return 0;
    };
    urls.createObjectURL = (blob) => {
      browser.blobs.push(blob);
      return `blob:fake/${browser.blobs.length}`;
    };
    urls.revokeObjectURL = (url) => {
      browser.revoked.push(url);
    };

    try {
      run(browser);
    } finally {
      globals.document = original.document;
      globals.setTimeout = original.setTimeout;
      urls.createObjectURL = original.createObjectURL;
      urls.revokeObjectURL = original.revokeObjectURL;
    }

    return browser;
  }

  test('downloadBlob clicks a link to the blob, in the document, named after the file', () => {
    const blob = new Blob(['zip bytes'], { type: 'application/zip' });
    const browser = withFakeBrowser(() => downloadBlob(blob, 'images.zip'));

    expect(browser.blobs).toEqual([blob]);
    expect(browser.clicks).toEqual([{ href: 'blob:fake/1', download: 'images.zip', attached: true }]);
    expect(browser.attached).toBe(0);
  });

  test('downloadBlob revokes the object URL later, not during the click', () => {
    withFakeBrowser((browser) => {
      downloadBlob(new Blob(['x']), 'x.bin');

      expect(browser.revoked).toEqual([]);
      expect(browser.timers).toHaveLength(1);

      browser.timers[0]();
      expect(browser.revoked).toEqual(['blob:fake/1']);
    });
  });

  test('downloadBlob still schedules the revoke when the click fails', () => {
    let seen: FakeBrowser | undefined;

    expect(() =>
      withFakeBrowser((browser) => {
        seen = browser;
        browser.failClick = true;
        downloadBlob(new Blob(['x']), 'x.bin');
      })
    ).toThrow('click failed');

    expect(seen?.timers).toHaveLength(1);
  });

  test('downloadText saves the text with the given type, plain text by default', async () => {
    const browser = withFakeBrowser(() => {
      downloadText('a,b\n1,2', 'data.csv', 'text/csv');
      downloadText('hello', 'note.txt');
    });

    expect(browser.clicks.map((click) => click.download)).toEqual(['data.csv', 'note.txt']);
    expect(browser.blobs.map((blob) => blob.type)).toEqual(['text/csv', 'text/plain']);
    expect(await browser.blobs[0].text()).toBe('a,b\n1,2');
    expect(await browser.blobs[1].text()).toBe('hello');
  });

  test('downloadBytes saves a typed array or an ArrayBuffer unchanged', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const browser = withFakeBrowser(() => {
      downloadBytes(bytes, 'out.pdf', 'application/pdf');
      downloadBytes(bytes.buffer, 'out.bin');
    });

    expect(browser.blobs.map((blob) => blob.type)).toEqual(['application/pdf', 'application/octet-stream']);
    expect(Array.from(new Uint8Array(await browser.blobs[0].arrayBuffer()))).toEqual([37, 80, 68, 70]);
    expect(Array.from(new Uint8Array(await browser.blobs[1].arrayBuffer()))).toEqual([37, 80, 68, 70]);
  });

  test('downloadDataUrl links straight to the data URL and makes no object URL', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const browser = withFakeBrowser(() => downloadDataUrl(dataUrl, 'qr-code.png'));

    expect(browser.clicks).toEqual([{ href: dataUrl, download: 'qr-code.png', attached: true }]);
    expect(browser.blobs).toEqual([]);
    expect(browser.timers).toEqual([]);
  });
});
