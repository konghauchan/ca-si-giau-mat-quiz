function asBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Trình duyệt không thể nén ảnh này.')), 'image/webp', quality));
}

export async function prepareCover(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    throw new Error('Chọn ảnh JPG, PNG, WebP hoặc AVIF không quá 8 MB.');
  }
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('Không đọc được ảnh này. Hãy chọn tệp ảnh khác.'); }
  try {
    const sourceRatio = bitmap.width / bitmap.height;
    const cropWidth = sourceRatio > 4 / 3 ? bitmap.height * 4 / 3 : bitmap.width;
    const cropHeight = sourceRatio > 4 / 3 ? bitmap.height : bitmap.width * 3 / 4;
    for (const width of [1200, 1000, 800, 640]) {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = width * 3 / 4;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.');
      context.drawImage(bitmap, (bitmap.width - cropWidth) / 2, (bitmap.height - cropHeight) / 2, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.8, 0.65, 0.5]) {
        const blob = await asBlob(canvas, quality);
        if (blob.type !== 'image/webp') throw new Error('Trình duyệt không hỗ trợ nén WebP.');
        if (blob.size <= 300 * 1024) return new File([blob], 'quiz-cover.webp', { type: 'image/webp' });
      }
    }
    throw new Error('Ảnh không thể nén xuống dưới 300 KB. Hãy chọn ảnh khác.');
  } finally {
    bitmap.close();
  }
}
