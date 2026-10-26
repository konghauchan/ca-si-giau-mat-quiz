import {indexSongs,matchSongs,type IndexedSong} from './songCatalog.ts';
import type {MusicScope,SongSuggestion} from './musicSearch';
type Context={roomId?:string;gameToken?:string};
type Catalog={index:IndexedSong[];expiresAt:number;retryAt:number;pending?:Promise<void>};
const catalogs=new Map<MusicScope,Catalog>();
const MAX_SONGS=5000;
function catalog(scope:MusicScope){let value=catalogs.get(scope);if(!value){value={index:[],expiresAt:0,retryAt:0};catalogs.set(scope,value);}return value;}
export function cachedSongMatches(scope:MusicScope,query:string){return matchSongs(catalog(scope).index,query);}
export function rememberSongs(scope:MusicScope,songs:SongSuggestion[]) {
  const value=catalog(scope);const entries=new Map(value.index.map(item=>[item.song.id,item.song]));
  for(const song of songs)if(song.scope===scope&&song.id&&song.title&&song.token){entries.delete(song.id);entries.set(song.id,song);}
  while(entries.size>MAX_SONGS)entries.delete(entries.keys().next().value!);
  value.index=indexSongs([...entries.values()]);
}
export function primeSongCatalog(scope:MusicScope,context:Context={}):Promise<void> {
  const value=catalog(scope);if(value.pending)return value.pending;
  if(value.expiresAt>Date.now()||value.retryAt>Date.now())return Promise.resolve();
  const params=new URLSearchParams({scope});if(context.roomId)params.set('roomId',context.roomId);
  const task=(async()=>{
    try {
      const response=await fetch('/api/music/catalog?'+params,{headers:context.gameToken?{'x-game-token':context.gameToken}:{},cache:'no-store',signal:AbortSignal.timeout(12000)});
      const data=await response.json();if(!response.ok||data.scope!==scope||!Array.isArray(data.items))throw new Error('Catalog unavailable');
      rememberSongs(scope,data.items);value.expiresAt=Date.now()+5*60000;
    }catch{value.retryAt=Date.now()+10000;}
  })();value.pending=task;
  void task.finally(()=>{if(value.pending===task)value.pending=undefined;});
  return task;
}
