import { timedResponse } from '@/lib/timing';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRoom, joinRoom } from '@/lib/game';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) { return timedResponse(() => handle(req)); }
async function handle(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === 'create') {
      const data = z.object({ quizId: z.string().uuid(), ownerToken: z.string().optional(), nickname: z.string().min(2).max(24), avatarId: z.number().int().min(1).max(20).optional() }).parse(body);
      return NextResponse.json(await createRoom(data.quizId, data.ownerToken || '', data.nickname, data.avatarId ?? 1));
    }
    if (body.action === 'join') {
      const data = z.object({ pin: z.string().regex(/^\d{6}$/), nickname: z.string().min(2).max(24), avatarId: z.number().int().min(1).max(20).optional(), clientToken: z.string().uuid().optional() }).parse(body);
      return NextResponse.json(await joinRoom(data.pin, data.nickname, data.avatarId ?? 1, data.clientToken));
    }
    throw new Error('Thao tác không hợp lệ.');
  } catch (e) { return NextResponse.json({ error: e instanceof z.ZodError ? 'Thông tin phòng chơi không hợp lệ. Hãy kiểm tra mã phòng và tên hiển thị.' : (e as Error).message }, { status: 400 }); }
}
