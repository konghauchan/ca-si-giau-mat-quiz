export const PLAY_MODES = ['OPEN', 'BID', 'CLUE'] as const;
export type PlayMode = typeof PLAY_MODES[number];
export const PLAY_MODE_LABELS: Record<PlayMode, string> = {
  OPEN: 'Nghe chung', BID: 'Đấu giá thời gian', CLUE: 'Đoán qua 6 gợi ý'
};
export const PLAY_MODE_DESCRIPTIONS: Record<PlayMode, string> = {
  OPEN: 'Tất cả cùng nghe và đoán. Có thể thử lại khi trả lời sai.',
  BID: 'Xem gợi ý rồi đấu giá thời gian nghe. Mỗi người trả lời một lần.',
  CLUE: 'Giành quyền trả lời từ 6 gợi ý. Trả lời sai sẽ mất quyền ở câu đó.'
};
export function storedPlayMode(q: { type?: unknown; game_round?: unknown }): PlayMode {
  if ((q.type === 'song_clue' || q.type === 'film_clue')) return 'CLUE';
  if ((q.type === 'music_open' || q.type === 'film_open')) return 'OPEN';
  if ((q.type === 'music_bid' || q.type === 'film_bid')) return 'BID';
  return Number(q.game_round) === 1 ? 'OPEN' : 'BID';
}
export function inputPlayMode(q: { playMode?: PlayMode; gameRound: number }, gameType?: string): PlayMode {
  if ((gameType === 'MUSIC_DUEL' || gameType === 'FILM_DUEL') && q.playMode) return q.playMode;
  return gameType === 'SONG_CLUE' ? 'CLUE' : q.gameRound === 1 ? 'OPEN' : 'BID';
}
