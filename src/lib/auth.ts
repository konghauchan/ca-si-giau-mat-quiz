import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';
import { one, run, tx } from './db';

const SCRYPT = { N: 1 << 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function scrypt(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => crypto.scrypt(password, salt, 64, SCRYPT, (error, key) => error ? reject(error) : resolve(key)));
}
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export type AuthUser = { id: string; email: string };

export function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
export function cookieName(request: NextRequest) { return request.nextUrl.protocol === 'https:' ? '__Host-nghe-va-doan' : 'nghe-va-doan-dev'; }
export function assertSameOrigin(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) throw new Error('Yêu cầu không cùng nguồn gốc với website.');
}
function tokenHash(token: string) { return crypto.createHash('sha256').update(token).digest('hex'); }

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, n, r, p, salt, expected] = encoded.split('$');
  if (algorithm !== 'scrypt' || n !== String(SCRYPT.N) || r !== String(SCRYPT.r) || p !== String(SCRYPT.p) || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(expected || '')) return false;
  const actual = await scrypt(password, Buffer.from(salt, 'hex'));
  return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

export async function limitAuthAttempts(request: NextRequest, action: string, email: string) {
  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  const keys: Array<[string, number, number]> = [
    [`${action}:ip:${address}`, action === 'register' ? 12 : 40, 60 * 60 * 1000],
    [`${action}:email:${email}`, action === 'register' ? 4 : 10, 15 * 60 * 1000]
  ];
  await tx(async () => {
    for (const [raw, limit, windowMs] of keys) {
      const key = tokenHash(raw); const current = Date.now();
      const row = await one('SELECT attempts,reset_at FROM auth_rate_limits WHERE key=?', key);
      if (row && Number(row.reset_at) > current && Number(row.attempts) >= limit) throw new Error('Đã thử quá nhiều lần. Vui lòng thử lại sau.');
      if (!row || Number(row.reset_at) <= current) await run('INSERT INTO auth_rate_limits(key,attempts,reset_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET attempts=excluded.attempts,reset_at=excluded.reset_at', key, 1, current + windowMs);
      else await run('UPDATE auth_rate_limits SET attempts=attempts+1 WHERE key=?', key);
    }
  });
}

export async function registerAccount(email: string, password: string): Promise<AuthUser> {
  email = normalizeEmail(email);
  if (await one('SELECT 1 FROM users WHERE email=?', email)) throw new Error('Email này đã được đăng ký. Hãy đăng nhập.');
  const id = crypto.randomUUID(); const passwordHash = await hashPassword(password);
  try { await run('INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,?)', id, email, passwordHash, Date.now()); }
  catch (error) {
    if (/UNIQUE constraint failed: users.email/i.test(String(error))) throw new Error('Email này đã được đăng ký. Hãy đăng nhập.');
    throw error;
  }
  return { id, email };
}
export async function loginAccount(email: string, password: string): Promise<AuthUser> {
  email = normalizeEmail(email);
  const row = await one('SELECT id,email,password_hash FROM users WHERE email=?', email);
  if (!row) { await scrypt(password, Buffer.alloc(16)); throw new Error('Email hoặc mật khẩu không đúng.'); }
  const valid = await verifyPassword(password, String(row.password_hash));
  if (!row || !valid) throw new Error('Email hoặc mật khẩu không đúng.');
  return { id: String(row.id), email: String(row.email) };
}
export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_MS;
  await run('INSERT INTO user_sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)', tokenHash(token), userId, Date.now(), expiresAt);
  return { token, expiresAt };
}
export async function currentUser(request: NextRequest): Promise<AuthUser | null> {
  const token = request.cookies.get(cookieName(request))?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = await one('SELECT users.id,users.email FROM user_sessions JOIN users ON users.id=user_sessions.user_id WHERE user_sessions.token_hash=? AND user_sessions.expires_at>?', tokenHash(token), Date.now());
  return row ? { id: String(row.id), email: String(row.email) } : null;
}
export async function requireUser(request: NextRequest): Promise<AuthUser> {
  const user = await currentUser(request);
  if (!user) throw new Error('Hãy đăng nhập để tạo và quản lý bộ câu hỏi.');
  return user;
}
export async function invalidateSession(request: NextRequest) {
  const token = request.cookies.get(cookieName(request))?.value;
  if (token) await run('DELETE FROM user_sessions WHERE token_hash=?', tokenHash(token));
}
export function sessionCookie(request: NextRequest, session: { token: string; expiresAt: number }) {
  return { name: cookieName(request), value: session.token, httpOnly: true, secure: request.nextUrl.protocol === 'https:', sameSite: 'lax' as const, path: '/', expires: new Date(session.expiresAt) };
}
