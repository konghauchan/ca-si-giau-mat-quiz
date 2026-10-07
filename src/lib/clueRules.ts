export const CLUE_CATEGORIES = ['YEAR', 'ARTIST', 'MV', 'LYRIC', 'TITLE_STRUCTURE', 'EVENT', 'CAREER', 'TRIVIA', 'KEYWORD', 'OTHER'] as const;
export type Clue = { id: string; text: string; score: number; category: typeof CLUE_CATEGORIES[number] };
export type CluePhase = 'LOBBY' | 'QUESTION_INTRO' | 'CLUE_ACTIVE' | 'CLUE_ANSWERING' | 'CLUE_FEEDBACK' | 'CLUE_RESULT' | 'GAME_FINISHED';
export type ClueState = { phase: CluePhase; questionIndex: number; clueIndex: number; startedAt: number; endsAt: number | null; eliminated: string[]; votes: string[]; holder: string | null; lockedScore: number; remainingMs: number; outcome: 'correct' | 'wrong' | 'timeout' | null; answer: string | null };
export type ClueQuestion = { clues: Clue[]; answerSeconds: number; clueSeconds: number };
export const requiredVotes = (eligible: number) => Math.ceil(eligible * .75);
export const clueInitial = (time: number): ClueState => ({ phase: 'LOBBY', questionIndex: 0, clueIndex: 0, startedAt: time, endsAt: null, eliminated: [], votes: [], holder: null, lockedScore: 0, remainingMs: 0, outcome: null, answer: null });
function phase(s: ClueState, value: CluePhase, time: number, duration: number | null): ClueState { return { ...s, phase: value, startedAt: time, endsAt: duration === null ? null : time + duration }; }
export function startClueQuestion(s: ClueState, time: number, introductionMs = 2000): ClueState { return phase({ ...clueInitial(time), questionIndex: s.questionIndex }, 'QUESTION_INTRO', time, introductionMs); }
export function nextClue(s: ClueState, q: ClueQuestion, time: number): ClueState { return s.clueIndex >= q.clues.length - 1 ? phase(s, 'CLUE_RESULT', time, 3000) : phase({ ...s, clueIndex: s.clueIndex + 1, votes: [], holder: null, outcome: null, answer: null }, 'CLUE_ACTIVE', time, q.clueSeconds * 1000); }
export function claimBuzzer(s: ClueState, q: ClueQuestion, playerId: string, time: number): ClueState {
  if (s.phase !== 'CLUE_ACTIVE' || s.endsAt === null || time >= s.endsAt || s.eliminated.includes(playerId)) throw new Error('Bạn không thể giành quyền lúc này.');
  return phase({ ...s, holder: playerId, lockedScore: q.clues[s.clueIndex].score, remainingMs: s.endsAt - time, votes: [] }, 'CLUE_ANSWERING', time, q.answerSeconds * 1000);
}
export function voteClue(s: ClueState, q: ClueQuestion, playerId: string, players: string[], time: number): ClueState {
  if (s.phase !== 'CLUE_ACTIVE' || s.eliminated.includes(playerId) || time >= Number(s.endsAt)) throw new Error('Bạn không thể bình chọn lúc này.');
  const votes = [...new Set([...s.votes, playerId])];
  return votes.length >= requiredVotes(players.filter(p => !s.eliminated.includes(p)).length) ? nextClue(s, q, time) : { ...s, votes };
}
export function answerClue(s: ClueState, playerId: string, correct: boolean, text: string, time: number): ClueState {
  if (s.phase !== 'CLUE_ANSWERING' || s.holder !== playerId || time >= Number(s.endsAt)) throw new Error('Bạn không có quyền trả lời hoặc đã hết giờ.');
  return phase({ ...s, eliminated: correct ? s.eliminated : [...new Set([...s.eliminated, playerId])], outcome: correct ? 'correct' : 'wrong', answer: text }, correct ? 'CLUE_RESULT' : 'CLUE_FEEDBACK', time, correct ? 3000 : 1500);
}
export function expireClue(s: ClueState, questions: ClueQuestion[], players: string[], time: number): ClueState {
  const q = questions[s.questionIndex];
  if (s.endsAt === null || time < s.endsAt) return s;
  const at = s.endsAt;
  if (s.phase === 'QUESTION_INTRO') return phase(s, 'CLUE_ACTIVE', at, q.clueSeconds * 1000);
  if (s.phase === 'CLUE_ACTIVE') return nextClue(s, q, at);
  if (s.phase === 'CLUE_ANSWERING') return phase({ ...s, eliminated: [...new Set([...s.eliminated, s.holder!])], outcome: 'timeout', answer: null }, 'CLUE_FEEDBACK', at, 1500);
  if (s.phase === 'CLUE_FEEDBACK') {
    if (players.every(p => s.eliminated.includes(p))) return phase(s, 'CLUE_RESULT', at, 3000);
    if (s.clueIndex < q.clues.length - 1) return nextClue(s, q, at);
    return phase({ ...s, holder: null, votes: [], outcome: null }, 'CLUE_ACTIVE', at, Math.max(1, s.remainingMs));
  }
  if (s.phase === 'CLUE_RESULT') return s.questionIndex + 1 >= questions.length ? phase(s, 'GAME_FINISHED', at, null) : startClueQuestion({ ...s, questionIndex: s.questionIndex + 1 }, at);
  return s;
}
export function catchUpClue(s: ClueState, questions: ClueQuestion[], players: string[], time: number): ClueState {
  for (let i = 0; i < 512 && s.endsAt !== null && time >= s.endsAt; i++) { const next = expireClue(s, questions, players, time); if (next === s) break; s = next; }
  return s;
}
export function ranks<T extends { score: number }>(players: T[]): Array<T & { rank: number }> { return players.map(p => ({ ...p, rank: players.filter(other => other.score > p.score).length + 1 })); }
