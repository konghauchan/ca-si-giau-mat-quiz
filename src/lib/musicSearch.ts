import { normalizeAnswer } from './core.ts';

export type MusicScope = 'VI' | 'US_UK';
export const MUSIC_SCOPES = ['VI', 'US_UK'] as const;
export const musicScopeLabel = (scope: MusicScope) => scope === 'VI' ? 'Nhạc Việt · tiếng Việt' : 'US–UK · tiếng Anh quốc tế';
export type SongWork = { id: string; title: string; detail: string; scope: MusicScope };
export type SongSuggestion = SongWork & { token: string };
export type MusicBrainzWork = { id?: string; title?: string; type?: string; language?: string; languages?: string[]; disambiguation?: string; relations?: Array<{type?:string;artist?:{name?:string}}> };
export function searchWords(query: string) {
  return normalizeAnswer(query).split(' ').filter(Boolean).slice(0,8);
}
export function musicBrainzQuery(query: string, scope: MusicScope) {
  const words = searchWords(query);
  if (!words.length) throw new Error('Nhập tên bài hát cần tìm.');
  const term = words.map(word => `${word}*`).join(' AND ');
  // Release country is a distribution territory, not the language of a song.
  return `(work:(${term}) OR alias:(${term})) AND lang:${scope === 'VI' ? 'vie' : 'eng'}${scope === 'US_UK' ? ' AND NOT lang:vie' : ''}`;
}
export function scopedWorks(works: MusicBrainzWork[], scope: MusicScope): SongWork[] {
  const seen = new Set<string>();
  return works.flatMap(work => {
    const languages = work.languages?.length ? work.languages : [work.language];
    if (!languages.includes(scope === 'VI' ? 'vie' : 'eng') || (scope === 'US_UK' && languages.includes('vie'))) return [];
    if (!work.id || !/^[a-f0-9-]{36}$/i.test(work.id) || !work.title?.trim() || work.title.length > 120 || seen.has(work.id)) return [];
    if (work.type && work.type !== 'Song') return [];
    seen.add(work.id);
    const authors = [...new Set((work.relations || []).filter(r=>r.type==='composer'||r.type==='lyricist').map(r=>r.artist?.name).filter(Boolean))];
    return [{id:work.id,title:work.title.trim(),scope,detail:[work.disambiguation,authors.length ? `Tác giả: ${authors.slice(0,3).join(', ')}` : 'Tác phẩm âm nhạc'].filter(Boolean).join(' · ').slice(0,240)}];
  }).slice(0,8);
}
