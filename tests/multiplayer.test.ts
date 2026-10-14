import test from 'node:test';import assert from 'node:assert/strict';
import {bidStage,bidWindow,choicesForPlayer,MAX_PLAYERS} from '../src/lib/multiplayer.ts';
test('50 seats and bid windows share a start, keep equal answer durations and reject early/late stages',()=>{
 assert.equal(MAX_PLAYERS,50);const one=bidWindow(1000,1,12),ten=bidWindow(1000,10,12);
 assert.equal(one.mediaStartsAt,ten.mediaStartsAt);assert.equal(one.answerEndsAt-one.listenEndsAt,12000);assert.equal(ten.answerEndsAt-ten.listenEndsAt,12000);
 assert.equal(bidStage(1000,1,12,5999).stage,'PREPARE');assert.equal(bidStage(1000,1,12,6000).stage,'LISTEN');assert.equal(bidStage(1000,1,12,7000).stage,'ANSWER');assert.equal(bidStage(1000,1,12,19000).stage,'WAIT');
});
test('choice order is stable for reconnects and varied across 50 players without leaking correctness',()=>{
 const options=Array.from({length:4},(_,i)=>({id:`random-${i}`,label:`Answer ${i}`}));const orders=new Set();
 for(let i=0;i<50;i++){const result=choicesForPlayer(options,`player-${i}`);assert.deepEqual(result,choicesForPlayer(options,`player-${i}`));assert.equal(new Set(result.map(c=>c.id)).size,4);assert.ok(result.every(c=>Object.keys(c).sort().join(',')==='id,label'));orders.add(result.map(c=>c.id).join(','));}
 assert.ok(orders.size>1);
});
