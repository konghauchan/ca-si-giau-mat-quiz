import {randomBytes,createHash} from 'node:crypto';
import {db,one,run} from './db';
import {normalizeAnswer} from './core';
import {findMusicBrainzSongs,musicSearchCacheKey,MUSIC_SEARCH_VERSION,type MusicScope,type SongWork,type SongSuggestion} from './musicSearch';
import {signSong,readSong} from './songToken';

const DAY=86400000;
let keyPromise:Promise<string>|undefined;
export function songSigningKey():Promise<string> {
  return keyPromise??= (async()=>{
    await run('INSERT OR IGNORE INTO music_search_control(id,value,next_at) VALUES(?,?,0)','signing-key',randomBytes(32).toString('hex'));
    return String((await one('SELECT value FROM music_search_control WHERE id=?','signing-key'))!.value);
  })().catch(error=>{keyPromise=undefined;throw error;});
}
export class MusicSearchBusy extends Error {
  constructor(public retryAfter=2){super('Kho tìm kiếm đang bận. Vui lòng thử lại sau ít giây.');}
}
async function suggestions(works:SongWork[]):Promise<SongSuggestion[]> {
  const key=await songSigningKey();return works.map(work=>({...work,token:signSong(work,key)}));
}
export async function verifySongSelection(token:string,scope:MusicScope) {
  const song=readSong(token,await songSigningKey());
  if(song.scope!==scope)throw new Error('Bài hát không thuộc phạm vi nhạc của quiz. Hãy chọn lại bài.');
  return song;
}
export async function savedSongToken(id:string,title:string,scope:MusicScope) {
  return signSong({id,title,scope,detail:''},await songSigningKey());
}
const inflight=new Map<string,Promise<{items:SongSuggestion[];source:string}>>();
export async function searchSongs(query:string,scope:MusicScope) {
  const normalized=normalizeAnswer(query);
  const cacheKey=musicSearchCacheKey(query,scope);
  const active=inflight.get(cacheKey);if(active)return active;
  const pending=search(query,normalized,scope,cacheKey);inflight.set(cacheKey,pending);
  try{return await pending;}finally{inflight.delete(cacheKey);}
}
async function search(query:string,normalized:string,scope:MusicScope,cacheKey:string) {
  const cached=await one('SELECT payload FROM music_search_cache WHERE id=? AND expires_at>?',cacheKey,Date.now());
  if(cached)return {items:await suggestions(JSON.parse(String(cached.payload))),source:'cache'};
  // Reuse public provider metadata only. Never index private quiz answers.
  const words=normalized.split(' ').filter(Boolean).slice(0,8);
  const catalogScope=MUSIC_SEARCH_VERSION+':'+scope;
  const local=await (await db()).execute({sql:`SELECT id,title,detail FROM music_catalog WHERE scope=? AND updated_at>? ${words.map(()=> 'AND normalized_title LIKE ?').join(' ')} ORDER BY updated_at DESC LIMIT 8`,args:[catalogScope,Date.now()-30*DAY,...words.map(w=>'%'+w+'%')]});
  const localWorks:SongWork[]=local.rows.map(r=>{const saved=JSON.parse(String(r.detail));return {id:String(r.id),title:String(r.title),detail:String(saved.detail),performers:Array.isArray(saved.performers)?saved.performers:[],scope};}).sort((a,b)=>Number(!!b.performers?.length)-Number(!!a.performers?.length));
  if(localWorks.length>=8)return {items:await suggestions(localWorks),source:'catalog'};
  // This lease is in Turso, shared across Vercel instances. No unbounded queue.
  const lease=randomBytes(12).toString('hex');const clock=Date.now();
  const gate=await (await db()).execute({sql:`INSERT INTO music_search_control(id,value,next_at) VALUES('upstream',?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,next_at=excluded.next_at WHERE music_search_control.next_at<=? RETURNING id`,args:[lease,clock+30000,clock]});
  if(!gate.rows.length){if(localWorks.length)return {items:await suggestions(localWorks),source:'catalog'};throw new MusicSearchBusy();}
  try {
    let lastRequest=0;
    const works=await findMusicBrainzSongs(query,scope,async(entity,searchQuery,limit)=>{
      const wait=1100-(Date.now()-lastRequest);if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
      const url=new URL('https://musicbrainz.org/ws/2/'+entity);
      url.search=new URLSearchParams({query:searchQuery,fmt:'json',limit:String(limit)}).toString();
      const response=await fetch(url,{headers:{'User-Agent':'DoNhacQuiz/1.0 (https://do-nhac.vercel.app)','Accept':'application/json'},signal:AbortSignal.timeout(7000),cache:'no-store'});
      lastRequest=Date.now();
      if(!response.ok)throw new MusicSearchBusy(response.status===429||response.status===503?5:2);
      return response.json();
    });
    await run('INSERT INTO music_search_cache(id,payload,expires_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at',cacheKey,JSON.stringify(works),Date.now()+(works.length?7*DAY:3600000));
    if(works.length)await (await db()).batch(works.map(work=>({sql:'INSERT INTO music_catalog(scope,id,title,detail,normalized_title,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(scope,id) DO UPDATE SET title=excluded.title,detail=excluded.detail,normalized_title=excluded.normalized_title,updated_at=excluded.updated_at',args:[catalogScope,work.id,work.title,JSON.stringify({detail:work.detail,performers:work.performers||[]}),normalizeAnswer([work.title,...(work.performers||[])].join(' ')),Date.now()]})),'write');
    return {items:await suggestions(works),source:'musicbrainz'};
  }catch(error){
    if(localWorks.length)return {items:await suggestions(localWorks),source:'catalog'};
    if(error instanceof MusicSearchBusy)throw error;
    throw new Error('Chưa kết nối được MusicBrainz. Hãy thử lại.');
  }finally {
    await run("UPDATE music_search_control SET next_at=? WHERE id='upstream' AND value=?",Date.now()+1100,lease);
    // Bound expired metadata/cache growth without one write per keystroke.
    await run('DELETE FROM music_search_cache WHERE expires_at<?',Date.now()-DAY);
    await run('DELETE FROM music_catalog WHERE updated_at<?',Date.now()-30*DAY);
  }
}
export async function limitMusicSearch(identity:string) {
  const id='music:'+createHash('sha256').update(identity).digest('hex');const clock=Date.now();
  const result=await (await db()).execute({sql:`INSERT INTO auth_rate_limits(key,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END WHERE reset_at<=? OR attempts<90 RETURNING key`,args:[id,clock+60000,clock,clock,clock]});
  if(!result.rows.length)throw new MusicSearchBusy(10);
}
