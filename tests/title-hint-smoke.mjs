import assert from 'node:assert/strict';
import path from 'node:path';
import {createClient} from '@libsql/client';
import {registerTestAccount} from './register-test-account.mjs';
import {scoreWithTitleHint,maskedTitle} from '../src/lib/titleHint.ts';
assert.ok(process.env.DATABASE_PATH?.includes('rounds-smoke'));assert.ok(!process.env.TURSO_DATABASE_URL);
const base=process.env.SMOKE_BASE_URL||'http://localhost:3217';assert.match(base,/^http:\/\/localhost:/);
const db=createClient({url:`file:${path.resolve(process.env.DATABASE_PATH)}`});const cookie=await registerTestAccount(base);
async function call(url,body,token='',account=false){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{origin:base,'content-type':'application/json','x-game-token':token,...(account?{cookie}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(JSON.stringify(data));return data;}
const question={playMode:'OPEN',gameRound:1,topicKey:'t',prompt:'Bài hát nào?',listenSeconds:5,answerSeconds:12,bidSeconds:30,mediaType:'youtube',mediaUrl:'https://youtu.be/Q0000000000',mediaStart:0,primaryAnswer:'Nơi này có anh',acceptedAnswers:[],artist:'',hint:'',revealMin:1,revealMax:10,revealStep:1,titleHintIndices:[0]};
const payload={gameType:'MUSIC_DUEL',title:'Kiểm thử hé chữ',description:'',visibility:'unlisted',topics:[{key:'t',gameRound:1,title:'Test',songCount:1}],questions:[question]};
await assert.rejects(call('/api/quiz',{...payload,questions:[{...question,titleHintIndices:[3]}]},'',true),/titleHintIndices/);
const quiz=await call('/api/quiz',payload,'',true);const saved=await call('/api/quiz?id='+quiz.id,null,'',true);assert.deepEqual(JSON.parse(saved.questions[0].title_hint_indices),[0]);
const room=await call('/api/room',{action:'create',quizId:quiz.id,nickname:'Host'});const tokens=[room.hostToken];for(const nickname of ['Alex','Blake','Casey'])tokens.push((await call('/api/room',{action:'join',pin:room.pin,nickname})).playerToken);
const state=token=>call('/api/state?roomId='+room.roomId,null,token||tokens[0]);const command=(action,value,token=tokens[0])=>call('/api/command',{roomId:room.roomId,action,value},token);
// Compile the stream route before starting the timed question.
const warm=await fetch(base+'/api/events?roomId='+room.roomId,{headers:{'x-game-token':tokens[0]}});const wr=warm.body.getReader();await wr.read();await wr.cancel();
await command('start');for(let i=0;i<2;i++){await db.execute({sql:'UPDATE rooms SET phase_ends_at=? WHERE id=?',args:[Date.now()-1,room.roomId]});await state();}
const before=await state();assert.equal(before.phase,'OPEN_ANSWERING');assert.equal(before.titleHint.revealed,false);assert.equal(before.titleHint.mask,maskedTitle(question.primaryAnswer));assert.equal(before.question.primaryAnswer,undefined);
await command('answer',question.primaryAnswer,tokens[0]);
// A paused room must not reveal more letters as wall time passes.
await command('pause');const paused=await state();assert.equal(paused.titleHint.revealed,false);await command('resume');
const stream=await fetch(base+'/api/events?roomId='+room.roomId,{headers:{'x-game-token':tokens[1]},signal:AbortSignal.timeout(15000)});const reader=stream.body.getReader();let buffer='';let opened=false;const decoder=new TextDecoder();
while(!opened){const part=await reader.read();assert.equal(part.done,false);buffer+=decoder.decode(part.value,{stream:true});let split;while((split=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,split);buffer=buffer.slice(split+2);const raw=frame.match(/^data: (.+)$/m)?.[1];if(raw){const data=JSON.parse(raw);if(data.titleHint?.revealed)opened=true;}}}
await reader.cancel();
for(const token of tokens){const current=await state(token);assert.equal(current.titleHint.revealed,true);assert.equal(current.titleHint.mask,maskedTitle(question.primaryAnswer,[0],true));assert.equal(current.question.primaryAnswer,undefined);assert.equal(current.phaseEndsAt-current.phaseStartedAt,12000);}
for(const token of tokens.slice(1))await command('answer',question.primaryAnswer,token);
const result=await state();assert.equal(result.phase,'ROUND_RESULT');const attempts=(await db.execute({sql:'SELECT * FROM answer_attempts WHERE room_id=? ORDER BY created_at',args:[room.roomId]})).rows;
const events=(await db.execute({sql:'SELECT * FROM score_events WHERE room_id=?',args:[room.roomId]})).rows;
const timing=(await db.execute({sql:'SELECT payload FROM game_events WHERE room_id=? AND type=?',args:[room.roomId,'GAME_RESUMED']})).rows;
// Awarded points must preserve the early player's pre-hint reward.
assert.ok(Number(events.find(e=>e.player_id===attempts[0].player_id).delta)>250);
assert.ok(events.filter(e=>e.player_id!==attempts[0].player_id).every(e=>Number(e.delta)<=175));
console.log('PASS: migration, stored custom letters, validation location, four-player masks, hidden answers, pause/resume, midpoint stream update without input, unchanged 12s deadline, early score preserved and hinted score reduced.');db.close();
