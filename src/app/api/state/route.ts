import { timedResponse } from '@/lib/timing';
import { NextRequest, NextResponse } from 'next/server';
import { getState } from '@/lib/game';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) { return timedResponse(() => handle(req)); }
async function handle(req: NextRequest) {
  try {
    const roomId = req.nextUrl.searchParams.get('roomId') || '';
    const auth = req.headers.get('x-game-token') || '';
    return NextResponse.json(await getState(roomId, auth), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 401 }); }
}
