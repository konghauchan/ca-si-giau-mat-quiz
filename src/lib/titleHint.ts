import { scoreForTimedAnswer } from './core.ts';
export const TITLE_HINT_MULTIPLIER = 0.7;
export const titleCharacters = (title: string) => Array.from(title.trim().normalize('NFC'));
export const isTitleLetter = (letter: string) => /^[\p{L}\p{N}]$/u.test(letter);
export function titleHintLimit(title: string) {
  const count = titleCharacters(title).filter(isTitleLetter).length;
  return count < 2 ? 0 : count <= 5 ? 1 : Math.max(1, Math.floor(count * 0.3));
}
export function titleHintIndices(title: string, selected: number[] = []) {
  const letters = titleCharacters(title).flatMap((letter, i) => isTitleLetter(letter) ? [i] : []);
  const limit = titleHintLimit(title);
  if (selected.length) return [...new Set(selected)].filter(i=>letters.includes(i)).slice(0,limit);
  // Spread the letters over the title instead of exposing a complete leading word.
  return Array.from({length:limit},(_,i)=>letters[Math.floor((i+0.5)*letters.length/limit)]);
}
export function maskedTitle(title: string, selected: number[] = [], revealed = false) {
  const indices = revealed ? titleHintIndices(title,selected) : [];
  return titleCharacters(title).map((letter,i)=>isTitleLetter(letter)&&!indices.includes(i)?'＿':letter).join('');
}
export const titleHintAt = (start: number, end: number) => start + (end-start)/2;
export function scoreWithTitleHint(max: number, start: number, end: number, at: number) {
  const points = scoreForTimedAnswer(max,start,end,at);
  return at >= titleHintAt(start,end) ? Math.floor(points*TITLE_HINT_MULTIPLIER) : points;
}
