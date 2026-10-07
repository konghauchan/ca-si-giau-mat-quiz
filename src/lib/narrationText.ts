import { roundIntroText } from './roundIntro.ts';
export type NarrationKind = 'question' | 'clue' | 'answer' | 'intro';
export type NarrationState = {
  gameRound?: number; roundQuestionIndex?: number; playMode?: 'OPEN'|'BID'|'CLUE'; category?: string; gameType: string; phase: string; question: { prompt?: unknown; hint?: unknown; primaryAnswer?: unknown; artist?: unknown };
  clue?: { index: number; items: Array<{ text: string }> };
};
export function narrationText(state: NarrationState, kind: NarrationKind, language: 'vi-VN'|'en-US' = 'vi-VN'): string {
  if (kind === 'intro') {
    if (!['TOPIC_INTRO','QUESTION_INTRO'].includes(state.phase) || state.roundQuestionIndex !== 1) throw new Error('Chưa đến phần giới thiệu vòng chơi.');
    return roundIntroText(state.playMode || (state.gameType === 'SONG_CLUE' ? 'CLUE' : 'OPEN'), state.gameRound || 1, state.category === 'FILM', language);
  }
  if (kind === 'answer') {
    if (!['ROUND_RESULT', 'SCOREBOARD', 'CLUE_RESULT', 'GAME_FINISHED'].includes(state.phase) || !state.question.primaryAnswer) throw new Error('Đáp án chưa được công bố.');
    return `${language === 'en-US' ? 'The answer is' : 'Đáp án là'}: ${state.question.primaryAnswer}${state.question.artist ? `. ${state.question.artist}` : ''}.`;
  }
  if (kind === 'clue') {
    if (state.gameType !== 'SONG_CLUE' || !['CLUE_ACTIVE', 'CLUE_ANSWERING', 'CLUE_FEEDBACK'].includes(state.phase)) throw new Error('Gợi ý chưa được mở.');
    const item = state.clue?.items[state.clue.index];
    if (!item) throw new Error('Gợi ý chưa được mở.');
    return `${language === 'en-US' ? 'Clue' : 'Gợi ý'} ${state.clue!.index + 1}: ${item.text}`;
  }
  if (state.gameType === 'SONG_CLUE' || !['TOPIC_INTRO', 'BIDDING', 'BID_REVEAL', 'OPEN_ANSWERING', 'ANSWERING'].includes(state.phase)) throw new Error('Câu hỏi chưa sẵn sàng để đọc.');
  return `${state.question.prompt || 'Đáp án của bạn là gì?'}${state.question.hint && ['BIDDING', 'BID_REVEAL'].includes(state.phase) ? ` ${language === 'en-US' ? 'Hint' : 'Gợi ý'}: ${state.question.hint}` : ''}`;
}
