import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { clueFixture } from '../scripts/clue-fixture.mjs';
import { registerTestAccount } from './register-test-account.mjs';
const base=process.env.SMOKE_BASE_URL||'http://localhost:3210';
if(!/^http:\/\/localhost:\d+$/.test(base))throw new Error('Clue smoke clock acceleration is local only.');
const accountCookie=await registerTestAccount(base);
const timings={};const samples=[];
async function call(path,body,token='',allowError=false){const t=performance.now();const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',origin:base,'x-game-token':token,...(path==='/api/quiz'||body?.action==='create'?{cookie:accountCookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const data=await r.json();const key=body?.action||path.split('?')[0];(timings[key]??=[]).push(performance.now()-t);samples.push({action:key,serverTiming:r.headers.get('server-timing')});if(!r.ok&&!allowError)throw new Error(JSON.stringify(data));return {ok:r.ok,data};}
const quiz=(await call('/api/quiz',clueFixture)).data;const room=(await call('/api/room',{action:'create',quizId:quiz.id,nickname:'Alpha'})).data;
const joined=await Promise.all(['Beta','Gamma','Delta'].map(nickname=>call('/api/room',{action:'join',pin:room.pin,nickname,clientToken:crypto.randomUUID()})));
const tokens=[room.hostToken,...joined.map(p=>p.data.playerToken)];
const db=createClient({url:`file:${path.resolve(process.env.DATABASE_PATH||'./data/performance-after.sqlite')}`});
const state=async i=>(await call('/api/state?roomId='+room.roomId,null,tokens[i])).data;
const cmd=(i,action,value,allowError=false)=>call('/api/command',{roomId:room.roomId,action,value},tokens[i],allowError);
async function expire(){const row=(await db.execute({sql:'SELECT clue_state FROM rooms WHERE id=?',args:[room.roomId]})).rows[0];const s=JSON.parse(row.clue_state);assert.notEqual(s.endsAt,null);s.endsAt=Date.now()-1;for(let attempt=0;;attempt++){try{await db.execute({sql:'UPDATE rooms SET clue_state=?,phase_ends_at=? WHERE id=?',args:[JSON.stringify(s),s.endsAt,room.roomId]});break;}catch(error){if(error.code!=='SQLITE_BUSY'||attempt>=100)throw error;await new Promise(resolve=>setTimeout(resolve,25));}}}
const latest=Array(4).fill(null);const controllers=tokens.map(()=>new AbortController());
const streams=tokens.map(async(token,i)=>{const response=await fetch(base+'/api/events?roomId='+room.roomId,{headers:{'x-game-token':token},signal:controllers[i].signal});assert.equal(response.status,200);const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';try{while(true){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});let pos;while((pos=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,pos);buffer=buffer.slice(pos+2);const event=frame.match(/^event: (.+)$/m)?.[1];const raw=frame.match(/^data: (.+)$/m)?.[1];if(raw){const data=JSON.parse(raw);latest[i]=event==='state'?data:{...latest[i],...data};}}}}catch(e){if(!controllers[i].signal.aborted)throw e;}});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function sync(predicate){const start=performance.now();while(!latest.every(s=>s&&predicate(s))){if(performance.now()-start>6000)throw new Error('Realtime did not converge: '+JSON.stringify(latest.map(s=>({phase:s?.phase,version:s?.lastEventId}))));await sleep(10);}return performance.now()-start;}
await sync(s=>s.phase==='LOBBY');assert.equal((await state(0)).players.length,4);
await Promise.all(tokens.map((_,i)=>cmd(i,'ready')));
assert.equal((await state(1)).phase,'QUESTION_INTRO');await expire();const active=await state(2);assert.equal(active.phase,'CLUE_ACTIVE');assert.equal(active.question.primaryAnswer,undefined);assert.equal(active.clue.items.length,1);assert.equal(active.question.mediaUrl,undefined);
const propagationStart=performance.now();const claims=await Promise.all(tokens.map((_,i)=>cmd(i,'buzz',undefined,true)));assert.equal(claims.filter(r=>r.ok).length,1);const winner=claims.findIndex(r=>r.ok);const holding=await state(winner);assert.equal(holding.phase,'CLUE_ANSWERING');await sync(s=>s.clue.holder===holding.me.id&&s.phase==='CLUE_ANSWERING');const buzzerPropagation=performance.now()-propagationStart;
await cmd(winner,'answer','Sai');const wrong=await state(winner);assert.equal(wrong.clue.eliminated,true);assert.equal(wrong.phase,'CLUE_FEEDBACK');await expire();assert.equal((await state((winner+1)%4)).clue.index,1);await assert.rejects(cmd(winner,'buzz'),/không thể giành quyền/);
const eligible=tokens.map((_,i)=>i).filter(i=>i!==winner);for(const i of eligible)await cmd(i,'nextClue');const voted=await state(eligible[0]);assert.equal(voted.clue.index,2);assert.equal(voted.clue.votes,0);
const c=eligible[1];await cmd(c,'buzz');const answers=await Promise.all([cmd(c,'answer','NOI NAY CO ANH',true),cmd(c,'answer','nnca',true)]);assert.equal(answers.filter(r=>r.ok).length,1);const result=await state(c);assert.equal(result.phase,'CLUE_RESULT');assert.equal(result.players.find(p=>p.id===result.me.id).score,600);assert.equal(result.question.primaryAnswer,'Nơi Này Có Anh');assert.equal((await db.execute({sql:"SELECT COUNT(*) AS n FROM score_events WHERE room_id=? AND reason='CLUE_CORRECT'",args:[room.roomId]})).rows[0].n,1);
await sync(s=>s.phase==='CLUE_RESULT');for(const s of latest)assert.equal(s.players.find(p=>p.id===result.me.id).score,600);
await expire();const q2=await state(1);assert.equal(q2.questionIndex,1);assert.ok(q2.players.every(p=>!p.eliminated));await expire();await state(1);await cmd(1,'buzz');await expire();const timed=await state(2);assert.equal(timed.clue.outcome,'timeout');assert.equal(timed.players.find(p=>p.id===q2.me.id).eliminated,true);await assert.rejects(cmd(1,'answer','Bông Hoa Đẹp Nhất'),/không có quyền/);
await expire();await state(2);
// Reach clue 5 by server deadlines, then reveal and move automatically.
for(let i=0;i<4;i++){await expire();await state(2);}assert.equal((await state(2)).phase,'CLUE_RESULT');await expire();await state(3);await expire();await state(3);
// Reconnect while host is absent: player-only reads keep engine authoritative.
const reconnect=await state(3);assert.equal(reconnect.questionIndex,2);assert.equal(reconnect.phase,'CLUE_ACTIVE');assert.equal(reconnect.clue.index,0);
const race=await Promise.all([cmd(2,'buzz',undefined,true),cmd(3,'buzz',undefined,true)]);assert.equal(race.filter(r=>r.ok).length,1);const finalWinner=race[0].ok?2:3;await cmd(finalWinner,'answer','mot nha');await expire();const final=await state(3);assert.equal(final.phase,'GAME_FINISHED');assert.equal(final.players[0].score>=1000,true);assert.ok(final.players.every(p=>p.rank===final.players.filter(other=>other.score>p.score).length+1));
controllers.forEach(c=>c.abort());await Promise.all(streams);db.close();
const report=Object.fromEntries(Object.entries(timings).map(([k,v])=>{v.sort((a,b)=>a-b);return[k,{count:v.length,p50:Math.round(v[Math.floor(v.length*.5)]),p95:Math.round(v[Math.min(v.length-1,Math.floor(v.length*.95))])}]}));
writeFileSync('data/clue-performance.json',JSON.stringify({report,buzzerPropagationMs:Math.round(buzzerPropagation),samples},null,2));
console.log('Clue smoke passed: 4 clients, SSE convergence, simultaneous buzz, vote, wrong elimination, duplicate submission, score once, deadlines, reconnect, no host, final ranking.');console.log(report,'buzzer propagation',Math.round(buzzerPropagation)+'ms');
