import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const base = process.env.PERF_BASE_URL || 'http://localhost:3210';
const timings={};
async function call(label,path,body,token='') { const start=performance.now(); const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-game-token':token},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)}); const data=await r.json(); assert.ok(r.ok,JSON.stringify(data)); (timings[label]??=[]).push(performance.now()-start); return data; }
const q={prompt:'Bài gì?',gameRound:1,topicKey:'a',listenSeconds:1,answerSeconds:5,mediaType:'youtube',mediaUrl:'https://youtu.be/jNQXAC9IVRw',mediaStart:0,primaryAnswer:'Một bài',acceptedAnswers:[],artist:'',hint:'Gợi ý',revealMin:1,revealMax:10,revealStep:1};
const quiz=await call('save','/api/quiz',{title:'Performance fixture',description:'',visibility:'unlisted',topics:[{key:'a',gameRound:1,title:'Một',songCount:1},{key:'b',gameRound:2,title:'Hai',songCount:1}],questions:[q,{...q,gameRound:2,topicKey:'b',primaryAnswer:'Hai bài',mediaUrl:'https://youtu.be/dQw4w9WgXcQ'}]});
const room=await call('create','/api/room',{action:'create',quizId:quiz.id,nickname:'Host'});
const others=await Promise.all(['Alpha','Beta','Gamma'].map(nickname=>call('join','/api/room',{action:'join',pin:room.pin,nickname})));
const tokens=[room.hostToken,...others.map(p=>p.playerToken)];
for(let i=0;i<Number(process.env.PERF_ROUNDS||10);i++) await Promise.all(tokens.map(t=>call('state4','/api/state?roomId='+room.roomId,null,t)));
await call('start','/api/command',{roomId:room.roomId,action:'start'},room.hostToken);
const report=Object.fromEntries(Object.entries(timings).map(([key,values])=>{values.sort((a,b)=>a-b);return[key,{count:values.length,p50:Math.round(values[Math.floor(values.length*.5)]),p95:Math.round(values[Math.min(values.length-1,Math.floor(values.length*.95))])}]}));
console.log(report);writeFileSync(process.env.PERF_OUTPUT||'data/performance-before.json',JSON.stringify(report,null,2));
