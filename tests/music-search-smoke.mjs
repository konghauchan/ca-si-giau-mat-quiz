import assert from 'node:assert/strict';
import path from 'node:path';
import {MUSIC_SEARCH_VERSION,MUSIC_CATALOG_VERSION,MUSIC_CATALOG_PAGE_SIZE,musicBrainzArtistQuery,musicBrainzRecordingQuery,musicBrainzQuery} from '../src/lib/musicSearch.ts';
import {createClient} from '@libsql/client';
import {musicMetadataCacheKey} from '../src/lib/musicProvider.ts';
import {registerTestAccount} from './register-test-account.mjs';
assert.ok(process.env.DATABASE_PATH?.includes('rounds-smoke'));assert.ok(!process.env.TURSO_DATABASE_URL);
const base=process.env.SMOKE_BASE_URL||'http://localhost:3219';assert.match(base,/^http:\/\/localhost:/);
const db=createClient({url:'file:'+path.resolve(process.env.DATABASE_PATH)});const cookie=await registerTestAccount(base);
async function request(endpoint,body,token='',account=false){const res=await fetch(base+endpoint,{method:body?'POST':'GET',headers:{origin:base,'content-type':'application/json',...(token?{'x-game-token':token}:{}),...(account?{cookie}:{})},body:body?JSON.stringify(body):undefined});const data=await res.json();return {status:res.status,data};}
async function call(endpoint,body,token='',account=false){const result=await request(endpoint,body,token,account);assert.equal(result.status,200,JSON.stringify(result));return result.data;}
async function allCatalogPages(scope,token='',account=false,roomId=''){
  let offset=0;const items=[];let total=0,pages=0;
  do {
    const page=await call('/api/music/catalog?'+new URLSearchParams({scope,offset:String(offset),...(roomId?{roomId}:{})}),undefined,token,account);
    assert.equal(page.scope,scope);assert.ok(page.items.length<=MUSIC_CATALOG_PAGE_SIZE);assert.ok(Buffer.byteLength(JSON.stringify(page))<3.1*1024*1024);
    assert.ok(page.items.every(item=>item.scope===scope&&item.token&&!('source' in item)));
    items.push(...page.items);total=page.total;pages++;
    if(page.nextOffset===null)break;
    assert.ok(page.nextOffset>offset);offset=page.nextOffset;
  }while(pages<31);
  assert.equal(items.length,total);assert.equal(new Set(items.map(song=>song.id)).size,total);
  return items;
}
// Initialize the additive schema without touching production.
await call('/api/quiz',undefined,'',true);
const viet=[{id:'00000000-0000-4000-8000-000000000001',title:'Bài thử tiếng Việt',detail:'Tác giả: Kiểm thử',scope:'VI'},{id:'00000000-0000-4000-8000-000000000002',title:'Bài thử tiếng Việt',detail:'Bài trùng tên khác tác giả',scope:'VI'}];
const english=[{id:'00000000-0000-4000-8000-000000000003',title:'English test song',detail:'Test work',scope:'US_UK'}];
for(const [scope,items] of [['VI',viet],['US_UK',english]])await db.execute({sql:'INSERT OR REPLACE INTO music_search_cache(id,payload,expires_at) VALUES(?,?,?)',args:[MUSIC_SEARCH_VERSION+':'+scope+':fixture',JSON.stringify(items),Date.now()+60000]});
assert.notEqual((await request('/api/music/search?q=fixture&scope=VI')).status,200);
for(const song of [...viet,...english])await db.execute({sql:'INSERT OR REPLACE INTO music_catalog(scope,id,title,detail,normalized_title,updated_at) VALUES(?,?,?,?,?,?)',args:[MUSIC_CATALOG_VERSION+':'+song.scope,song.id,song.title,JSON.stringify({detail:song.detail,performers:['Test artist']}),song.title.toLowerCase()+' test artist',Date.now()]});
assert.notEqual((await request('/api/music/catalog?scope=VI')).status,200);
const creatorCatalog=await call('/api/music/catalog?scope=VI',undefined,'',true);assert.equal(creatorCatalog.scope,'VI');assert.ok(creatorCatalog.items.every(item=>item.scope==='VI'&&item.token));
assert.equal((await request('/api/music/catalog?scope=VI&offset=-1',undefined,'',true)).status,400);
assert.equal((await request('/api/music/catalog?scope=VI&limit=4001',undefined,'',true)).status,400);
const completeVietnamese=await allCatalogPages('VI','',true);
const completeEnglish=await allCatalogPages('US_UK','',true);
assert.ok(completeVietnamese.length+completeEnglish.length>=20000,'entire imported catalog is available without truncation');

// Another instance is using the provider: return pending work, never a 429 or empty success.
await db.execute({sql:"INSERT OR REPLACE INTO music_search_control(id,value,next_at) VALUES('upstream',?,?)",args:['other-instance',Date.now()+45000]});
const waiting=await request('/api/music/search?q=uncached-test-artist&scope=US_UK',undefined,'',true);
assert.equal(waiting.status,202);assert.equal(waiting.data.pending,true);assert.equal(waiting.data.items,undefined);assert.ok(waiting.data.retryAfter>=1);
await db.execute({sql:"UPDATE music_search_control SET next_at=0 WHERE id='upstream'",args:[]});

// A partial title in the catalog must not suppress an exact artist lookup.
const artistId='10000000-0000-4000-8000-000000000001',recordingId='10000000-0000-4000-8000-000000000002',workId='10000000-0000-4000-8000-000000000003';
await db.execute({sql:'INSERT OR REPLACE INTO music_catalog(scope,id,title,detail,normalized_title,updated_at) VALUES(?,?,?,?,?,?)',args:[MUSIC_CATALOG_VERSION+':US_UK','10000000-0000-4000-8000-000000000004','Cacheband of My Heart',JSON.stringify({detail:'',performers:['Westlife']}),'cacheband of my heart westlife',Date.now()]});
async function metadata(entity,query,limit,payload){await db.execute({sql:'INSERT OR REPLACE INTO music_search_cache(id,payload,expires_at) VALUES(?,?,?)',args:[musicMetadataCacheKey(entity,query,limit),JSON.stringify(payload),Date.now()+60000]});}
await metadata('artist',musicBrainzArtistQuery('Cacheband'),5,{artists:[{id:artistId,name:'Cacheband',score:100}]});
await metadata('recording',musicBrainzRecordingQuery('Cacheband',artistId),100,{recordings:[{id:recordingId,title:'Right band song','artist-credit':[{name:'Cacheband',artist:{id:artistId,name:'Cacheband'}}]}]});
await metadata('work',musicBrainzQuery('Cacheband','US_UK',[recordingId],true),30,{works:[{id:workId,title:'Right band song',language:'eng',relations:[{type:'performance',recording:{id:recordingId}}]}]});
await db.execute({sql:"UPDATE music_search_control SET value=?,next_at=? WHERE id='upstream'",args:['fixture-owner',Date.now()+45000]});
try{
 const corrected=await call('/api/music/search?q=Cacheband&scope=US_UK',undefined,'',true);
 assert.equal(corrected.items.length,1);assert.deepEqual(corrected.items[0].performers,['Cacheband']);assert.equal(corrected.items[0].id,workId);
}finally{await db.execute({sql:"UPDATE music_search_control SET next_at=0 WHERE id='upstream'",args:[]});}

const vi=(await call('/api/music/search?q=fixture&scope=VI',undefined,'',true)).items;const en=(await call('/api/music/search?q=fixture&scope=US_UK',undefined,'',true)).items;
assert.ok(vi.every(s=>s.scope==='VI'));assert.ok(en.every(s=>s.scope==='US_UK'));
const q={answerMode:'SEARCH',searchToken:vi[0].token,playMode:'OPEN',gameRound:1,topicKey:'t',prompt:'Bài nào?',listenSeconds:1,answerSeconds:30,bidSeconds:5,mediaType:'youtube',mediaUrl:'https://youtu.be/Q0000000000',mediaStart:0,primaryAnswer:vi[0].title,acceptedAnswers:[],artist:'',hint:'Gợi ý',revealMin:1,revealMax:3,revealStep:1};
const payload={gameType:'MUSIC_DUEL',title:'MusicBrainz test',musicScope:'VI',description:'',visibility:'unlisted',topics:[{key:'t',gameRound:1,title:'Chủ đề',songCount:1}],questions:[q]};
const invalid=await request('/api/quiz',{...payload,questions:[{...q,searchToken:en[0].token}]},'',true);assert.equal(invalid.status,400);assert.deepEqual(invalid.data.issues[0].path,['questions',0,'searchToken']);
const forged=await request('/api/quiz',{...payload,questions:[{...q,searchToken:vi[0].token+'x'}]},'',true);assert.equal(forged.status,400);
const quiz=await call('/api/quiz',payload,'',true);const saved=await call('/api/quiz?id='+quiz.id,undefined,'',true);assert.equal(saved.musicScope,'VI');assert.equal(saved.questions[0].search_token,vi[0].token);assert.equal(saved.questions[0].musicbrainz_work_id,vi[0].id);
const publicQuiz=await call('/api/quiz?id='+quiz.id);assert.equal(publicQuiz.questions,undefined);
const room=await call('/api/room',{action:'create',quizId:quiz.id,nickname:'Search host'});const joins=await Promise.all(Array.from({length:29},(_,i)=>call('/api/room',{action:'join',pin:room.pin,nickname:'Search '+i})));const tokens=[room.hostToken,...joins.map(j=>j.playerToken)];
const cmd=(action,value,token=tokens[0])=>call('/api/command',{roomId:room.roomId,action,value},token);
assert.equal((await request('/api/music/search?q=fixture&scope=US_UK&roomId='+room.roomId,undefined,tokens[0])).status,403);
const catalogs=await Promise.all(tokens.map(token=>call('/api/music/catalog?scope=US_UK&roomId='+room.roomId,undefined,token)));assert.ok(catalogs.every(result=>result.scope==='VI'&&result.items.every(item=>item.scope==='VI')));
const preloaded=completeVietnamese.find(item=>item.id===vi[0].id);assert.ok(preloaded);assert.equal((await request('/api/command',{roomId:room.roomId,action:'answer',value:preloaded.token},tokens[0])).status,400);

await cmd('start');for(let i=0;i<2;i++){await db.execute({sql:'UPDATE rooms SET phase_ends_at=? WHERE id=?',args:[Date.now()-1,room.roomId]});await call('/api/state?roomId='+room.roomId,undefined,tokens[0]);}
const searchResults=await Promise.all(tokens.map(token=>call('/api/music/search?q=fixture&scope=US_UK&roomId='+room.roomId,undefined,token)));
assert.ok(searchResults.every(r=>r.scope==='VI'&&r.items.length===2&&r.items.every(i=>i.scope==='VI')));
const snapshot=await call('/api/state?roomId='+room.roomId,undefined,tokens[0]);assert.equal(snapshot.question.musicScope,'VI');assert.equal(snapshot.question.musicbrainz_work_id,undefined);assert.equal(snapshot.question.primaryAnswer,undefined);assert.equal(snapshot.titleHint,null);
const plain=await request('/api/command',{roomId:room.roomId,action:'answer',value:vi[0].title},tokens[0]);assert.equal(plain.status,400);
const crossScope=await request('/api/command',{roomId:room.roomId,action:'answer',value:en[0].token},tokens[0]);assert.equal(crossScope.status,400);
const wrong=await cmd('answer',vi[1].token);assert.equal(wrong.myAnswerCorrect,false);const right=await cmd('answer',preloaded.token);assert.equal(right.myAnswerCorrect,true);assert.equal(right.myAttemptCount,2);
// Thirty English-scope players can find the reported artists even while the provider is occupied.
const eq=await call('/api/quiz',{...payload,musicScope:'US_UK',questions:[{...q,searchToken:en[0].token,primaryAnswer:en[0].title}]},'',true);
const er=await call('/api/room',{action:'create',quizId:eq.id,nickname:'English host'});
const ej=await Promise.all(Array.from({length:29},(_,i)=>call('/api/room',{action:'join',pin:er.pin,nickname:'English '+i})));
const et=[er.hostToken,...ej.map(player=>player.playerToken)];
const ec=await Promise.all(et.map(token=>call('/api/music/catalog?roomId='+er.roomId,undefined,token)));
assert.ok(ec.every(catalog=>catalog.scope==='US_UK'&&catalog.items.some(song=>song.performers?.includes('Justin Bieber'))&&catalog.items.some(song=>song.performers?.includes('Rihanna'))));
await call('/api/command',{roomId:er.roomId,action:'start'},er.hostToken);
for(let i=0;i<2;i++){await db.execute({sql:'UPDATE rooms SET phase_ends_at=? WHERE id=?',args:[Date.now()-1,er.roomId]});await call('/api/state?roomId='+er.roomId,undefined,er.hostToken);}
await db.execute({sql:"INSERT OR REPLACE INTO music_search_control(id,value,next_at) VALUES('upstream',?,?)",args:['occupied-test',Date.now()+45000]});
try{
  const selected=await Promise.all(et.map((token,i)=>call('/api/music/search?'+new URLSearchParams({q:i%2?'rihana':'justin bieber',roomId:er.roomId}),undefined,token)));
  assert.ok(selected.every(result=>result.source==='catalog'&&result.items.length===20&&result.items.every(song=>song.scope==='US_UK'&&song.token)));
  const submitted=await call('/api/command',{roomId:er.roomId,action:'answer',value:selected[0].items[0].token},et[0]);assert.equal(submitted.myAnswerCorrect,false);
  const correct=await call('/api/command',{roomId:er.roomId,action:'answer',value:en[0].token},et[0]);assert.equal(correct.myAnswerCorrect,true);
}finally{await db.execute({sql:"UPDATE music_search_control SET next_at=0 WHERE id='upstream'",args:[]});}
// Auction retains one answer, even when the selected song is wrong.
const bq=await call('/api/quiz',{...payload,questions:[{...q,playMode:'BID'}]},'',true);const br=await call('/api/room',{action:'create',quizId:bq.id,nickname:'Bid search'});const bc=(action,value)=>call('/api/command',{roomId:br.roomId,action,value},br.hostToken);await bc('start');await db.execute({sql:'UPDATE rooms SET phase_ends_at=? WHERE id=?',args:[Date.now()-1,br.roomId]});await call('/api/state?roomId='+br.roomId,undefined,br.hostToken);await bc('bid',1);await db.execute({sql:'UPDATE rooms SET phase_ends_at=? WHERE id=?',args:[Date.now()-1,br.roomId]});await call('/api/state?roomId='+br.roomId,undefined,br.hostToken);await db.execute({sql:'UPDATE rooms SET phase_started_at=?,phase_ends_at=? WHERE id=?',args:[Date.now()-6500,Date.now()+30000,br.roomId]});await bc('answer',vi[1].token);assert.equal((await request('/api/command',{roomId:br.roomId,action:'answer',value:vi[0].token},br.hostToken)).status,400);
// Buzzer winner can search and answer in clue mode.
const cq=await call('/api/quiz',{...payload,questions:[{...q,playMode:'CLUE',listenSeconds:15,clues:Array.from({length:6},(_,i)=>({id:'c'+i,text:'Gợi ý '+i,score:600-i*100,category:'OTHER'}))}]},'',true);const cr=await call('/api/room',{action:'create',quizId:cq.id,nickname:'Clue search'});await call('/api/command',{roomId:cr.roomId,action:'start'},cr.hostToken);await db.execute({sql:'UPDATE rooms SET phase_ends_at=? WHERE id=?',args:[Date.now()-1,cr.roomId]});await call('/api/state?roomId='+cr.roomId,undefined,cr.hostToken);const clueState=JSON.parse((await db.execute({sql:'SELECT clue_state FROM rooms WHERE id=?',args:[cr.roomId]})).rows[0].clue_state);clueState.endsAt=Date.now()-1;await db.execute({sql:'UPDATE rooms SET phase_ends_at=?,clue_state=? WHERE id=?',args:[clueState.endsAt,JSON.stringify(clueState),cr.roomId]});await call('/api/state?roomId='+cr.roomId,undefined,cr.hostToken);await call('/api/command',{roomId:cr.roomId,action:'buzz'},cr.hostToken);await call('/api/music/search?q=fixture&roomId='+cr.roomId,undefined,cr.hostToken);const done=await call('/api/command',{roomId:cr.roomId,action:'answer',value:vi[0].token},cr.hostToken);assert.equal(done.phase,'CLUE_RESULT');assert.ok(done.players[0].score>0);
console.log('PASS: 30 English players find Justin Bieber / rihana and submit signed catalog choices while provider is occupied; pending lookup returns 202; scope-safe MusicBrainz search and lobby catalog prefetch for 30 clients, authenticated creator binding/edit round-trip, no answer leakage, forged/plain/wrong-scope rejection, same-title different-work distinction, OPEN retry, BID single answer and CLUE buzzer/search/score.');db.close();
