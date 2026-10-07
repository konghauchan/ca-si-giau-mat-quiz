import { createHash, createHmac } from 'node:crypto';
import { encryptSpeech, decryptSpeech } from './narrationAudio';
import { generateWaveNetSpeech, waveNetConfigured, waveNetVoice, type NarrationLanguage } from './waveNet';
import fs from 'node:fs/promises';
import path from 'node:path';
import { put } from '@vercel/blob';
import { one, run, tx } from './db';

export const narrationConfigured = () => waveNetConfigured() && (!process.env.VERCEL || !!process.env.BLOB_READ_WRITE_TOKEN);
const inFlight = new Map<string, Promise<Buffer>>();
const key = () => createHash('sha256').update(process.env.NARRATION_CACHE_SECRET || process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON || '').digest();
export const generateSpeech = generateWaveNetSpeech;
async function readCached(location: string): Promise<Buffer> {
  const encrypted = location.startsWith('https:') ? Buffer.from(await (await fetch(location, { signal: AbortSignal.timeout(10000) })).arrayBuffer()) : await fs.readFile(location);
  return decryptSpeech(encrypted, key());
}
export async function speech(text: string, scope: string, language: NarrationLanguage = 'vi-VN'): Promise<Buffer> {
  if (!narrationConfigured()) throw new Error('Chưa cấu hình WaveNet. Cần tài khoản dịch vụ Google Cloud và kho Blob cho bản online.');
  if (!text.trim() || text.length > 1600) throw new Error('Nội dung đọc không hợp lệ.');
  const id = createHmac('sha256', key()).update(`wavenet-linear16-v1\n${waveNetVoice(language)}\n${text}`).digest('hex');
  const pending = inFlight.get(id); if (pending) return pending;
  const job = (async () => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const cached = await one('SELECT location,lease_until FROM narration_cache WHERE id=?', id);
      if (cached?.location) {
        try { return await readCached(String(cached.location)); }
        catch { await run('UPDATE narration_cache SET location=NULL,lease_until=0 WHERE id=? AND location=?', id, String(cached.location)); }
      }
      const claimed = await tx(async () => {
        const now = Date.now();
        await run('INSERT OR IGNORE INTO narration_cache(id,lease_until,updated_at) VALUES(?,0,?)', id, now);
        const row = await one('SELECT location,lease_until FROM narration_cache WHERE id=?', id);
        if (row?.location || Number(row?.lease_until) > now) return false;
        const day = new Date(now).toISOString().slice(0, 10);
        const maximum = Math.max(1, Number(process.env.TTS_DAILY_LIMIT) || 2000);
        const month = day.slice(0, 7);
        const characters = Array.from(text).length;
        const monthlyMaximum = Math.max(1, Number(process.env.TTS_MONTHLY_CHARACTER_LIMIT) || 3_800_000);
        const monthlyUsed = await one('SELECT count FROM narration_usage WHERE scope=? AND day=?', 'wavenet-characters', month);
        if (Number(monthlyUsed?.count || 0) + characters > monthlyMaximum) throw new Error('Đã đạt giới hạn ký tự giọng đọc tháng này.');
        await run('INSERT INTO narration_usage(scope,day,count) VALUES(?,?,?) ON CONFLICT(scope,day) DO UPDATE SET count=count+excluded.count', 'wavenet-characters', month, characters);

        for (const [bucket, limit] of [['global', maximum], [scope, scope.startsWith('preview:') ? 50 : maximum]] as const) {
          const used = await one('SELECT count FROM narration_usage WHERE scope=? AND day=?', bucket, day);
          if (Number(used?.count || 0) >= limit) throw new Error('Đã đạt giới hạn tạo giọng đọc hôm nay.');
          await run('INSERT INTO narration_usage(scope,day,count) VALUES(?,?,1) ON CONFLICT(scope,day) DO UPDATE SET count=count+1', bucket, day);
        }
        await run('UPDATE narration_cache SET lease_until=?,updated_at=? WHERE id=?', now + 65000, now, id);
        return true;
      });
      if (!claimed) { await new Promise(resolve => setTimeout(resolve, 250)); continue; }
      try {
        const audio = await generateSpeech(text, language); const encrypted = encryptSpeech(audio, key());
        let location: string;
        if (process.env.VERCEL) location = (await put(`narration/${id}.bin`, encrypted, { access: 'public', addRandomSuffix: true, contentType: 'application/octet-stream' })).url;
        else { const directory = path.resolve('./data/narration'); await fs.mkdir(directory, { recursive: true }); location = path.join(directory, `${id}.bin`); await fs.writeFile(location, encrypted); }
        await run('UPDATE narration_cache SET location=?,lease_until=0,updated_at=? WHERE id=?', location, Date.now(), id);
        return audio;
      } catch (error) { await run('UPDATE narration_cache SET lease_until=?,updated_at=? WHERE id=?', Date.now() + 10000, Date.now(), id); throw error; }
    }
    throw new Error('Giọng đọc đang được chuẩn bị. Thử lại sau.');
  })();
  inFlight.set(id, job);
  try { return await job; } finally { inFlight.delete(id); }
}
