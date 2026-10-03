import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

const ASSET_PATTERN = /^asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export const mediaDirectory = () => path.resolve(process.env.MEDIA_DIR || './data/media');
export function assetPath(value: string): string | null {
  const match = ASSET_PATTERN.exec(value);
  return match ? path.join(mediaDirectory(), match[1].toLowerCase()) : null;
}
export function storedAssetExists(value: string): boolean {
  const filename = assetPath(value);
  return !!filename && fs.existsSync(filename);
}

export function extractAudioClip(value: string, start: number, duration: number): Promise<Buffer> {
  const filename = assetPath(value);
  if (!filename || !fs.existsSync(filename)) return Promise.reject(new Error('Không tìm thấy tệp âm thanh.'));
  if (!Number.isFinite(start) || start < 0 || start > 86400 || !Number.isFinite(duration) || duration < 1 || duration > 30) return Promise.reject(new Error('Đoạn nhạc không hợp lệ.'));
  // Next.js bundles ffmpeg-static's index.js, which can change its __dirname.
  // Resolve the traced binary from the app root when that bundled path is absent.
  const bundledBinary = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const binary = ffmpegPath && fs.existsSync(ffmpegPath) ? ffmpegPath : bundledBinary;
  if (!fs.existsSync(binary)) return Promise.reject(new Error('Thiếu chương trình xử lý âm thanh.'));
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-loglevel', 'error', '-ss', String(start), '-i', filename, '-t', String(duration), '-vn', '-ac', '2', '-ar', '44100', '-b:a', '128k', '-f', 'mp3', 'pipe:1'];
    const child = spawn(binary, args, { windowsHide: true });
    const chunks: Buffer[] = []; let size = 0; let errorText = ''; let settled = false;
    const finish = (error?: Error, data?: Buffer) => { if (settled) return; settled = true; clearTimeout(timeout); if (error) reject(error); else resolve(data!); };
    const timeout = setTimeout(() => { child.kill(); finish(new Error('Xử lý đoạn nhạc quá thời gian.')); }, 20000);
    child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 6_000_000) { child.kill(); finish(new Error('Đoạn nhạc quá lớn.')); } else chunks.push(chunk); });
    child.stderr.on('data', (chunk: Buffer) => { errorText = (errorText + chunk.toString()).slice(-500); });
    child.on('error', error => finish(error));
    child.on('close', code => { if (code !== 0 || size === 0) finish(new Error(`Không xử lý được đoạn nhạc. ${errorText}`)); else finish(undefined, Buffer.concat(chunks)); });
  });
}
