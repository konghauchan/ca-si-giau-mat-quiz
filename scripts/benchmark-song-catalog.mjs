import {MUSIC_RESULT_LIMIT} from '../src/lib/musicSearch.ts';
import {performance} from 'node:perf_hooks';
import {indexSongs,matchSongs} from '../src/lib/songCatalog.ts';
const songs=Array.from({length:5000},(_,i)=>({id:String(i),title:'Biển nhớ '+i,performers:[i%2?'Trịnh Công Sơn':'Ca sĩ Việt'],scope:'VI',token:'benchmark-'+i,detail:''}));
const buildStart=performance.now();const index=indexSongs(songs);const indexMs=performance.now()-buildStart;
const samples=[];
for(let i=0;i<300;i++){
  const start=performance.now();const found=matchSongs(index,i%2?'trinh cong son':'bien nho');
  if(found.length!==MUSIC_RESULT_LIMIT)throw new Error('Missing expected results');
  samples.push(performance.now()-start);
}
samples.sort((a,b)=>a-b);
console.log(JSON.stringify({catalogSize:songs.length,queries:samples.length,indexMs,p50Ms:samples[150],p95Ms:samples[285],maxMs:samples.at(-1),note:'Synthetic client index only; excludes catalog download, rendering and server submission.'},null,2));
