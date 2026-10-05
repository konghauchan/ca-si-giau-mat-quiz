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
export async function claimLegacyQuizzes() {
  if (typeof window === 'undefined') return [];
  let ids: string[];
  try {
    const saved = JSON.parse(localStorage.getItem('myQuizzes') || '[]') as unknown;
    ids = Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
  const claims = ids.filter(id => quizToken(id)).slice(0, 50).map(id => ({ id, ownerToken: quizToken(id) }));
  if (!claims.length) return [];
  const result = await api<{ claimed: string[] }>('/api/auth/claim', { method: 'POST', body: { claims } });
  for (const id of result.claimed) localStorage.removeItem(`quiz:${id}`);
  localStorage.setItem('myQuizzes', JSON.stringify(ids.filter(id => !result.claimed.includes(id))));
  return result.claimed;
}
export function gameToken(roomId: string, kind: 'host' | 'player') { return typeof window === 'undefined' ? '' : sessionStorage.getItem(`${kind}:${roomId}`) || localStorage.getItem(`${kind}:${roomId}`) || ''; }
export function mediaToken() {
  if (typeof window === 'undefined') return '';
  let value = localStorage.getItem('mediaOwnerToken');
  if (!value) { value = crypto.randomUUID(); localStorage.setItem('mediaOwnerToken', value); }
  return value;
}
