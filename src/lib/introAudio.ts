import type { IntroMode } from './roundIntro';
import type { NarrationLanguage } from './waveNet';

type Context = { roomId: string; questionId: string; token: string; language: NarrationLanguage; film: boolean };
// Only public game rules live here. Never cache questions or answers in this map.
const clips = new Map<string, Promise<Blob>>();
export function loadIntroAudio(context: Context, mode: IntroMode): Promise<Blob> {
  const key = `${context.language}:${context.film}:${mode}`;
  const cached = clips.get(key);
  if (cached) return cached;
  const pending = fetch('/api/narration', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-game-token': context.token },
    body: JSON.stringify({ roomId: context.roomId, questionId: context.questionId, language: context.language, kind: 'intro-audio', mode }),
  }).then(async response => {
    if (!response.ok) { const body = await response.json(); throw new Error(body.error || 'Chưa tải được hướng dẫn.'); }
    return response.blob();
  }).catch(error => { clips.delete(key); throw error; });
  clips.set(key, pending);
  return pending;
}
export function prepareIntroAudio(context: Context, current: IntroMode) {
  return Promise.allSettled([current, ...(['OPEN','BID','CLUE'] as const).filter(mode => mode !== current)].map(mode => loadIntroAudio(context, mode)));
}
