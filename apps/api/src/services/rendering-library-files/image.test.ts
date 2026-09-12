import { describe, expect, test } from 'bun:test';
import { deflateSync } from 'node:zlib';
import sharp from 'sharp';

import { RENDERING_UPLOAD_MAX_BYTES } from '@gooes/domain';

import { normalizeRenderingSource } from './image';

// Independent ImageMagick/cwebp fixtures, also exercised by
// branding-image-metadata-libvips.test.ts:
// magick -size 16x12 xc:'#336699' -strip /tmp/branding-logo-static.png
// magick -size 16x12 xc:'#336699' -strip -quality 90 /tmp/branding-logo-static.jpg
// cwebp -quiet -lossless /tmp/branding-logo-static.png -o /tmp/branding-logo-static.webp
const STATIC_FIXTURES = [
  ['PNG', 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAMAQMAAABRKa/CAAAAA1BMVEUzZpk7I4HSAAAAC0lEQVQI12NgIAwAACQAAS4ecaAAAAAASUVORK5CYII=', 'image/png'],
  ['JPEG', '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAMABADAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCRK2l4AAD/2Q==', 'image/jpeg'],
  ['WebP', 'UklGRh4AAABXRUJQVlA4TBEAAAAvD8ACAAdQs840s/+BiOh/AAA=', 'image/webp'],
] as const;
const PNG_BYTES = Buffer.from(STATIC_FIXTURES[0][1], 'base64');
const ANIMATED_WEBP = 'UklGRsAAAABXRUJQVlA4WAoAAAACAAAADwAACwAAQU5JTQYAAAD/////AABBTk1GSAAAAAAAAAAAAA8AAAsAAGQAAAJWUDggMAAAANABAJ0BKhAADAACADQloAJ0ugH4AAOwAP7wxAv/ILlhdcjX/yA/5Af8gP/48gAAAEFOTUZEAAAAAAAAAAAADwAACwAAZAAAAFZQOCAsAAAAlAEAnQEqEAAMAAAANCWgAnS6AAOYAP75k2//kB//kB//kB//ID/iF3sgMAA=';
const UNDECODABLE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAQAAAAFACAYAAABTKqIKAAAAC0lEQVR4AQEAAP//AAAAAYnWrl8AAAAASUVORK5CYII=';

function uint32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

// Encode PNG chunks independently of sharp using the PNG CRC-32 polynomial.
function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return Buffer.concat([uint32(data.length), body, uint32((crc ^ 0xffffffff) >>> 0)]);
}

function createMonochromePng(width: number, height: number): Buffer {
  const rows = Buffer.alloc((Math.ceil(width / 8) + 1) * height);
  return Buffer.concat([
    PNG_BYTES.subarray(0, 8),
    pngChunk('IHDR', Buffer.concat([uint32(width), uint32(height), Buffer.from([1, 0, 0, 0, 0])])),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Independently encoded APNG: default image is frame 0, followed by frame 1.
// acTL/fcTL/fdAT follow the PNG animation extension; libvips may report only
// the default image, so checking metadata.pages alone does not protect it.
function createAnimatedPng(): Buffer {
  const frameControl = (sequence: number) => Buffer.concat([
    uint32(sequence), uint32(1), uint32(1), uint32(0), uint32(0),
    Buffer.from([0, 1, 0, 10, 0, 0]),
  ]);
  return Buffer.concat([
    PNG_BYTES.subarray(0, 8),
    pngChunk('IHDR', Buffer.concat([uint32(1), uint32(1), Buffer.from([8, 6, 0, 0, 0])])),
    pngChunk('acTL', Buffer.concat([uint32(2), uint32(0)])),
    pngChunk('fcTL', frameControl(0)),
    pngChunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))),
    pngChunk('fcTL', frameControl(1)),
    pngChunk('fdAT', Buffer.concat([uint32(2), deflateSync(Buffer.from([0, 0, 0, 255, 255]))])),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function expectRejected(bytes: Buffer, mimeType = 'image/png'): Promise<void> {
  await expect(normalizeRenderingSource({ bytes, mimeType })).rejects.toMatchObject({
    statusCode: 422,
    code: 'RENDERING_IMAGE_REJECTED',
    message: '请上传 10 MB 内的静态 JPEG、PNG 或 WebP 图片，图片总像素不能超过 16777216',
    details: undefined,
  });
}

describe('normalizeRenderingSource', () => {
  test.each(STATIC_FIXTURES)('normalizes independently encoded %s into decodable WebP', async (_name, base64, mimeType) => {
    const result = await normalizeRenderingSource({ bytes: Buffer.from(base64, 'base64'), mimeType });
    expect(result).toMatchObject({ mimeType: 'image/webp', width: 16, height: 12 });
    expect(Buffer.isBuffer(result.bytes)).toBe(true);
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.bytes.length).toBeLessThanOrEqual(RENDERING_UPLOAD_MAX_BYTES);
    expect(await sharp(result.bytes).metadata()).toMatchObject({ format: 'webp', width: 16, height: 12 });
    await expect(sharp(result.bytes).raw().toBuffer()).resolves.toBeInstanceOf(Buffer);
  });

  test('rotates orientation 6 before reporting dimensions and removes EXIF', async () => {
    const bytes = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#776655' } })
      .withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect((await sharp(bytes).metadata()).exif).toBeDefined();
    const result = await normalizeRenderingSource({ bytes, mimeType: 'image/jpeg' });
    expect(result).toMatchObject({ mimeType: 'image/webp', width: 10, height: 20 });
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata).toMatchObject({ width: 10, height: 20 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
  });

  test('accepts the 10 MiB boundary without inheriting the branding 2 MiB limit', async () => {
    const jpeg = Buffer.from(STATIC_FIXTURES[1][1], 'base64');
    const bytes = Buffer.concat([jpeg, Buffer.alloc(RENDERING_UPLOAD_MAX_BYTES - jpeg.length)]);
    await expect(normalizeRenderingSource({ bytes, mimeType: 'image/jpeg' })).resolves.toMatchObject({ width: 16, height: 12 });
  });

  test('accepts the exact total pixel limit', async () => {
    await expect(normalizeRenderingSource({ bytes: createMonochromePng(4096, 4096), mimeType: 'image/png' }))
      .resolves.toMatchObject({ width: 4096, height: 4096 });
  });

  test('does not mistake acTL text inside a PNG chunk for animation', async () => {
    const bytes = Buffer.concat([
      PNG_BYTES.subarray(0, -12), pngChunk('tEXt', Buffer.from('Comment\0acTL')), PNG_BYTES.subarray(-12),
    ]);
    await expect(normalizeRenderingSource({ bytes, mimeType: 'image/png' })).resolves.toMatchObject({ width: 16, height: 12 });
  });

  test.each(STATIC_FIXTURES)('rejects MIME spoofing for %s', async (_name, base64, mimeType) => {
    await expectRejected(Buffer.from(base64, 'base64'), mimeType === 'image/png' ? 'image/jpeg' : 'image/png');
  });

  test.each([
    ['empty input', Buffer.alloc(0), 'image/png'],
    ['oversized input', Buffer.alloc(RENDERING_UPLOAD_MAX_BYTES + 1), 'image/png'],
    ['unsupported MIME', PNG_BYTES, 'application/octet-stream'],
    ['GIF', Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'), 'image/gif'],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12"><rect width="16" height="12" fill="red"/></svg>'), 'image/svg+xml'],
    ['undecodable pixel data', Buffer.from(UNDECODABLE_PNG, 'base64'), 'image/png'],
    ['truncated pixels', PNG_BYTES.subarray(0, -20), 'image/png'],
    ['truncated chunk header', Buffer.concat([PNG_BYTES, Buffer.from([0])]), 'image/png'],
  ] as const)('rejects %s with a stable error', async (_name, bytes, mimeType) => {
    await expectRejected(bytes, mimeType);
  });

  test('rejects a small compressed image exceeding the total pixel limit', async () => {
    const bytes = createMonochromePng(4097, 4097);
    expect(bytes.length).toBeLessThan(RENDERING_UPLOAD_MAX_BYTES);
    await expectRejected(bytes);
  });

  test('rejects animated WebP', async () => {
    const bytes = Buffer.from(ANIMATED_WEBP, 'base64');
    expect((await sharp(bytes).metadata()).pages).toBe(2);
    await expectRejected(bytes, 'image/webp');
  });

  test('rejects an APNG even when libvips decodes the default frame', async () => {
    const bytes = createAnimatedPng();
    await expect(sharp(bytes).raw().toBuffer()).resolves.toBeInstanceOf(Buffer);
    await expectRejected(bytes);
  });

  test('rejects a chunk length larger than the remaining PNG bytes', async () => {
    const bytes = Buffer.from(PNG_BYTES);
    bytes.writeUInt32BE(0xffffffff, bytes.length - 12);
    await expectRejected(bytes);
  });
});
