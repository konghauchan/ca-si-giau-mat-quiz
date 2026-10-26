import { normalizeAnswer } from './core.ts';

export type MusicScope = 'VI' | 'US_UK';
export const MUSIC_SCOPES = ['VI', 'US_UK'] as const;
export const musicScopeLabel = (scope: MusicScope) => scope === 'VI' ? 'Nhạc Việt · tiếng Việt' : 'US–UK · tiếng Anh quốc tế';
export type SongWork = { id: string; title: string; detail: string; scope: MusicScope; performers?:string[] };
export type SongSuggestion = SongWork & { token: string };
export type MusicBrainzWork = { id?: string; title?: string; type?: string; language?: string; languages?: string[]; disambiguation?: string; relations?: Array<{type?:string;artist?:{name?:string};recording?:{id?:string}}> };
export type MusicBrainzRecording={id?:string;title?:string;'artist-credit'?:Array<{name?:string;artist?:{name?:string}}>};
export const MUSIC_SEARCH_VERSION='performers-v2';
export const musicSearchCacheKey=(query:string,scope:MusicScope)=>`${MUSIC_SEARCH_VERSION}:${scope}:${normalizeAnswer(query)}`;
export function searchWords(query: string) {
  return normalizeAnswer(query).split(' ').filter(Boolean).slice(0,8);
}
function searchTerm(query:string) {
  const words = searchWords(query);
  if (!words.length) throw new Error('Nhập tên bài hát hoặc ca sĩ cần tìm.');
  return words.map(word => `${word}*`).join(' AND ');
}
function scopeFilter(scope:MusicScope) {
  // Release country is a distribution territory, not the language of a song.
  return `lang:${scope === 'VI' ? 'vie' : 'eng'}${scope === 'US_UK' ? ' AND NOT lang:vie' : ''}`;
}
export function musicBrainzRecordingQuery(query:string) {
  const term=searchTerm(query);
  return `(recording:(${term}) OR artist:(${term})^5 OR artistname:(${term})^5)`;
}
export function musicBrainzQuery(query: string, scope: MusicScope,recordingIds:string[]=[] ) {
  const term=searchTerm(query);
  const ids=[...new Set(recordingIds.filter(id=>/^[a-f0-9-]{36}$/i.test(id)))].slice(0,25);
  const title=`(work:(${term}) OR alias:(${term}))`;
  return `${ids.length?`(${title} OR (${ids.map(id=>'rid:'+id).join(' OR ')})^10)`:title} AND ${scopeFilter(scope)}`;
}
export function scopedWorks(works: MusicBrainzWork[], scope: MusicScope,recordings:MusicBrainzRecording[]=[]): SongWork[] {
  const seen = new Set<string>();
  const credits=new Map(recordings.map(recording=>[recording.id,recording['artist-credit']?.map(credit=>credit.name||credit.artist?.name).filter((name):name is string=>!!name?.trim())||[]]));
  return works.flatMap(work => {
    const languages = work.languages?.length ? work.languages : [work.language];
    if (!languages.includes(scope === 'VI' ? 'vie' : 'eng') || (scope === 'US_UK' && languages.includes('vie'))) return [];
    if (!work.id || !/^[a-f0-9-]{36}$/i.test(work.id) || !work.title?.trim() || work.title.length > 120 || seen.has(work.id)) return [];
    if (work.type && work.type !== 'Song') return [];
    seen.add(work.id);
    const authors = [...new Set((work.relations || []).filter(r=>r.type==='composer'||r.type==='lyricist').map(r=>r.artist?.name).filter(Boolean))];
    const performers=[...new Set((work.relations||[]).filter(r=>r.type==='performance'&&r.recording?.id).flatMap(r=>credits.get(r.recording!.id)||[]))];
    return [{id:work.id,title:work.title.trim(),scope,performers,detail:[work.disambiguation,authors.length ? `Tác giả: ${authors.slice(0,3).join(', ')}` : 'Tác phẩm âm nhạc'].filter(Boolean).join(' · ').slice(0,240)}];
  }).sort((a,b)=>Number(!!b.performers?.length)-Number(!!a.performers?.length)).slice(0,8);
}

export async function findMusicBrainzSongs(query:string,scope:MusicScope,request:(entity:'recording'|'work',query:string,limit:number)=>Promise<{recordings?:MusicBrainzRecording[];works?:MusicBrainzWork[]}>) {
  const data=await request('recording',musicBrainzRecordingQuery(query),25);
  if(!Array.isArray(data.recordings))throw new Error('Phản hồi bản thu MusicBrainz không hợp lệ.');
  const recordings=data.recordings;
  const result=await request('work',musicBrainzQuery(query,scope,recordings.flatMap(r=>r.id?[r.id]:[])),30);
  if(!Array.isArray(result.works))throw new Error('Phản hồi tác phẩm MusicBrainz không hợp lệ.');
  return scopedWorks(result.works,scope,recordings);
}
