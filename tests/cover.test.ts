import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { compressCover, MAX_COVER_BYTES } from '../src/lib/cover.ts';

test('quiz cover is cropped to 4:3 WebP within the upload limit', async () => {
  const pixels = Buffer.alloc(1600 * 900 * 3);
  for (let index = 0; index < pixels.length; index++) pixels[index] = (index * 73 + Math.floor(index / 128) * 41) % 256;
  const source = await sharp(pixels, { raw: { width: 1600, height: 900, channels: 3 } }).png().toBuffer();
  const output = await compressCover(source);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width! * 3, metadata.height! * 4);
  assert.ok(output.length <= MAX_COVER_BYTES);
});
