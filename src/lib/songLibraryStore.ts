import {createHash} from 'node:crypto';
import type {Client, InStatement} from '@libsql/client';

export type LibrarySong = {
  id:string; title:string; scope:'VI'|'US_UK'; detail:string;
  performers?:string[]; artistAliases?:string[]; source?:unknown;
};
type Dataset={songs:LibrarySong[];source?:unknown};
export const LIBRARY_SCHEMA=`
CREATE TABLE IF NOT EXISTS song_library_releases (
  id TEXT PRIMARY KEY, manifest TEXT NOT NULL, song_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL, completed_at INTEGER
);
CREATE TABLE IF NOT EXISTS song_library_entries (
  version TEXT NOT NULL REFERENCES song_library_releases(id), scope TEXT NOT NULL,
  id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(version,scope,id)
);
CREATE TABLE IF NOT EXISTS song_library_active (
  id TEXT PRIMARY KEY CHECK(id='active'), version TEXT NOT NULL REFERENCES song_library_releases(id)
);`;

function canonical(song:LibrarySong):LibrarySong {
  return {id:song.id,title:song.title,scope:song.scope,detail:song.detail,
    performers:song.performers||[],artistAliases:song.artistAliases||[],source:song.source??null};
}
function digest(songs:LibrarySong[]) {
  const hash=createHash('sha256');
  for(const song of songs)hash.update(JSON.stringify(canonical(song))+'\n');
  return hash.digest('hex');
}
export function prepareLibrary(dataset:Dataset,curated:Dataset={songs:[]}) {
  const merged=new Map<string,LibrarySong>();
  for(const song of dataset.songs){
    if(merged.has(song.id))throw new Error('Trùng mã tác phẩm trong danh mục: '+song.id);
    merged.set(song.id,song);
  }
  for(const song of curated.songs)merged.set(song.id,{...merged.get(song.id),...song,source:merged.get(song.id)?.source??song.source??null});
  const songs=[...merged.values()].map(canonical).sort((a,b)=>a.scope.localeCompare(b.scope)||a.id.localeCompare(b.id));
  if(!songs.length)throw new Error('Danh mục rỗng.');
  for(const song of songs){
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(song.id)||
      !['VI','US_UK'].includes(song.scope)||!song.title?.trim()||typeof song.detail!=='string'||
      !Array.isArray(song.performers)||song.performers.some(s=>typeof s!=='string')||
      !Array.isArray(song.artistAliases)||song.artistAliases.some(s=>typeof s!=='string'))throw new Error('Bài hát không hợp lệ: '+song.id);
  }
  const version=digest(songs);
  const counts={VI:songs.filter(s=>s.scope==='VI').length,US_UK:songs.filter(s=>s.scope==='US_UK').length};
  return {version,songs,counts,manifest:JSON.stringify({source:dataset.source,curatedSource:curated.source,counts,checksum:version})};
}

async function write(client:Client,statements:InStatement[]) {
  for(let attempt=0;;attempt++){
    try{return await client.batch(statements,'write');}catch(error){
      if(attempt>=4||!/SQLITE_BUSY|database is locked|fetch failed|ECONNRESET|timeout/i.test(String(error)))throw error;
      await new Promise(resolve=>setTimeout(resolve,200*(attempt+1)));
    }
  }
}

export async function readLibraryScope(client:Client,version:string,scope:'VI'|'US_UK') {
  const songs:LibrarySong[]=[];let after='';
  for(;;){
    const result=await client.execute({sql:'SELECT id,payload FROM song_library_entries WHERE version=? AND scope=? AND id>? ORDER BY id LIMIT 1000',args:[version,scope,after]});
    for(const row of result.rows)songs.push(JSON.parse(String(row.payload)) as LibrarySong);
    if(result.rows.length<1000)return songs;
    after=String(result.rows.at(-1)!.id);
  }
}
export async function verifyLibrary(client:Client,prepared:ReturnType<typeof prepareLibrary>) {
  const songs=[...await readLibraryScope(client,prepared.version,'US_UK'),...await readLibraryScope(client,prepared.version,'VI')];
  songs.sort((a,b)=>a.scope.localeCompare(b.scope)||a.id.localeCompare(b.id));
  const counts=await client.execute({sql:'SELECT COUNT(*) AS count FROM song_library_entries WHERE version=?',args:[prepared.version]});
  if(Number(counts.rows[0].count)!==prepared.songs.length||songs.length!==prepared.songs.length||digest(songs)!==prepared.version)throw new Error('Danh mục trong database chưa đầy đủ hoặc sai checksum; chưa kích hoạt.');
  return {version:prepared.version,total:songs.length,counts:prepared.counts,checksum:prepared.version};
}
export async function importLibrary(client:Client,prepared:ReturnType<typeof prepareLibrary>,options:{batchSize?:number;onProgress?:(done:number,total:number)=>void}={}) {
  const batchSize=options.batchSize??100;
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>250)throw new Error('Kích thước lô phải từ 1 đến 250.');
  await client.executeMultiple(LIBRARY_SCHEMA);
  const existing=await client.execute({sql:'SELECT completed_at FROM song_library_releases WHERE id=?',args:[prepared.version]});
  if(existing.rows[0]?.completed_at){
    const report=await verifyLibrary(client,prepared);
    const active=await client.execute("SELECT version FROM song_library_active WHERE id='active'");
    // Re-running an older import must not silently roll a newer release back.
    return {...report,alreadyImported:true,active:active.rows[0]?.version===prepared.version};
  }
  await write(client,[{sql:'INSERT OR IGNORE INTO song_library_releases(id,manifest,song_count,created_at) VALUES(?,?,?,?)',args:[prepared.version,prepared.manifest,prepared.songs.length,Date.now()]}]);
  for(let offset=0;offset<prepared.songs.length;offset+=batchSize){
    await write(client,prepared.songs.slice(offset,offset+batchSize).map(song=>({
      sql:'INSERT INTO song_library_entries(version,scope,id,payload) VALUES(?,?,?,?) ON CONFLICT(version,scope,id) DO UPDATE SET payload=excluded.payload',
      args:[prepared.version,song.scope,song.id,JSON.stringify(song)]
    })));
    options.onProgress?.(Math.min(offset+batchSize,prepared.songs.length),prepared.songs.length);
  }
  const report=await verifyLibrary(client,prepared);
  await write(client,[
    {sql:'UPDATE song_library_releases SET completed_at=? WHERE id=?',args:[Date.now(),prepared.version]},
    {sql:"INSERT INTO song_library_active(id,version) VALUES('active',?) ON CONFLICT(id) DO UPDATE SET version=excluded.version",args:[prepared.version]}
  ]);
  return {...report,alreadyImported:false,active:true};
}
