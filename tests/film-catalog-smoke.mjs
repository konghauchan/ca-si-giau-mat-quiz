import assert from 'node:assert/strict';
import path from 'node:path';
import {createClient} from '@libsql/client';
import {registerTestAccount} from './register-test-account.mjs';
import {indexFilms,matchFilms} from '../src/lib/filmCatalog.ts';
assert.ok(process.env.DATABASE_PATH?.includes('rounds-smoke'));assert.ok(!process.env.TURSO_DATABASE_URL);
const base=process.env.SMOKE_BASE_URL||'http://localhost:3222';assert.match(base,/^http:\/\/localhost:/);
const db=createClient({url:'file:'+path.resolve(process.env.DATABASE_PATH)});
let cookie='';
async function call(endpoint,body,token='',status=200){const response=await fetch(base+endpoint,{method:body?'POST':'GET',headers:{origin:base,cookie,'content-type':'application/json','x-game-token':token},body:body?JSON.stringify(body):undefined});const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;}
try{
  await call('/api/films/catalog',null,'',401);
  cookie=await registerTestAccount(base);
  const films=[];let version='',offset=0;
  do{const page=await call('/api/films/catalog?offset='+offset+(version?'&version='+version:''));version=page.version;films.push(...page.items);offset=page.nextOffset;}while(offset!==null);
  assert.ok(films.length>7000);assert.ok(films.some(f=>f.kind==='SERIES'));assert.ok(films.some(f=>f.countries.includes('Q881')));
  await call('/api/films/catalog?version=wrong',null,'',409);
  const index=indexFilms(films),correct=films.find(f=>f.title==='Titanic'&&f.year===1997&&f.kind==='MOVIE'),wrong=films.find(f=>f.title==='Titanic'&&f.year===1953&&f.kind==='MOVIE');
  assert.ok(correct&&wrong);assert.notEqual(correct.id,wrong.id);assert.ok(matchFilms(index,'tita').some(f=>f.id===correct.id));assert.ok(matchFilms(index,'Leonardo').length>0);
  async function setup(mode){
    const q={answerMode:'SEARCH',searchToken:correct.token,playMode:mode,gameRound:1,topicKey:'t',prompt:'Đây là phim nào?',listenSeconds:5,answerSeconds:60,bidSeconds:30,mediaType:'youtube',mediaUrl:mode==='CLUE'?'':'https://youtu.be/Q0000000000',mediaStart:0,primaryAnswer:correct.title,acceptedAnswers:[],artist:'James Cameron',hint:'Một chuyến hải trình',revealMin:1,revealMax:3,revealStep:1,clues:mode==='CLUE'?Array.from({length:6},(_,i)=>({id:'c'+i,text:'Gợi ý '+(i+1),score:600-i*100,category:'OTHER'})):[]};
    const payload={gameType:'FILM_DUEL',title:'Kiểm tra danh mục phim '+mode,description:'',visibility:'unlisted',topics:[{key:'t',gameRound:1,title:'Phim',songCount:1}],questions:[q]};
    const quiz=await call('/api/quiz',payload),saved=await call('/api/quiz?id='+quiz.id);assert.equal(saved.questions[0].film_catalog_id,correct.id);assert.equal(saved.questions[0].musicbrainz_work_id,null);assert.ok(saved.questions[0].search_token);
    const song=(await call('/api/music/search?scope=US_UK&q=Bohemian%20Rhapsody')).items[0];assert.ok(song?.token);
    const rejected=await call('/api/quiz',{...payload,questions:[{...q,searchToken:song.token,primaryAnswer:song.title}]},'',400);assert.ok(rejected.issues?.some(issue=>issue.path.includes('searchToken')));
    const room=await call('/api/room',{action:'create',quizId:quiz.id,nickname:'Film host'}),guest=await call('/api/room',{action:'join',pin:room.pin,nickname:'Film guest'});
    await call('/api/films/catalog?roomId='+room.roomId,null,'invalid',403);const publicPage=await call('/api/films/catalog?roomId='+room.roomId,null,guest.playerToken);assert.ok(publicPage.items.length>0);assert.equal(publicPage.correctId,undefined);
    await call('/api/command',{roomId:room.roomId,action:'start'},room.hostToken);return {room,guest};
  }
  const state=room=>call('/api/state?roomId='+room.roomId,null,room.hostToken);
  const command=(room,action,value,token=room.hostToken,status=200)=>call('/api/command',{roomId:room.roomId,action,value,receiptOnly:true},token,status);
  async function expire(room){const row=(await db.execute({sql:'SELECT * FROM rooms WHERE id=?',args:[room.roomId]})).rows[0],clue=JSON.parse(row.clue_state||'{}');if(row.phase==='QUESTION_INTRO'||String(row.phase).startsWith('CLUE_')){clue.endsAt=Date.now()-1;clue.startedAt=Date.now()-1000;}await db.execute({sql:'UPDATE rooms SET phase_ends_at=?,clue_state=? WHERE id=?',args:[Date.now()-1,JSON.stringify(clue),room.roomId]});return state(room);}
  for(const mode of ['OPEN','BID','CLUE']){
    const {room,guest}=await setup(mode);let s=await expire(room);
    if(mode==='OPEN'){
      assert.equal(s.phase,'OPEN_MEDIA_PLAYING');s=await expire(room);assert.equal(s.phase,'OPEN_ANSWERING');
      s=await command(room,'answer',wrong.token);assert.equal(s.myAnswerCorrect,false,'same title, different film is wrong');
      s=await command(room,'answer',correct.token);assert.equal(s.myAnswerCorrect,true,'retry can select same title with the correct film ID');await command(room,'answer',correct.token,guest.playerToken);
    }else if(mode==='BID'){
      await command(room,'bid',1);await command(room,'bid',3,guest.playerToken);s=await state(room);assert.equal(s.phase,'BID_REVEAL');s=await expire(room);assert.equal(s.phase,'MEDIA_PLAYING');
      await command(room,'answer',correct.token,room.hostToken,400);
      await db.execute({sql:'UPDATE rooms SET phase_started_at=? WHERE id=?',args:[Date.now()-9000,room.roomId]});
      s=await command(room,'answer',wrong.token);assert.equal(s.myAnswerCorrect,false);await command(room,'answer',correct.token,room.hostToken,400);await command(room,'answer',correct.token,guest.playerToken);
    }else{
      if(s.phase==='QUESTION_INTRO')s=await expire(room);assert.equal(s.phase,'CLUE_ACTIVE');await command(room,'buzz');s=await command(room,'answer',wrong.token);assert.equal(s.clue.outcome,'wrong');
      s=await expire(room);await command(room,'buzz',undefined,guest.playerToken);s=await command(room,'answer',correct.token,guest.playerToken);assert.equal(s.clue.outcome,'correct');
    }
  }
  console.log(JSON.stringify({pass:true,count:films.length,version,modes:['OPEN','BID','CLUE'],remakeIdsDistinct:true,musicTokenRejected:true}));
}finally{db.close();}
