export const MAX_PLAYERS = 50;
export const BID_PREPARATION_MS = 5000;
export type AnswerMode = 'TEXT' | 'CHOICE' | 'SEARCH';
export type Choice = { id: string; label: string };
export function bidWindow(start: number, seconds: number, answerSeconds: number) {
  const mediaStartsAt = start + BID_PREPARATION_MS;
  const listenEndsAt = mediaStartsAt + seconds * 1000;
  return { mediaStartsAt, listenEndsAt, answerEndsAt: listenEndsAt + answerSeconds * 1000 };
}
export function bidStage(start: number, seconds: number, answerSeconds: number, clock: number) {
  const window = bidWindow(start,seconds,answerSeconds);
  return { ...window, stage: clock < window.mediaStartsAt ? 'PREPARE' as const : clock < window.listenEndsAt ? 'LISTEN' as const : clock < window.answerEndsAt ? 'ANSWER' as const : 'WAIT' as const };
}
export function choicesForPlayer(choices: Choice[], playerId: string): Choice[] {
  const hash = (id: string) => { let value=2166136261; for(const c of playerId+':'+id) value=Math.imul(value^c.charCodeAt(0),16777619); return value>>>0; };
  return [...choices].sort((a,b)=>hash(a.id)-hash(b.id)||a.id.localeCompare(b.id)).map(({id,label})=>({id,label}));
}
