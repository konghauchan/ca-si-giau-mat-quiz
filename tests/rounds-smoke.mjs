import assert from 'node:assert/strict';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { registerTestAccount } from './register-test-account.mjs';

// Run only against an isolated local database. Deadline acceleration never
// touches a shared database or a real player's room.
assert.ok(process.env.DATABASE_PATH?.includes('rounds-smoke'));
assert.ok(!process.env.TURSO_DATABASE_URL);
const base = process.env.SMOKE_BASE_URL || 'http://localhost:3210';
assert.match(base, /^http:\/\/localhost:/);
const db = createClient({url:`file:${path.resolve(process.env.DATABASE_PATH)}`});
const cookie = await registerTestAccount(base);
async function call(endpoint, body, token='', account=false) {
  const response=await fetch(base+endpoint,{method:body?'POST':'GET',headers:{origin:base,'content-type':'application/json','x-game-token':token,...(account?{cookie}:{})},body:body?JSON.stringify(body):undefined});
  const result=await response.json();if(!response.ok)throw new Error(JSON.stringify(result));return result;
}
const modes=['BID','CLUE','OPEN','CLUE','OPEN'];
const questions=modes.map((playMode,i)=>({playMode,gameRound:i+1,topicKey:`t${i}`,prompt:'Bài hát nào?',listenSeconds:5,answerSeconds:12,bidSeconds:8,mediaType:'youtube',mediaUrl:playMode==='CLUE'?'':`https://youtu.be/Q${String(i).padStart(10,'0')}`,mediaStart:0,resultStart:null,resultSeconds:null,primaryAnswer:`Bài ${i+1}`,acceptedAnswers:[],artist:'Nghệ sĩ',hint:'Gợi ý đấu giá',revealMin:1,revealMax:10,revealStep:1,clues:playMode==='CLUE'?Array.from({length:6},(_,j)=>({id:`c${j}`,text:`Gợi ý ${j}`,score:600-j*100,category:'OTHER'})):[]}));
const payload={gameType:'MUSIC_DUEL',title:'Đọ nhạc nhiều vòng',description:'Kiểm tra luật riêng từng vòng',visibility:'unlisted',topics:modes.map((_,i)=>({key:`t${i}`,gameRound:i+1,title:`Chủ đề ${i+1}`,songCount:1})),questions};
const quiz=await call('/api/quiz',payload,'',true);
const saved=await call(`/api/quiz?id=${quiz.id}`,null,'',true);
assert.deepEqual(saved.questions.map(q=>q.type),['music_bid','song_clue','music_open','song_clue','music_open']);
assert.equal(saved.roundCount,5);
assert.deepEqual((await call(`/api/quiz?id=${quiz.id}`)).rounds.map(r=>r.playMode),modes);
// A single round is valid; numbering gaps and mixed rules in one round are not.
await call('/api/quiz',{...payload,topics:[payload.topics[0]],questions:[questions[0]]},'',true);
await assert.rejects(call('/api/quiz',{...payload,topics:[payload.topics[1]],questions:[questions[1]]},'',true),/gameRound/);
await assert.rejects(call('/api/quiz',{...payload,topics:[{...payload.topics[0],songCount:2}],questions:[questions[0],{...questions[2],gameRound:1,topicKey:'t0'}]},'',true),/playMode/);
await assert.rejects(call('/api/quiz',{...payload,questions:questions.map(q=>q.playMode==='CLUE'?{...q,clues:q.clues.slice(0,5)}:q)},'',true),/clues/);
const room=await call('/api/room',{action:'create',quizId:quiz.id,nickname:'Host'});
const tokens=[room.hostToken];
for(const nickname of ['Alex','Blake','Casey'])tokens.push((await call('/api/room',{action:'join',pin:room.pin,nickname})).playerToken);
const state=(token=tokens[0])=>call(`/api/state?roomId=${room.roomId}`,null,token);
const command=(action,value,token=tokens[0])=>call('/api/command',{roomId:room.roomId,action,value},token);
async function expire() {
  const result=await db.execute({sql:'SELECT * FROM rooms WHERE id=?',args:[room.roomId]});const r=result.rows[0];
  const at=Date.now()-1;const clue=JSON.parse(r.clue_state||'{}');
  if(String(r.phase).startsWith('CLUE_')||r.phase==='QUESTION_INTRO'){clue.endsAt=at;clue.startedAt=at-1000;}
  await db.execute({sql:'UPDATE rooms SET phase_ends_at=?,clue_state=? WHERE id=?',args:[at,JSON.stringify(clue),room.roomId]});
  return state();
}
async function nextRound() {assert.equal((await expire()).phase,'SCOREBOARD');await command('nextQuestion');assert.equal((await state()).phase,'TOPIC_INTRO');await expire();}
await command('start');await expire();assert.equal((await state()).phase,'BIDDING');
for(const token of tokens)await command('bid',1,token);
await expire();assert.equal((await state()).phase,'MEDIA_PLAYING');await expire();
await command('answer','Sai',tokens[1]);await assert.rejects(command('answer','Bài 1',tokens[1]),/một lần/);
for(const token of [tokens[0],tokens[2],tokens[3]])await command('answer','Bài 1',token);
assert.equal((await state()).phase,'ROUND_RESULT');await nextRound();await expire();
assert.equal((await state()).phase,'CLUE_ACTIVE');assert.equal((await state()).gameRound,2);
await command('pause');assert.notEqual((await state()).pausedAt,null);
await assert.rejects(command('buzz',undefined,tokens[1]),/tạm dừng/);await command('resume');
await command('buzz',undefined,tokens[1]);await command('answer','Sai',tokens[1]);await expire();
assert.equal((await state(tokens[1])).clue.eliminated,true);
await assert.rejects(command('buzz',undefined,tokens[1]),/không thể/);
await command('buzz',undefined,tokens[2]);await command('answer','Bài 2',tokens[2]);
assert.equal((await state()).phase,'CLUE_RESULT');await nextRound();
assert.equal((await state()).phase,'OPEN_MEDIA_PLAYING');await expire();
await command('answer','Sai',tokens[1]);assert.equal((await state(tokens[1])).myAnswerCorrect,false);
for(const token of tokens)await command('answer','Bài 3',token);
assert.equal((await state()).phase,'ROUND_RESULT');await nextRound();await expire();
assert.equal((await state(tokens[1])).clue.eliminated,false);
assert.equal((await state()).gameRound,4);
for(let i=0;i<5;i++)await expire();
for(const token of tokens){const sixth=await state(token);assert.equal(sixth.clue.index,5);assert.equal(sixth.clue.items.length,6);assert.equal(sixth.clue.scores.length,6);assert.equal(sixth.question.primaryAnswer,undefined);}
await command('buzz',undefined,tokens[1]);await command('answer','Bài 4',tokens[1]);await nextRound();
assert.equal((await state()).playMode,'OPEN');assert.equal((await state()).gameRound,5);
await expire();for(const token of tokens)await command('answer','Bài 5',token);
assert.equal((await expire()).phase,'SCOREBOARD');await command('nextQuestion');
const finished=await state();assert.equal(finished.phase,'GAME_FINISHED');assert.equal(finished.players.length,4);assert.ok(finished.players.every(p=>p.score>0));
console.log('PASS: five rounds BID → CLUE → OPEN → CLUE → OPEN, four players, retry rules, pause, reset, ranking, persistence and validation.');
db.close();
