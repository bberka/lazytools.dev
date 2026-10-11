/**
 * Writing a canvas out as an image file, shared by the image tools: which
 * types a canvas can encode, what the resulting files are called, and a
 * promise around `canvas.toBlob`.
 *
 * A browser that cannot encode the requested type (WebP in some of them)
 * silently writes PNG instead, so the type of the Blob that comes back is the
 * only reliable statement of what was written. Name the file from that, never
 * from the type that was asked for.
 */

/** The image types `canvas.toBlob` is asked for in this app. */
export type CanvasImageType = 'image/png' | 'image/jpeg' | 'image/webp';

const EXTENSIONS: Record<CanvasImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function isCanvasImageType(type: string): type is CanvasImageType {
  return type in EXTENSIONS;
}

/**
 * The type to write when the result should keep the format of a source file:
 * PNG, JPEG and WebP stay what they are, everything a canvas cannot encode
 * (GIF, BMP, SVG, AVIF, an unknown type) becomes PNG.
 */
export function canvasImageType(sourceType: string): CanvasImageType {
  const type = sourceType.split(';')[0].trim().toLowerCase();
  return isCanvasImageType(type) ? type : 'image/png';
}

/** File extension, without the dot, for an image a canvas wrote: `jpg`, `png` or `webp`. */
export function imageTypeExtension(type: string): string {
  return EXTENSIONS[canvasImageType(type)];
}

/** The part of a canvas this module needs, so it can be exercised without a DOM. */
export interface BlobSource {
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void;
}

/**
 * `canvas.toBlob` as a promise. `quality` (0 to 1) only matters for JPEG and
 * WebP. Rejects when the browser produces nothing, which is what happens for
 * an empty canvas or one larger than the browser can allocate.
 */
export function canvasToBlob(canvas: BlobSource, type: CanvasImageType, quality?: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('The image could not be encoded. It may be too large for this browser.'));
      },
      type,
      quality
    );
  });
}
