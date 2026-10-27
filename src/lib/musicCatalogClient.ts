import {indexSongs,matchSongs,type IndexedSong} from './songCatalog.ts';
import {MUSIC_CATALOG_LIMIT,MUSIC_CATALOG_PAGE_SIZE,type MusicScope,type SongSuggestion} from './musicSearch.ts';
type Context={roomId?:string;gameToken?:string};
type Catalog={index:IndexedSong[];expiresAt:number;retryAt:number;pending?:Promise<void>;listeners:Set<()=>void>};
const catalogs=new Map<MusicScope,Catalog>();
function catalog(scope:MusicScope){let value=catalogs.get(scope);if(!value){value={index:[],expiresAt:0,retryAt:0,listeners:new Set()};catalogs.set(scope,value);}return value;}
export function subscribeSongCatalog(scope:MusicScope,listener:()=>void) {const value=catalog(scope);value.listeners.add(listener);return ()=>{value.listeners.delete(listener);};}
export function cachedSongMatches(scope:MusicScope,query:string){return matchSongs(catalog(scope).index,query);}
export function rememberSongs(scope:MusicScope,songs:SongSuggestion[]) {
  const value=catalog(scope);const entries=new Map(value.index.map(item=>[item.song.id,item.song]));
  for(const song of songs)if(song.scope===scope&&song.id&&song.title&&song.token){entries.delete(song.id);entries.set(song.id,song);}
  while(entries.size>MUSIC_CATALOG_LIMIT)entries.delete(entries.keys().next().value!);
  value.index=indexSongs([...entries.values()]);
  value.listeners.forEach(listener=>listener());
}
export function primeSongCatalog(scope:MusicScope,context:Context={}):Promise<void> {
  const value=catalog(scope);if(value.pending)return value.pending;
  if(value.expiresAt>Date.now()||value.retryAt>Date.now())return Promise.resolve();
  const task=(async()=>{
    try {
      let offset=0;
      do {
        const params=new URLSearchParams({scope,offset:String(offset),limit:String(MUSIC_CATALOG_PAGE_SIZE)});if(context.roomId)params.set('roomId',context.roomId);
        const response=await fetch('/api/music/catalog?'+params,{headers:context.gameToken?{'x-game-token':context.gameToken}:{},cache:'no-store',signal:AbortSignal.timeout(12000)});
        const data=await response.json();if(!response.ok||data.scope!==scope||!Array.isArray(data.items)||data.items.length>MUSIC_CATALOG_PAGE_SIZE)throw new Error('Catalog unavailable');
        rememberSongs(scope,data.items);
        if(data.nextOffset==null)break;
        if(!Number.isInteger(data.nextOffset)||data.nextOffset<=offset||data.nextOffset>MUSIC_CATALOG_LIMIT)throw new Error('Invalid catalog page');
        offset=data.nextOffset;
      }while(offset<MUSIC_CATALOG_LIMIT);
      value.expiresAt=Date.now()+5*60000;value.retryAt=0;
    }catch{value.retryAt=Date.now()+10000;}
  })();value.pending=task;
  void task.finally(()=>{if(value.pending===task)value.pending=undefined;});
  return task;
}
