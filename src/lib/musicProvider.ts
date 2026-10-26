import {createHash,randomBytes} from 'node:crypto';
import type {MusicBrainzArtist,MusicBrainzRecording,MusicBrainzWork} from './musicSearch.ts';
export type MusicEntity='artist'|'recording'|'work';
export type MusicMetadata={artists?:MusicBrainzArtist[];recordings?:MusicBrainzRecording[];works?:MusicBrainzWork[]};
export class MusicSearchPending extends Error {
  retryAfter:number;
  constructor(retryAfter=2){super('Đang tải danh mục bài hát. Kết quả sẽ tự cập nhật.');this.retryAfter=retryAfter;}
}
type Store={
  read:(key:string,clock:number)=>Promise<MusicMetadata|undefined>;
  claim:(lease:string,expiresAt:number,clock:number)=>Promise<boolean>;
  write:(key:string,data:MusicMetadata,expiresAt:number)=>Promise<void>;
  release:(lease:string,nextAt:number)=>Promise<void>;
  fetch:typeof fetch;
  now?:()=>number;
};
function compactMetadata(entity:MusicEntity,data:MusicMetadata,query:string):MusicMetadata {
  if(entity==='artist')return {artists:data.artists!.slice(0,5).map(a=>({id:a.id,name:a.name,score:a.score,aliases:a.aliases?.slice(0,30).map(alias=>({name:alias.name}))}))};
  if(entity==='recording')return {recordings:data.recordings!.slice(0,100).map(r=>({id:r.id,title:r.title,'artist-credit':r['artist-credit']?.slice(0,20).map(c=>({name:c.name,artist:{id:c.artist?.id,name:c.artist?.name}}))}))};
  const ids=new Set([...query.matchAll(/rid:([a-f0-9-]{36})/gi)].map(match=>match[1]));
  return {works:data.works!.slice(0,100).map(w=>({id:w.id,title:w.title,type:w.type,language:w.language,languages:w.languages,disambiguation:w.disambiguation,relations:w.relations?.filter(r=>r.type==='composer'||r.type==='lyricist'||r.type==='performance'&&ids.has(r.recording?.id||'')).slice(0,120).map(r=>({type:r.type,artist:r.artist?{name:r.artist.name}:undefined,recording:r.recording?{id:r.recording.id}:undefined}))}))};
}
export const musicMetadataCacheKey=(entity:MusicEntity,query:string,limit:number)=>'music-provider-v1:'+createHash('sha256').update(JSON.stringify([entity,query,limit])).digest('hex');
// Cache each public metadata step across instances. Waiting clients resume at the
// first unfinished step instead of repeating artist/recording requests.
export async function requestMusicMetadata(entity:MusicEntity,query:string,limit:number,store:Store):Promise<MusicMetadata> {
  const now=store.now||Date.now;
  const key=musicMetadataCacheKey(entity,query,limit);
  const cached=await store.read(key,now());if(cached)return cached;
  const lease=randomBytes(12).toString('hex');
  const timeout=entity==='work'?15000:7000;
  if(!await store.claim(lease,now()+timeout+3000,now())){
    const completed=await store.read(key,now());if(completed)return completed;
    throw new MusicSearchPending();
  }
  let nextAt=now()+1100;
  try {
    const url=new URL('https://musicbrainz.org/ws/2/'+entity);
    url.search=new URLSearchParams({query,fmt:'json',limit:String(limit)}).toString();
    const response=await store.fetch(url,{headers:{'User-Agent':'DoNhacQuiz/1.1 (https://do-nhac.vercel.app)','Accept':'application/json'},signal:AbortSignal.timeout(timeout),cache:'no-store'});
    nextAt=now()+1100;
    if(response.status===429||response.status===503){nextAt=now()+5000;await response.body?.cancel();throw new MusicSearchPending(5);}
    if(!response.ok)throw new Error('Chưa kết nối được MusicBrainz. Hãy thử lại.');
    const data:MusicMetadata=await response.json();
    const items=entity==='artist'?data.artists:entity==='recording'?data.recordings:data.works;
    if(!Array.isArray(items))throw new Error('Phản hồi MusicBrainz không hợp lệ.');
    const compact=compactMetadata(entity,data,query);
    await store.write(key,compact,now()+(items.length?86400000:3600000));
    return compact;
  }catch(error){
    if(error instanceof MusicSearchPending)throw error;
    if(error instanceof Error&&(error.name==='TimeoutError'||error.name==='AbortError')){nextAt=now()+2000;throw new MusicSearchPending(2);}
    throw error;
  }finally{await store.release(lease,Math.max(nextAt,now()+1100));}
}
