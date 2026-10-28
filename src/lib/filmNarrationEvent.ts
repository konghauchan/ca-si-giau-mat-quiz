import type { NarrationKind } from './narrationText';

type FilmNarrationState = {
  phase: string;
  roundQuestionIndex?: number;
  personal?: { stage: string } | null;
  question: { mediaType?: string; mediaUrl?: string | null };
};

// Semantic keys survive phase changes so a result is not announced twice.
export function filmNarrationEvent(state: FilmNarrationState): {
  kind?: NarrationKind; key?: string; autoPlay: boolean;
} {
  if (state.phase === 'TOPIC_INTRO' && state.roundQuestionIndex === 1)
    return { kind: 'intro', key: 'intro', autoPlay: true };
  if (['BIDDING', 'BID_REVEAL'].includes(state.phase))
    return { kind: 'question', key: 'bid', autoPlay: true };
  if (['OPEN_ANSWERING', 'ANSWERING'].includes(state.phase) ||
      (state.phase === 'MEDIA_PLAYING' && state.personal?.stage === 'ANSWER'))
    return { kind: 'question', key: 'question', autoPlay: true };
  if (['ROUND_RESULT', 'SCOREBOARD', 'GAME_FINISHED'].includes(state.phase)) {
    const resultClip = state.phase === 'ROUND_RESULT' &&
      state.question.mediaType === 'youtube' && !!state.question.mediaUrl;
    return { kind: 'answer', key: 'answer', autoPlay: !resultClip };
  }
  return { autoPlay: false };
}
