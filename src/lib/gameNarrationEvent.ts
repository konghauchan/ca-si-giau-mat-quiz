import type { NarrationKind } from './narrationText';

type GameNarrationState = {
  phase: string;
  category?: string;
  roundQuestionIndex?: number;
  personal?: { stage: string } | null;
  question: { mediaType?: string; mediaUrl?: string | null };
};

// Semantic keys survive phase changes so a result is not announced twice.
export function gameNarrationEvent(state: GameNarrationState): {
  kind?: NarrationKind; key?: string; autoPlay: boolean;
} {
  if (state.phase === 'TOPIC_INTRO' && state.roundQuestionIndex === 1)
    return { kind: 'intro', key: 'intro', autoPlay: true };
  if (['BIDDING', 'BID_REVEAL'].includes(state.phase))
    return { kind: 'question', key: 'bid', autoPlay: true };
  if (state.personal && ['MEDIA_PLAYING', 'ANSWERING'].includes(state.phase) && state.personal.stage !== 'ANSWER')
    return { autoPlay: false };
  if (['OPEN_ANSWERING', 'ANSWERING'].includes(state.phase) ||
      (state.phase === 'MEDIA_PLAYING' && state.personal?.stage === 'ANSWER'))
    return { kind: 'question', key: 'question', autoPlay: true };
  if (['ROUND_RESULT', 'SCOREBOARD', 'GAME_FINISHED'].includes(state.phase)) {
    const resultClip = state.category === 'FILM' && state.phase === 'ROUND_RESULT' &&
      state.question.mediaType === 'youtube' && !!state.question.mediaUrl;
    return { kind: 'answer', key: 'answer', autoPlay: !resultClip };
  }
  return { autoPlay: false };
}

// Clue and regular rounds share the same event names across component remounts.
export function clueNarrationEvent(state: {
  phase: string; mixed?: boolean; roundQuestionIndex?: number;
  me: { id: string };
  question: { answerMode?: string };
  clue: { index: number; holder: string | null; answerLocked?: boolean };
}): ReturnType<typeof gameNarrationEvent> {
  if (state.phase === 'QUESTION_INTRO' && !state.mixed && state.roundQuestionIndex === 1)
    return { kind: 'intro', key: 'intro', autoPlay: true };
  if (state.phase === 'CLUE_ACTIVE')
    return { kind: 'clue', key: `clue-${state.clue.index}`, autoPlay: true };
  if (state.phase === 'CLUE_ANSWERING' && state.question.answerMode === 'SEARCH' &&
      state.clue.holder === state.me.id && !state.clue.answerLocked)
    return { kind: 'question', key: 'question', autoPlay: true };
  if (['CLUE_RESULT', 'GAME_FINISHED'].includes(state.phase))
    return { kind: 'answer', key: 'answer', autoPlay: true };
  return { autoPlay: false };
}
