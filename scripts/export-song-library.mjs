import fs from 'node:fs';
import path from 'node:path';
import {createClient} from '@libsql/client';
import {prepareLibrary,readLibraryScope} from '../src/lib/songLibraryStore.ts';

const args=process.argv.slice(2),output=args.find(v=>v.startsWith('--output='))?.slice(9);
if(!output||args.some(v=>!v.startsWith('--output=')))throw new Error('Dùng --output=<snapshot.json> và biến môi trường TURSO_DATABASE_URL/TURSO_AUTH_TOKEN.');
if(!process.env.TURSO_DATABASE_URL||!process.env.TURSO_AUTH_TOKEN)throw new Error('Thiếu kết nối Turso.');
const client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
try{
  const active=(await client.execute("SELECT a.version,r.song_count FROM song_library_active a JOIN song_library_releases r ON r.id=a.version WHERE a.id='active' AND r.completed_at IS NOT NULL")).rows[0];
  if(!active)throw new Error('Chưa có danh mục đang hoạt động.');
  const songs=[...await readLibraryScope(client,String(active.version),'VI'),...await readLibraryScope(client,String(active.version),'US_UK')];
  const prepared=prepareLibrary({songs});
  if(prepared.version!==active.version||prepared.songs.length!==Number(active.song_count))throw new Error('Snapshot không khớp checksum của danh mục đang hoạt động.');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify({source:{version:prepared.version,complete:true,exportedAt:new Date().toISOString()},songs:prepared.songs}));
  console.log(JSON.stringify({version:prepared.version,total:prepared.songs.length,counts:prepared.counts,output}));
}finally{client.close();}
