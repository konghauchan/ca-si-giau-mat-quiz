import {createHash} from 'node:crypto';
import {db,one,run} from './db';
import {findMusicBrainzSongs,musicSearchCacheKey,MUSIC_CATALOG_VERSION,MUSIC_CATALOG_LIMIT,MUSIC_CATALOG_PAGE_SIZE,MUSIC_RESULT_LIMIT,normalizeMusicSearch,hasStrongSongMatch,type MusicScope,type SongWork,type SongSuggestion} from './musicSearch';
import {signSong} from './songToken';
import {songSigningKey} from './songSelections';
export {songSigningKey,verifySongSelection,savedSongToken} from './songSelections';
import {songLibrary,libraryMatches} from './songLibrary';
import {indexSongs,matchSongs} from './songCatalog';
import {requestMusicMetadata,MusicSearchPending,type MusicMetadata} from './musicProvider';
export {MusicSearchPending} from './musicProvider';

const DAY=86400000;
let nextCleanup=0;
const catalogSnapshots=new Map<MusicScope,{expiresAt:number;promise:Promise<SongSuggestion[]>}>();
export class MusicSearchBusy extends Error {
  constructor(public retryAfter=2){super('Bạn đang tìm quá nhiều lần. Vui lòng chờ ít giây.');}
}
async function suggestions(works:SongWork[]):Promise<SongSuggestion[]> {
  const key=await songSigningKey();return works.map(work=>({...work,token:signSong(work,key)}));
}
const inflight=new Map<string,Promise<{items:SongSuggestion[];source:string;notice?:string}>>();
export async function searchSongs(query:string,scope:MusicScope,refresh=false) {
  const normalized=normalizeMusicSearch(query);
  const cacheKey=musicSearchCacheKey(query,scope);
  const inflightKey=cacheKey+(refresh?':refresh':'');
  const active=inflight.get(inflightKey);if(active)return active;
  const pending=search(query,normalized,scope,cacheKey,refresh);inflight.set(inflightKey,pending);
  try{return await pending;}finally{inflight.delete(inflightKey);}
}
async function search(query:string,normalized:string,scope:MusicScope,cacheKey:string,refresh:boolean) {
  const defaults=await libraryMatches(query,scope);
  if(hasStrongSongMatch(defaults,query)&&!refresh)return {items:await suggestions(defaults),source:'catalog'};
  const cached=refresh?null:await one('SELECT payload FROM music_search_cache WHERE id=? AND expires_at>?',cacheKey,Date.now());
  if(cached){const value=JSON.parse(String(cached.payload));return {items:await suggestions(Array.isArray(value)?value:value.works),source:'cache',notice:value.notice};}
  // Reuse public provider metadata only. Never index private quiz answers.
  const words=normalized.split(' ').filter(Boolean).slice(0,8);
  const catalogScope=MUSIC_CATALOG_VERSION+':'+scope;
  const local=await (await db()).execute({sql:`SELECT id,title,detail FROM music_catalog WHERE scope=? AND updated_at>? ${words.map(()=> "AND (normalized_title LIKE ? OR REPLACE(normalized_title,' ','') LIKE ?)").join(' ')} ORDER BY updated_at DESC LIMIT ${MUSIC_RESULT_LIMIT}`,args:[catalogScope,Date.now()-30*DAY,...words.flatMap(w=>['%'+w+'%','%'+w+'%'])]});
  const storedWorks:SongWork[]=local.rows.map(r=>{const saved=JSON.parse(String(r.detail));return {id:String(r.id),title:String(r.title),detail:String(saved.detail),performers:Array.isArray(saved.performers)?saved.performers:[],artistAliases:Array.isArray(saved.artistAliases)?saved.artistAliases:[],scope};}).sort((a,b)=>Number(!!b.performers?.length)-Number(!!a.performers?.length));
  const localWorks=matchSongs(indexSongs([...new Map([...defaults,...storedWorks].map(song=>[song.id,{...song,token:''}])).values()]),query).map(song=>({...song,token:undefined}));
  if(hasStrongSongMatch(localWorks,query)&&!refresh)return {items:await suggestions(localWorks),source:'catalog'};
  try {
    let notice:string|undefined;
    const works=await findMusicBrainzSongs(query,scope,(entity,searchQuery,limit)=>requestMusicMetadata(entity,searchQuery,limit,{
      read:async(key,clock)=>{const row=await one('SELECT payload FROM music_search_cache WHERE id=? AND expires_at>?',key,clock);return row?JSON.parse(String(row.payload)) as MusicMetadata:undefined;},
      claim:async(lease,expiresAt,clock)=>{const gate=await (await db()).execute({sql:`INSERT INTO music_search_control(id,value,next_at) VALUES('upstream',?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,next_at=excluded.next_at WHERE music_search_control.next_at<=? RETURNING id`,args:[lease,expiresAt,clock]});return !!gate.rows.length;},
      write:async(key,data,expiresAt)=>run('INSERT INTO music_search_cache(id,payload,expires_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at',key,JSON.stringify(data),expiresAt),
      release:async(lease,nextAt)=>run("UPDATE music_search_control SET next_at=? WHERE id='upstream' AND value=?",nextAt,lease),
      fetch,
    }),(artist,recordings)=>{notice=recordings?`MusicBrainz có bản thu của ${artist}, nhưng chưa có tác phẩm đủ thông tin ngôn ngữ trong phạm vi này.`:`Chưa tìm thấy bản thu của ${artist} trên MusicBrainz.`;});
    await run('INSERT INTO music_search_cache(id,payload,expires_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at',cacheKey,JSON.stringify({works,notice}),Date.now()+(works.length?7*DAY:3600000));
    if(works.length)await (await db()).batch(works.map(work=>({sql:'INSERT INTO music_catalog(scope,id,title,detail,normalized_title,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(scope,id) DO UPDATE SET title=excluded.title,detail=excluded.detail,normalized_title=excluded.normalized_title,updated_at=excluded.updated_at',args:[catalogScope,work.id,work.title,JSON.stringify({detail:work.detail,performers:work.performers||[],artistAliases:work.artistAliases||[]}),normalizeMusicSearch([work.title,...(work.performers||[]),...(work.artistAliases||[])].join(' ')),Date.now()]})),'write');
    catalogSnapshots.delete(scope);
    if(Date.now()>nextCleanup){nextCleanup=Date.now()+60000;await (await db()).batch([{sql:'DELETE FROM music_search_cache WHERE expires_at<?',args:[Date.now()-DAY]},{sql:'DELETE FROM music_catalog WHERE updated_at<?',args:[Date.now()-30*DAY]}],'write');}
    return {items:await suggestions(works),source:'musicbrainz',notice};
  }catch(error){
    if(error instanceof MusicSearchBusy||error instanceof MusicSearchPending)throw error;
    if(localWorks.length)return {items:await suggestions(localWorks),source:'catalog'};
    throw new Error('Chưa kết nối được MusicBrainz. Hãy thử lại.');
  }
}
export async function limitMusicSearch(identity:string) {
  const id='music:'+createHash('sha256').update(identity).digest('hex');const clock=Date.now();
  const result=await (await db()).execute({sql:`INSERT INTO auth_rate_limits(key,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END WHERE reset_at<=? OR attempts<90 RETURNING key`,args:[id,clock+60000,clock,clock,clock]});
  if(!result.rows.length)throw new MusicSearchBusy(10);
}

// Scoped public provider metadata only: never join quizzes, questions or answers.
export function publicSongCatalog(scope:MusicScope):Promise<SongSuggestion[]> {
  const current=catalogSnapshots.get(scope);if(current&&current.expiresAt>Date.now())return current.promise;
  const promise=(async()=>{
    // Permanent releases are separate from the provider cache's 30-day TTL.
    const rows=await (await db()).execute({sql:'SELECT id,title,detail FROM music_catalog WHERE scope=? AND updated_at>? ORDER BY id LIMIT 5000',args:[MUSIC_CATALOG_VERSION+':'+scope,Date.now()-30*DAY]});
    const works:SongWork[]=rows.rows.map(row=>{const value=JSON.parse(String(row.detail));return {id:String(row.id),title:String(row.title),scope,detail:String(value.detail),performers:Array.isArray(value.performers)?value.performers:[],artistAliases:Array.isArray(value.artistAliases)?value.artistAliases:[]};});
    const library=await songLibrary(scope);
    const combined=[...new Map([...works,...library.songs].map(song=>[song.id,song])).values()].slice(0,MUSIC_CATALOG_LIMIT);
    return suggestions(combined);
  })();
  const entry={expiresAt:Date.now()+30000,promise};catalogSnapshots.set(scope,entry);
  void promise.catch(()=>{if(catalogSnapshots.get(scope)===entry)catalogSnapshots.delete(scope);});
  return promise;
}

// Each response stays below Vercel's payload limit. The complete catalog must
// not be silently truncated at the old 5,000-song / 3 MB boundary.
export async function publicSongCatalogPage(scope:MusicScope,offset=0,limit=MUSIC_CATALOG_PAGE_SIZE) {
  const songs=await publicSongCatalog(scope);
  const items:SongSuggestion[]=[];let bytes=0;
  const end=Math.min(songs.length,offset+limit);
  for(let i=offset;i<end;i++){
    const song=songs[i];const size=Buffer.byteLength(JSON.stringify(song),'utf8')+1;
    if(bytes+size>3*1024*1024)break;
    items.push(song);bytes+=size;
  }
  const next=offset+items.length;
  return {scope,items,total:songs.length,nextOffset:next<songs.length?next:null};
}
