import fs from 'node:fs';
import {createClient} from '@libsql/client';
import {prepareFilmLibrary,importFilmLibrary} from '../src/lib/filmLibraryStore.ts';
const input=process.argv.find(arg=>arg.startsWith('--input='))?.slice(8)||'src/lib/filmCatalogData.json';
const prepared=prepareFilmLibrary(JSON.parse(fs.readFileSync(input,'utf8')));
if(process.argv.includes('--dry-run'))console.log(JSON.stringify({version:prepared.version,count:prepared.films.length,dryRun:true}));
else {
  if(!process.env.TURSO_DATABASE_URL&&!process.argv.includes('--local'))throw new Error('Cần TURSO_DATABASE_URL hoặc --local.');
  const client=createClient({url:process.env.TURSO_DATABASE_URL||'file:'+(process.env.DATABASE_PATH||'./data/game.sqlite'),authToken:process.env.TURSO_AUTH_TOKEN});
  try{console.log(JSON.stringify(await importFilmLibrary(client,prepared)));}finally{client.close();}
}
