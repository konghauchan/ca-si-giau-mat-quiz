import { randomUUID } from 'node:crypto';

export async function registerTestAccount(base) {
  const response = await fetch(`${base}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ action: 'register', email: `smoke-${randomUUID()}@example.test`, password: 'Test password 2026!' })
  });
  if (!response.ok) throw new Error(`Test account: ${await response.text()}`);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Test account has no session cookie.');
  return cookie;
}
