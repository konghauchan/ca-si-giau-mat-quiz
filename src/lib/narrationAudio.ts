import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

export function encryptSpeech(audio: Buffer, secret: Buffer): Buffer {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', secret, iv);
  const data = Buffer.concat([cipher.update(gzipSync(audio)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}
export function decryptSpeech(data: Buffer, secret: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', secret, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return gunzipSync(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]), { maxOutputLength: 6_000_000 });
}
export function audioFromWaveNet(payload: unknown): Buffer {
  const audio = (payload as { audioContent?: unknown } | null)?.audioContent;
  if (typeof audio !== 'string' || !audio || audio.length > 8_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) throw new Error('WaveNet chưa tạo được giọng đọc.');
  const bytes = Buffer.from(audio, 'base64');
  if (bytes.length < 44 || bytes.subarray(0, 4).toString() !== 'RIFF' || bytes.subarray(8, 12).toString() !== 'WAVE') throw new Error('Âm thanh WaveNet không hợp lệ.');
  return bytes;
}
