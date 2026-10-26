import { normalizeAnswer } from './core.ts';

export type MusicScope = 'VI' | 'US_UK';
export const MUSIC_SCOPES = ['VI', 'US_UK'] as const;
export const musicScopeLabel = (scope: MusicScope) => scope === 'VI' ? 'Nhạc Việt · tiếng Việt' : 'US–UK · tiếng Anh quốc tế';
export type SongWork = { id: string; title: string; detail: string; scope: MusicScope; performers?:string[] };
export type SongSuggestion = SongWork & { token: string };
export type MusicBrainzWork = { id?: string; title?: string; type?: string; language?: string; languages?: string[]; disambiguation?: string; relations?: Array<{type?:string;artist?:{name?:string};recording?:{id?:string}}> };
export type MusicBrainzArtist = {id?:string;name?:string;score?:number;aliases?:Array<{name?:string}>};
export type MusicBrainzRecording = {id?:string;title?:string;'artist-credit'?:Array<{name?:string;artist?:{id?:string;name?:string}}>};
export const MUSIC_SEARCH_VERSION='shared-metadata-v4';
export const MUSIC_CATALOG_VERSION='artist-prefix-v3';
export const MUSIC_RESULT_LIMIT=20;
const validId=(id:string)=>/^[a-f0-9-]{36}$/i.test(id);
// Search normalization is deliberately separate from answer matching/scoring.
export function normalizeMusicSearch(query:string) {
  return normalizeAnswer(query.replace(/['’]s\b/gi,'').replace(/['’]/g,''));
}
export function musicWordMatches(word:string,candidate:string):boolean {
  if(candidate.includes(word))return true;
  if(word.length<4||Math.abs(word.length-candidate.length)>1)return false;
  let a=0,b=0,edits=0;
  while(a<word.length&&b<candidate.length){
    if(word[a]===candidate[b]){a++;b++;continue;}
    if(++edits>1)return false;
    if(word.length>=candidate.length)a++;
    if(candidate.length>=word.length)b++;
  }
  return edits+(word.length-a)+(candidate.length-b)<=1;
}
export const musicSearchCacheKey=(query:string,scope:MusicScope)=>`${MUSIC_SEARCH_VERSION}:${scope}:${normalizeMusicSearch(query)}`;
export function searchWords(query: string) {
  return normalizeMusicSearch(query).split(' ').filter(Boolean).slice(0,8);
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
export function musicBrainzArtistQuery(query:string) {
  const words=searchWords(query),term=searchTerm(query),compact=words.join('');
  const fuzzy=words.map(word=>word.length>=4?word+'~1':word+'*').join(' AND ');
  return `(artist:(${term}) OR alias:(${term}) OR artist:(${fuzzy}) OR alias:(${fuzzy})${words.length>1?` OR artist:${compact}* OR alias:${compact}*`:''})`;
}
export function matchingArtist(artists:MusicBrainzArtist[],query:string):MusicBrainzArtist|undefined {
  const words=searchWords(query),compact=words.join('');
  return artists.filter(artist=>artist.id&&validId(artist.id)&&[artist.name,...(artist.aliases||[]).map(alias=>alias.name)].some(name=>{
    const text=normalizeMusicSearch(name||'');
    return words.every(word=>text.split(' ').some(candidate=>musicWordMatches(word,candidate)))||text.replaceAll(' ','').startsWith(compact);
  })).sort((a,b)=>Number(b.score||0)-Number(a.score||0))[0];
}
export function musicBrainzRecordingQuery(query:string,artistId?:string) {
  const term=searchTerm(query);
  // Exact artist identity avoids spending all candidate slots on fuzzy names.
  return artistId&&validId(artistId)?`arid:${artistId}`:`(recording:(${term}) OR artist:(${term})^5 OR artistname:(${term})^5)`;
}
export function musicBrainzQuery(query: string, scope: MusicScope,recordingIds:string[]=[] ) {
  const term=searchTerm(query);
  const ids=[...new Set(recordingIds.filter(validId))].slice(0,100);
  const title=`(work:(${term}) OR alias:(${term}))`;
  return `${ids.length?`(${title} OR (${ids.map(id=>'rid:'+id).join(' OR ')})^10)`:title} AND ${scopeFilter(scope)}`;
}
export function scopedWorks(works: MusicBrainzWork[], scope: MusicScope,recordings:MusicBrainzRecording[]=[]): SongWork[] {
  const seen = new Set<string>();
  const credits=new Map(recordings.map(recording=>[recording.id,recording['artist-credit']?.map(credit=>credit.name||credit.artist?.name).filter((name):name is string=>!!name?.trim())||[]]));
  const order=new Map(recordings.map((recording,index)=>[recording.id,index]));
  return works.flatMap(work => {
    const languages = work.languages?.length ? work.languages : [work.language];
    if (!languages.includes(scope === 'VI' ? 'vie' : 'eng') || (scope === 'US_UK' && languages.includes('vie'))) return [];
    if (!work.id || !validId(work.id) || !work.title?.trim() || work.title.length > 120 || seen.has(work.id)) return [];
    if (work.type && work.type !== 'Song') return [];
    seen.add(work.id);
    const authors = [...new Set((work.relations || []).filter(r=>r.type==='composer'||r.type==='lyricist').map(r=>r.artist?.name).filter(Boolean))];
    // A work can have many covers. Display ONE recording's actual credit group,
    // rather than presenting unrelated cover artists as a duet.
    const performances=(work.relations||[]).filter(r=>r.type==='performance'&&credits.get(r.recording?.id)?.length).sort((a,b)=>(order.get(a.recording?.id)??Infinity)-(order.get(b.recording?.id)??Infinity));
    const performers=[...new Set(credits.get(performances[0]?.recording?.id)||[])];
    return [{id:work.id,title:work.title.trim(),scope,performers,detail:[work.disambiguation,authors.length ? `Tác giả: ${authors.slice(0,3).join(', ')}` : 'Tác phẩm âm nhạc'].filter(Boolean).join(' · ').slice(0,240)}];
  }).sort((a,b)=>Number(!!b.performers?.length)-Number(!!a.performers?.length)).slice(0,MUSIC_RESULT_LIMIT);
}

type SearchResponse={artists?:MusicBrainzArtist[];recordings?:MusicBrainzRecording[];works?:MusicBrainzWork[]};
export async function findMusicBrainzSongs(query:string,scope:MusicScope,request:(entity:'artist'|'recording'|'work',query:string,limit:number)=>Promise<SearchResponse>) {
  let artist:MusicBrainzArtist|undefined;
  if(normalizeMusicSearch(query).length>=3){
    const data=await request('artist',musicBrainzArtistQuery(query),5);
    if(!Array.isArray(data.artists))throw new Error('Phản hồi nghệ sĩ MusicBrainz không hợp lệ.');
    artist=matchingArtist(data.artists,query);
  }
  const data=await request('recording',musicBrainzRecordingQuery(query,artist?.id),100);
  if(!Array.isArray(data.recordings))throw new Error('Phản hồi bản thu MusicBrainz không hợp lệ.');
  // Prefer plain studio credits to live/remix variants when choosing a display credit.
  const variant=/\b(live|remix|mix|instrumental|karaoke)\b/i;
  const recordings=[...data.recordings].sort((a,b)=>Number(variant.test(a.title||''))-Number(variant.test(b.title||''))||(a['artist-credit']?.length||0)-(b['artist-credit']?.length||0));
  const result=await request('work',musicBrainzQuery(artist?.name||query,scope,recordings.flatMap(r=>r.id?[r.id]:[])),100);
  if(!Array.isArray(result.works))throw new Error('Phản hồi tác phẩm MusicBrainz không hợp lệ.');
  return scopedWorks(result.works,scope,recordings);
}
