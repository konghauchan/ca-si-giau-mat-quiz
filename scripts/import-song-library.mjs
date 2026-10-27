import fs from 'node:fs';
import {createClient} from '@libsql/client';
import {prepareLibrary,importLibrary,verifyLibrary} from '../src/lib/songLibraryStore.ts';

const args=process.argv.slice(2);
if(args.some(arg=>!['--verify','--dry-run','--local'].includes(arg)))throw new Error('Tùy chọn: --dry-run, --verify, --local');
const dataset=JSON.parse(fs.readFileSync(new URL('../src/lib/musicCatalogPopular.json',import.meta.url),'utf8'));
const curated=JSON.parse(fs.readFileSync(new URL('../src/lib/musicCatalogSeed.json',import.meta.url),'utf8'));
const prepared=prepareLibrary(dataset,curated);
if(args.includes('--dry-run')){
  console.log(JSON.stringify({version:prepared.version,total:prepared.songs.length,counts:prepared.counts,dryRun:true},null,2));
}else{
  const local=args.includes('--local');
  if(!local&&(!process.env.TURSO_DATABASE_URL||!process.env.TURSO_AUTH_TOKEN))throw new Error('Thiếu TURSO_DATABASE_URL/TURSO_AUTH_TOKEN. Dùng --env-file=<tệp kết nối> hoặc --local để thử trên SQLite.');
  const client=createClient({url:local?`file:${process.env.DATABASE_PATH||'./data/song-library-test.sqlite'}`:process.env.TURSO_DATABASE_URL,authToken:local?undefined:process.env.TURSO_AUTH_TOKEN});
  try{
    const report=args.includes('--verify')?await verifyLibrary(client,prepared):await importLibrary(client,prepared,{onProgress:(done,total)=>{if(done%1000===0||done===total)console.log(`Đã nhập ${done}/${total}`);}});
    console.log(JSON.stringify({...report,database:local?'local':'Turso'},null,2));
  }finally{client.close();}
}
