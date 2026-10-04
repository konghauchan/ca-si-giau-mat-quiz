import { timedResponse } from '@/lib/timing';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { gameCommand } from '@/lib/game';
export const runtime = 'nodejs';
const command = z.object({ roomId: z.string().uuid(), action: z.enum(['ready', 'buzz', 'nextClue', 'start', 'endBidding', 'showScoreboard', 'nextQuestion', 'skipQuestion', 'endGame', 'pause', 'resume', 'bid', 'answer']), value: z.union([z.string(), z.number()]).optional() });
export async function POST(req: NextRequest) { return timedResponse(() => handle(req)); }
async function handle(req: NextRequest) {
  try {
    const body = command.parse(await req.json());
    return NextResponse.json(await gameCommand(body.roomId, req.headers.get('x-game-token') || '', body.action, body.value));
  } catch (e) { return NextResponse.json({ error: e instanceof z.ZodError ? 'Thao tác không hợp lệ. Hãy thử lại.' : (e as Error).message }, { status: 400 }); }
}
