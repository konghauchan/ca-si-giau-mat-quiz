import sharp from 'sharp';

export const MAX_COVER_BYTES = 300 * 1024;

export async function compressCover(input: Buffer): Promise<Buffer> {
  for (const size of [1200, 1000, 800, 640]) {
    for (const quality of [78, 65, 52]) {
      const output = await sharp(input, { limitInputPixels: 40_000_000 })
        .rotate().resize(size, Math.round(size * 3 / 4), { fit: 'cover', position: 'centre' })
        .webp({ quality, effort: 4 }).toBuffer();
      if (output.length <= MAX_COVER_BYTES) return output;
    }
  }
  throw new Error('Ảnh không thể nén xuống dưới 300 KB. Hãy chọn ảnh khác.');
}
