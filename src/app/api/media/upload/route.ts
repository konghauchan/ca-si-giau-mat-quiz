import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mediaDirectory } from '@/lib/media';
import { run } from '@/lib/db';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    if (process.env.TURSO_DATABASE_URL) throw new Error('Bản online chỉ hỗ trợ nhạc từ YouTube.');
    const form = await req.formData(); const file = form.get('file');
    const ownerToken = req.headers.get('x-media-token') || '';
    if (!/^[a-f0-9-]{36}$/i.test(ownerToken)) throw new Error('Phiên tải lên không hợp lệ.');
    if (!(file instanceof File)) throw new Error('Chọn tệp âm thanh.');
    if (file.size < 1000 || file.size > 25 * 1024 * 1024) throw new Error('Tệp âm thanh phải từ 1 KB đến 25 MB.');
    const extension = path.extname(file.name).toLowerCase();
    if (!['.mp3', '.m4a', '.wav', '.ogg', '.webm', '.aac'].includes(extension) || !file.type.startsWith('audio/')) throw new Error('Chỉ hỗ trợ MP3, M4A, WAV, OGG, WebM hoặc AAC.');
    const id = crypto.randomUUID(); const directory = mediaDirectory();
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, id), Buffer.from(await file.arrayBuffer()), { flag: 'wx' });
    await run('INSERT INTO media_assets VALUES(?,?,?)', id, ownerToken, Date.now());
    return NextResponse.json({ mediaUrl: `asset:${id}` });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
