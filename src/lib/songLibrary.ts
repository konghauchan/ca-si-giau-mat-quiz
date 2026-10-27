import {db} from './db';
import {readLibraryScope} from './songLibraryStore';
import {indexSongs,matchSongs} from './songCatalog';
import type {MusicScope,SongWork} from './musicSearch';

const snapshots=new Map<MusicScope,{expiresAt:number;promise:Promise<{songs:SongWork[];index:ReturnType<typeof indexSongs>;source:string;version:string}>}>();
export function songLibrary(scope:MusicScope){
  const cached=snapshots.get(scope);if(cached&&cached.expiresAt>Date.now())return cached.promise;
  const promise=(async()=>{
    const client=await db();
    const active=await client.execute("SELECT a.version,r.song_count FROM song_library_active a JOIN song_library_releases r ON r.id=a.version WHERE a.id='active' AND r.completed_at IS NOT NULL");
    const version=String(active.rows[0]?.version||'bundled');
    const previous=await cached?.promise.catch(()=>undefined);
    if(previous?.version===version)return previous;
    const songs:SongWork[]=version!=='bundled'
      ?(await readLibraryScope(client,version,scope)).map(({id,title,scope,detail,performers,artistAliases})=>({id,title,scope,detail,performers,artistAliases}))
      :(await import('./defaultSongCatalog')).defaultSongs.filter(song=>song.scope===scope);
    return {songs,index:indexSongs(songs.map(song=>({...song,token:''}))),source:version!=='bundled'?'turso':'bundled',version};
  })();
  const entry={expiresAt:Date.now()+30000,promise};snapshots.set(scope,entry);
  void promise.catch(()=>{if(snapshots.get(scope)===entry)snapshots.delete(scope);});
  return promise;
}
export async function libraryMatches(query:string,scope:MusicScope):Promise<SongWork[]>{
  return matchSongs((await songLibrary(scope)).index,query).map(({id,title,scope,detail,performers,artistAliases})=>({id,title,scope,detail,performers,artistAliases}));
}
