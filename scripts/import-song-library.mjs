import fs from 'node:fs';
import {createClient} from '@libsql/client';
import {prepareLibrary,importLibrary,verifyLibrary,readLibraryScope} from '../src/lib/songLibraryStore.ts';
import {extendLibrarySongs} from '../src/lib/extendSongLibrary.ts';

const args=process.argv.slice(2),input=args.find(arg=>arg.startsWith('--input='))?.slice(8),snapshot=args.find(arg=>arg.startsWith('--snapshot='))?.slice(11);
if(args.some(arg=>!['--verify','--dry-run','--local','--append'].includes(arg)&&!arg.startsWith('--input=')&&!arg.startsWith('--snapshot=')))throw new Error('Tùy chọn: --dry-run, --verify, --local, --input=<file>, --append, --snapshot=<file>');
if(args.includes('--append')&&(!input||args.includes('--dry-run')||args.includes('--verify')))throw new Error('--append cần --input và đọc phiên bản đang hoạt động; dùng --local để thử trước.');
const dataset=JSON.parse(fs.readFileSync(input||new URL('../src/lib/musicCatalogPopular.json',import.meta.url),'utf8'));
if(dataset.source?.complete===false)throw new Error('Danh mục đầu vào chưa thu thập hoàn tất.');
const curated=JSON.parse(fs.readFileSync(new URL('../src/lib/musicCatalogSeed.json',import.meta.url),'utf8'));
let prepared=prepareLibrary(dataset,input?{songs:[]}:curated);
if(args.includes('--dry-run')){
  console.log(JSON.stringify({version:prepared.version,total:prepared.songs.length,counts:prepared.counts,dryRun:true},null,2));
}else{
  const local=args.includes('--local');
  if(!local&&(!process.env.TURSO_DATABASE_URL||!process.env.TURSO_AUTH_TOKEN))throw new Error('Thiếu TURSO_DATABASE_URL/TURSO_AUTH_TOKEN. Dùng --env-file=<tệp kết nối> hoặc --local để thử trên SQLite.');
  const client=createClient({url:local?`file:${process.env.DATABASE_PATH||'./data/song-library-test.sqlite'}`:process.env.TURSO_DATABASE_URL,authToken:local?undefined:process.env.TURSO_AUTH_TOKEN});
  try{
    let expectedActiveVersion,extension;
    if(args.includes('--append')){
      const active=await client.execute("SELECT a.version,r.song_count FROM song_library_active a JOIN song_library_releases r ON r.id=a.version WHERE a.id='active' AND r.completed_at IS NOT NULL");
      if(!active.rows.length)throw new Error('Cần danh mục đã nhập hoàn chỉnh trước khi bổ sung.');
      expectedActiveVersion=String(active.rows[0].version);
      const existing=[...await readLibraryScope(client,expectedActiveVersion,'VI'),...await readLibraryScope(client,expectedActiveVersion,'US_UK')];
      if(existing.length!==Number(active.rows[0].song_count)||prepareLibrary({songs:existing}).version!==expectedActiveVersion)throw new Error('Danh mục gốc chưa khớp số lượng/checksum. Chưa nhập bổ sung.');
      extension=extendLibrarySongs(existing,prepared.songs);
      prepared=prepareLibrary({songs:extension.songs,source:{previousVersion:expectedActiveVersion,extension:dataset.source}});
    }
    if(snapshot)fs.writeFileSync(snapshot,JSON.stringify({source:JSON.parse(prepared.manifest).source,songs:prepared.songs}));
    const report=args.includes('--verify')?await verifyLibrary(client,prepared):await importLibrary(client,prepared,{expectedActiveVersion,onProgress:(done,total)=>{if(done%1000===0||done===total)console.log(`Đã nhập ${done}/${total}`);}});
    console.log(JSON.stringify({...report,...(extension?{added:extension.added,updated:extension.updated}:{}),database:local?'local':'Turso'},null,2));
  }finally{client.close();}
}
