import { NextRequest } from 'next/server';
import { getState } from '@/lib/game';
import { extractAudioClip } from '@/lib/media';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const state = await getState(req.nextUrl.searchParams.get('roomId') || '', req.headers.get('x-game-token') || '');
    if (state.gameType === 'SONG_CLUE') return new Response('Chế độ gợi ý không dùng âm thanh.', {status:403});
    if (!['OPEN_MEDIA_PLAYING', 'MEDIA_PLAYING'].includes(String(state.phase)) || !state.me || !state.activeChallengerIds.includes(String(state.me.id)) || state.question.mediaType !== 'uploaded_audio' || !state.question.mediaUrl) {
      return new Response('Đoạn nhạc chưa khả dụng cho người chơi này.', { status: 403 });
    }
    const clip = await extractAudioClip(String(state.question.mediaUrl), Number(state.question.mediaStart), Number(state.phase === 'OPEN_MEDIA_PLAYING' ? state.question.listenSeconds : state.activeBid));
    return new Response(new Uint8Array(clip), { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(clip.length), 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'none' } });
  } catch (e) { return new Response((e as Error).message, { status: 400 }); }
}
