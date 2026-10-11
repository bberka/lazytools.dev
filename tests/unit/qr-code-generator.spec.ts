import { test, expect } from '@playwright/test';
import { prepareQrRequest, qrFileBaseName, type QrForm } from '@/lib/tools/qr-code-generator';

const form = (overrides: Partial<QrForm> = {}): QrForm => ({
  content: 'https://lazytools.dev',
  size: '320',
  margin: '2',
  foregroundColor: '#111827',
  backgroundColor: '#FFFFFF',
  errorCorrectionLevel: 'M',
  ...overrides,
});

function requestOf(overrides: Partial<QrForm> = {}) {
  const result = prepareQrRequest(form(overrides));
  if (!result.ok) throw new Error(result.error);
  return result.request;
}

function errorOf(overrides: Partial<QrForm>): string {
  const result = prepareQrRequest(form(overrides));
  if (result.ok) throw new Error('expected an error');
  return result.error;
}

test.describe('prepareQrRequest', () => {
  test('builds the request for the default form', () => {
    expect(requestOf()).toEqual({
      text: 'https://lazytools.dev',
      options: {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 320,
        color: { dark: '#111827', light: '#FFFFFF' },
      },
      fileBaseName: 'https-lazytools-dev',
    });
  });

  test('trims the content and keeps what is inside it', () => {
    expect(requestOf({ content: '  line one\nline two  ' }).text).toBe('line one\nline two');
    expect(requestOf({ content: ' 你好 🌍 ' }).text).toBe('你好 🌍');
  });

  test('asks for content when there is none', () => {
    expect(errorOf({ content: '' })).toBe('Enter text or a URL to generate a QR code.');
    expect(errorOf({ content: ' \n\t ' })).toBe('Enter text or a URL to generate a QR code.');
  });

  test('accepts sizes from 128 to 2048 and rounds them to whole pixels', () => {
    expect(requestOf({ size: '128' }).options.width).toBe(128);
    expect(requestOf({ size: '2048' }).options.width).toBe(2048);
    expect(requestOf({ size: '320.6' }).options.width).toBe(321);
  });

  test('rejects sizes out of range or not a number', () => {
    const message = 'Size must be between 128 and 2048 pixels.';
    expect(errorOf({ size: '127' })).toBe(message);
    expect(errorOf({ size: '2049' })).toBe(message);
    expect(errorOf({ size: '' })).toBe(message);
    expect(errorOf({ size: 'abc' })).toBe(message);
    expect(errorOf({ size: '-320' })).toBe(message);
  });

  test('accepts margins from 0 to 10', () => {
    expect(requestOf({ margin: '0' }).options.margin).toBe(0);
    expect(requestOf({ margin: '10' }).options.margin).toBe(10);
  });

  test('rejects margins out of range, and a blank margin instead of reading it as 0', () => {
    const message = 'Margin must be between 0 and 10.';
    expect(errorOf({ margin: '-1' })).toBe(message);
    expect(errorOf({ margin: '11' })).toBe(message);
    expect(errorOf({ margin: '' })).toBe(message);
    expect(errorOf({ margin: '  ' })).toBe(message);
  });

  test('passes every error correction level through', () => {
    for (const level of ['L', 'M', 'Q', 'H'] as const) {
      expect(requestOf({ errorCorrectionLevel: level }).options.errorCorrectionLevel).toBe(level);
    }
  });

  test('turns a "none" background into a transparent one', () => {
    expect(requestOf({ backgroundColor: 'none' }).options.color.light).toBe('#00000000');
    expect(requestOf({ backgroundColor: 'NONE' }).options.color.light).toBe('#00000000');
  });

  test('refuses a foreground that is not a colour, which would draw nothing', () => {
    expect(errorOf({ foregroundColor: 'none' })).toBe('Choose a foreground color.');
    expect(errorOf({ foregroundColor: '#12' })).toBe('Choose a foreground color.');
    expect(errorOf({ foregroundColor: '' })).toBe('Choose a foreground color.');
    expect(errorOf({ backgroundColor: 'white' })).toBe('Choose a background color.');
  });

  test('refuses identical colours, however they are written', () => {
    const message = 'Foreground and background colors must be different.';
    expect(errorOf({ foregroundColor: '#ffffff', backgroundColor: '#FFFFFF' })).toBe(message);
    expect(errorOf({ foregroundColor: '#fff', backgroundColor: '#FFFFFF' })).toBe(message);
    expect(errorOf({ foregroundColor: '#000000', backgroundColor: '#000000ff' })).toBe(message);
  });

  test('reports the first problem only', () => {
    expect(errorOf({ content: '', size: '1', margin: '99' })).toBe('Enter text or a URL to generate a QR code.');
    expect(errorOf({ size: '1', margin: '99' })).toBe('Size must be between 128 and 2048 pixels.');
  });
});

test.describe('qrFileBaseName', () => {
  test('makes a hyphenated lower-case name', () => {
    expect(qrFileBaseName('https://lazytools.dev')).toBe('https-lazytools-dev');
    expect(qrFileBaseName('  Hello, World!  ')).toBe('hello-world');
  });

  test('falls back when nothing usable is left', () => {
    expect(qrFileBaseName('')).toBe('qr-code');
    expect(qrFileBaseName('你好')).toBe('qr-code');
    expect(qrFileBaseName('!!!')).toBe('qr-code');
  });

  test('keeps the name short enough for any file system', () => {
    const long = qrFileBaseName(`https://example.com/${'path/'.repeat(600)}`);
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.startsWith('https-example-com-path')).toBe(true);
    expect(long.endsWith('-')).toBe(false);
  });
});
