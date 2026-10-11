import { test, expect } from '@playwright/test';
import {
  canvasImageType,
  canvasToBlob,
  imageTypeExtension,
  type BlobSource,
} from '@/lib/tools/image-canvas';

/** A stand-in for a canvas that hands `toBlob` whatever the test decides. */
function fakeCanvas(write: (type?: string, quality?: number) => Blob | null): BlobSource {
  return {
    toBlob(callback, type, quality) {
      callback(write(type, quality));
    },
  };
}

test.describe('canvasImageType', () => {
  test('keeps the three types a canvas can write', () => {
    expect(canvasImageType('image/png')).toBe('image/png');
    expect(canvasImageType('image/jpeg')).toBe('image/jpeg');
    expect(canvasImageType('image/webp')).toBe('image/webp');
  });

  test('turns everything else into PNG', () => {
    for (const type of ['image/gif', 'image/bmp', 'image/svg+xml', 'image/avif', 'image/x-icon', 'text/plain', '']) {
      expect(canvasImageType(type)).toBe('image/png');
    }
  });

  test('ignores case and parameters', () => {
    expect(canvasImageType('IMAGE/JPEG')).toBe('image/jpeg');
    expect(canvasImageType('image/webp; charset=binary')).toBe('image/webp');
  });
});

test.describe('imageTypeExtension', () => {
  test('names the file after its type', () => {
    expect(imageTypeExtension('image/jpeg')).toBe('jpg');
    expect(imageTypeExtension('image/png')).toBe('png');
    expect(imageTypeExtension('image/webp')).toBe('webp');
  });

  test('uses png for a type a canvas cannot write', () => {
    expect(imageTypeExtension('image/gif')).toBe('png');
    expect(imageTypeExtension('')).toBe('png');
  });
});

test.describe('canvasToBlob', () => {
  test('resolves with the blob and passes type and quality on', async () => {
    const seen: Array<[string | undefined, number | undefined]> = [];
    const canvas = fakeCanvas((type, quality) => {
      seen.push([type, quality]);
      return new Blob(['x'], { type });
    });

    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);

    expect(blob.type).toBe('image/jpeg');
    expect(seen).toEqual([['image/jpeg', 0.92]]);
  });

  test('rejects when the browser produces nothing', async () => {
    // An empty canvas, or one too large to allocate, calls back with null.
    // The tools used to wait for a result that never came.
    const canvas = fakeCanvas(() => null);

    await expect(canvasToBlob(canvas, 'image/png')).rejects.toThrow(/could not be encoded/);
  });

  test('a PNG fallback is named png, not after the type that was asked for', async () => {
    // A browser without a WebP encoder writes PNG and says so in the blob type.
    // The cleaned file used to be called .webp anyway.
    const canvas = fakeCanvas(() => new Blob(['x'], { type: 'image/png' }));

    const blob = await canvasToBlob(canvas, 'image/webp', 0.92);

    expect(imageTypeExtension(blob.type)).toBe('png');
  });
});
