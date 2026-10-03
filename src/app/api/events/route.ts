import { NextRequest } from 'next/server';
import { eventVersion, getState } from '@/lib/game';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get('roomId') || '';
  const auth = req.headers.get('x-game-token') || '';
  try { await getState(roomId, auth); }
  catch { return new Response('Không có quyền truy cập phòng.', { status: 401 }); }
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let version = -1; let pushing = false;
      const push = async () => {
        if (closed || pushing) return;
        pushing = true;
        try {
          const current = await eventVersion(roomId);
          if (current !== version) { version = current; controller.enqueue(encoder.encode(`data: ${current}\n\n`)); }
          else controller.enqueue(encoder.encode(': ping\n\n'));
        } catch { closed = true; if (timer) clearInterval(timer); controller.close(); }
        finally { pushing = false; }
      };
      void push(); timer = setInterval(() => { void push(); }, 1000);
      req.signal.addEventListener('abort', () => { closed = true; if (timer) clearInterval(timer); try { controller.close(); } catch {} }, { once: true });
    },
    cancel() { closed = true; if (timer) clearInterval(timer); }
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
}
