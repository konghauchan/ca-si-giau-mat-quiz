import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin, requireUser } from '@/lib/auth';
import { getState } from '@/lib/game';
import { one } from '@/lib/db';
import { narrationConfigured, speech } from '@/lib/narration';
import { narrationText, type NarrationState } from '@/lib/narrationText';
export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';
const input = z.object({ roomId: z.string().uuid().optional(), questionId: z.string().uuid().optional(), kind: z.enum(['question', 'clue', 'answer', 'prepare', 'preview']), text: z.string().trim().min(1).max(1600).optional() });
export function GET() { return NextResponse.json({ enabled: narrationConfigured() }, { headers: { 'Cache-Control': 'no-store' } }); }
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = input.parse(await request.json());
    let text: string; let scope: string;
    if (body.kind === 'preview') {
      const user = await requireUser(request); if (!body.text) return NextResponse.json({ error: 'Chưa có nội dung để đọc.' }, { status: 400 });
      text = body.text; scope = `preview:${user.id}`;
    } else {
      if (!body.roomId) return NextResponse.json({ error: 'Thiếu phòng chơi.' }, { status: 400 });
      const state = await getState(body.roomId, request.headers.get('x-game-token') || '');
      if (!body.questionId || String(state.question.id) !== body.questionId) return NextResponse.json({ error: 'Câu hỏi đã thay đổi.' }, { status: 409 });
      scope = `room:${body.roomId}`;
      if (body.kind === 'prepare') {
        if (!narrationConfigured()) return NextResponse.json({ enabled: false });
        // Warm hidden audio on the server; neither text nor its storage URL is returned.
        const q = await one('SELECT * FROM questions WHERE id=?', body.questionId);
        if (!q) throw new Error('Không tìm thấy câu hỏi.');
        after(async () => {
          const clues = JSON.parse(String(q.clues_json || '[]')) as Array<{ text: string }>;
          const answer = `Đáp án là: ${q.primary_answer}${q.artist ? `. ${q.artist}` : ''}.`;
          const clueTexts = clues.map((clue, index) => `Gợi ý ${index + 1}: ${clue.text}`);
          const texts = clueTexts.length ? [clueTexts[0], answer, ...clueTexts.slice(1)] : [String(q.prompt) + (q.hint && ['music','music_bid','film_bid'].includes(String(q.type)) ? ` Gợi ý: ${q.hint}` : ''), answer];
          for (let index = 0; index < texts.length; index += 2) await Promise.allSettled(texts.slice(index, index + 2).map(value => speech(value, scope)));
        });
        return NextResponse.json({ preparing: true });
      }
      text = narrationText(state as unknown as NarrationState, body.kind);
    }
    const audio = await speech(text, scope);
    return new Response(new Uint8Array(audio), { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'none' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? 'Yêu cầu giọng đọc không hợp lệ.' : (error as Error).message }, { status: 400 });
  }
}
