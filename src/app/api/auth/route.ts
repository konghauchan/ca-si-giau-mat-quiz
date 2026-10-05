import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin, createSession, currentUser, invalidateSession, limitAuthAttempts, loginAccount, normalizeEmail, registerAccount, requireUser, sessionCookie } from '@/lib/auth';

export const runtime = 'nodejs';
const credentials = z.object({ action: z.enum(['register', 'login']), email: z.string().trim().email().max(254), password: z.string().min(12).max(128) });

export async function GET(request: NextRequest) {
  try { return NextResponse.json({ user: await currentUser(request) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Không kiểm tra được phiên đăng nhập.' }, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = await request.json();
    if (body.action === 'logout') {
      await requireUser(request); await invalidateSession(request);
      const response = NextResponse.json({ user: null });
      response.cookies.set({ ...sessionCookie(request, { token: '', expiresAt: 0 }), maxAge: 0 });
      return response;
    }
    const input = credentials.parse(body);
    await limitAuthAttempts(request, input.action, normalizeEmail(input.email));
    const user = input.action === 'register' ? await registerAccount(input.email, input.password) : await loginAccount(input.email, input.password);
    await invalidateSession(request);
    const session = await createSession(user.id);
    const response = NextResponse.json({ user }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(sessionCookie(request, session));
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? 'Nhập email hợp lệ và mật khẩu từ 12 đến 128 ký tự.' : (error as Error).message }, { status: 400 });
  }
}
