export async function api<T>(path: string, options: { method?: string; body?: unknown; token?: string; signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(options.token ? { 'x-game-token': options.token, 'x-quiz-token': options.token } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
    signal: options.signal
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Có lỗi xảy ra.');
  return data as T;
}
export function quizToken(id: string) { return typeof window === 'undefined' ? '' : localStorage.getItem(`quiz:${id}`) || ''; }
export function gameToken(roomId: string, kind: 'host' | 'player') { return typeof window === 'undefined' ? '' : sessionStorage.getItem(`${kind}:${roomId}`) || localStorage.getItem(`${kind}:${roomId}`) || ''; }
export function mediaToken() {
  if (typeof window === 'undefined') return '';
  let value = localStorage.getItem('mediaOwnerToken');
  if (!value) { value = crypto.randomUUID(); localStorage.setItem('mediaOwnerToken', value); }
  return value;
}
