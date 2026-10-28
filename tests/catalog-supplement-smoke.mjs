import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createClient} from '@libsql/client';
import {registerTestAccount} from './register-test-account.mjs';
import {MUSIC_SEARCH_VERSION,normalizeMusicSearch} from '../src/lib/musicSearch.ts';

assert.ok(process.env.DATABASE_PATH?.includes('rounds-smoke'));
assert.ok(!process.env.TURSO_DATABASE_URL);
const base=process.env.SMOKE_BASE_URL||'http://localhost:3220';assert.match(base,/^http:\/\/localhost:/);
const db=createClient({url:'file:'+path.resolve(process.env.DATABASE_PATH)});
try{
 const cookie=await registerTestAccount(base);
 async function call(endpoint,body,token=''){
  const response=await fetch(base+endpoint,{method:body?'POST':'GET',headers:{origin:base,'content-type':'application/json',cookie,...(token?{'x-game-token':token}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;
 }
 await call('/api/quiz');
 const title='I Lay My Love on You',wid='b2ca2699-1db0-470a-8a11-1a04cf20f945';
 await db.execute({sql:'INSERT OR REPLACE INTO music_search_cache(id,payload,expires_at) VALUES(?,?,?)',args:[MUSIC_SEARCH_VERSION+':US_UK:'+normalizeMusicSearch(title),JSON.stringify({works:[]}),Date.now()+60000]});
 await db.execute({sql:"INSERT OR REPLACE INTO music_search_control(id,value,next_at) VALUES('upstream','occupied',?)",args:[Date.now()+60000]});
 const found=await call('/api/music/search?'+new URLSearchParams({q:title,scope:'US_UK'}));
 assert.equal(found.source,'catalog');assert.ok(found.items.some(s=>s.id===wid&&s.performers.includes('Westlife')));
 const input=JSON.parse(fs.readFileSync('data/catalog-supplement/expansion.json','utf8'));
 const own=input.songs.find(s=>s.source?.provider==='Wikidata'&&!s.source.workId&&s.title.length>15&&s.title.length<60);
 assert.ok(own);
 const selected=(await call('/api/music/search?'+new URLSearchParams({q:own.title,scope:'US_UK'}))).items.find(s=>s.id===own.id);
 assert.ok(selected?.token,'Independent provider choice has a signed catalog token');
 const q={answerMode:'SEARCH',searchToken:selected.token,playMode:'OPEN',gameRound:1,topicKey:'t',prompt:'Bài nào?',listenSeconds:1,answerSeconds:30,bidSeconds:5,mediaType:'youtube',mediaUrl:'https://youtu.be/Q0000000000',mediaStart:0,primaryAnswer:selected.title,acceptedAnswers:[],artist:'',hint:'Gợi ý',revealMin:1,revealMax:3,revealStep:1};
 const quiz=await call('/api/quiz',{gameType:'MUSIC_DUEL',title:'Danh mục nhiều nguồn',musicScope:'US_UK',description:'',visibility:'unlisted',topics:[{key:'t',gameRound:1,title:'Chủ đề',songCount:1}],questions:[q]});
 const saved=await call('/api/quiz?id='+quiz.id);assert.equal(saved.questions[0].musicbrainz_work_id,own.id);
 const room=await call('/api/room',{action:'create',quizId:quiz.id,nickname:'Catalog smoke'});
 await call('/api/command',{roomId:room.roomId,action:'start'},room.hostToken);
 for(let i=0;i<2;i++){
  await db.execute({sql:'UPDATE rooms SET phase_ends_at=? WHERE id=?',args:[Date.now()-1,room.roomId]});
  await call('/api/state?roomId='+room.roomId,undefined,room.hostToken);
 }
 const result=await call('/api/command',{roomId:room.roomId,action:'answer',value:selected.token},room.hostToken);
 assert.equal(result.myAnswerCorrect,true);
 console.log(JSON.stringify({pass:true,knownHitFoundDespiteNegativeCache:true,source:found.source,independentChoice:own.title,savedCatalogId:own.id,answerCorrect:true}));
}finally{db.close();}
