import { NextRequest } from 'next/server';
import { extractAudioClip } from '@/lib/media';
import { one } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const value = req.nextUrl.searchParams.get('asset') || '';
    const token = req.headers.get('x-media-token') || '';
    const id = value.startsWith('asset:') ? value.slice(6) : '';
    if (!id || !await one('SELECT 1 FROM media_assets WHERE id=? AND owner_token=?', id, token)) return new Response('Không có quyền nghe thử tệp này.', { status: 403 });
    const start = Number(req.nextUrl.searchParams.get('start'));
    const duration = Number(req.nextUrl.searchParams.get('duration'));
    if (duration > 10) throw new Error('Chỉ được nghe thử tối đa 10 giây.');
    const clip = await extractAudioClip(value, start, duration);
    return new Response(new Uint8Array(clip), { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'none' } });
  } catch (e) { return new Response((e as Error).message, { status: 400 }); }
}
