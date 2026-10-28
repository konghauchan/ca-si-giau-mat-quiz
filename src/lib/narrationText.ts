import { answerAction, roundIntroText } from './roundIntro.ts';
import type { AnswerMode } from './multiplayer';
export type NarrationKind = 'question' | 'clue' | 'answer' | 'intro';
export type NarrationState = {
  personal?:{stage:string}|null; me?: { id: string } | null; gameRound?: number; roundQuestionIndex?: number; playMode?: 'OPEN'|'BID'|'CLUE'; category?: string; gameType: string; phase: string; question: { answerMode?: AnswerMode; prompt?: unknown; hint?: unknown; primaryAnswer?: unknown; artist?: unknown };
  clue?: { index: number; items: Array<{ text: string }>; holder?: string | null; answerLocked?: boolean };
};
function searchAnswerHelp(single: boolean, language: 'vi-VN'|'en-US', film = false): string {
  const limit = language === 'en-US'
    ? single ? 'You get one selection.' : `If wrong, select another ${film ? 'film' : 'song'} before time is up.`
    : single ? 'Chỉ được chọn một lần.' : 'Sai có thể chọn lại trước khi hết giờ.';
  return `${answerAction('SEARCH', film, language)} ${limit}`;
}
export function narrationText(state: NarrationState, kind: NarrationKind, language: 'vi-VN'|'en-US' = 'vi-VN'): string {
  if (kind === 'intro') {
    if (!['TOPIC_INTRO','QUESTION_INTRO'].includes(state.phase) || state.roundQuestionIndex !== 1) throw new Error('Chưa đến phần giới thiệu vòng chơi.');
    return roundIntroText(state.playMode || (state.gameType === 'SONG_CLUE' ? 'CLUE' : 'OPEN'), state.gameRound || 1, state.category === 'FILM', language, state.question.answerMode);
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
  if (state.gameType === 'SONG_CLUE') {
    if (state.phase !== 'CLUE_ANSWERING' || state.question.answerMode !== 'SEARCH' || !state.me || state.clue?.holder !== state.me.id || state.clue.answerLocked) throw new Error('Chưa đến lượt bạn trả lời.');
    return searchAnswerHelp(true, language, state.category === 'FILM');
  }
  if (!['TOPIC_INTRO', 'BIDDING', 'BID_REVEAL', 'OPEN_ANSWERING', 'ANSWERING'].includes(state.phase) && !(state.phase==='MEDIA_PLAYING' && state.personal?.stage==='ANSWER')) throw new Error('Câu hỏi chưa sẵn sàng để đọc.');
  const answering = ['OPEN_ANSWERING', 'ANSWERING'].includes(state.phase) || (state.phase === 'MEDIA_PLAYING' && state.personal?.stage === 'ANSWER');
  const searchHelp = state.question.answerMode === 'SEARCH' && answering
    ? ` ${searchAnswerHelp(state.playMode === 'BID' || state.phase === 'ANSWERING' || state.phase === 'MEDIA_PLAYING', language, state.category === 'FILM')}`
    : '';
  return `${state.question.prompt || 'Đáp án của bạn là gì?'}${state.question.hint && ['BIDDING', 'BID_REVEAL'].includes(state.phase) ? ` ${language === 'en-US' ? 'Hint' : 'Gợi ý'}: ${state.question.hint}` : ''}${searchHelp}`;
}

// Server-only preparation receives the private question; callers never return these texts.
export function narrationPreparationTexts(state: NarrationState, language: 'vi-VN'|'en-US' = 'vi-VN'): string[] {
  const answer = narrationText({ ...state, phase: 'ROUND_RESULT' }, 'answer', language);
  if (state.gameType === 'SONG_CLUE' || state.playMode === 'CLUE') {
    state = { ...state, gameType: 'SONG_CLUE' };
    const clue = state.clue || { index: 0, items: [] };
    const clues = clue.items.map((_, index) => narrationText({ ...state, phase: 'CLUE_ACTIVE', clue: { ...clue, index } }, 'clue', language));
    const help = state.question.answerMode === 'SEARCH' ? [searchAnswerHelp(true, language, state.category === 'FILM')] : [];
    return [clues[0], answer, ...help, ...clues.slice(1)].filter((text): text is string => !!text);
  }
  const phases = state.playMode === 'BID' ? ['BIDDING', 'ANSWERING'] : ['OPEN_ANSWERING'];
  return [...new Set([...phases.map(phase => narrationText({ ...state, phase }, 'question', language)), answer])];
}
