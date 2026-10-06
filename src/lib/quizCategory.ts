import { PLAY_MODE_LABELS, PLAY_MODE_DESCRIPTIONS, type PlayMode } from './playModes';

export type QuizCategory = 'MUSIC_DUEL' | 'FILM_DUEL';
export const isFilmQuiz = (gameType?: string) => gameType === 'FILM_DUEL';
export const quizCategoryLabel = (gameType?: string) => isFilmQuiz(gameType) ? 'Đọ Phim' : 'Đọ Nhạc';
export function modeLabel(mode: PlayMode, film: boolean) {
  return film && mode === 'OPEN' ? 'Xem chung' : film && mode === 'BID' ? 'Đấu giá thời gian xem' : PLAY_MODE_LABELS[mode];
}
export function modeDescription(mode: PlayMode, film: boolean) {
  return film ? PLAY_MODE_DESCRIPTIONS[mode].replaceAll('nghe', 'xem') : PLAY_MODE_DESCRIPTIONS[mode];
}
