import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedRead,invalidateRead} from '../src/lib/sharedRead.ts';
import {gameErrorStatus} from '../src/lib/gameErrors.ts';
test('30 readers share in-flight room work; results are not cached',async()=>{
 let reads=0;const read=async()=>{reads++;await new Promise(r=>setTimeout(r,5));return reads;};
 assert.deepEqual(await Promise.all(Array.from({length:30},()=>sharedRead('room-a',read))),Array(30).fill(1));
 assert.equal(await sharedRead('room-a',read),2);
});
test('a write invalidates older reads, and old completion cannot clear newer work',async()=>{
 let finishOld!:(n:number)=>void,finishNew!:(n:number)=>void;
 const old=sharedRead('room-b',()=>new Promise<number>(r=>{finishOld=r;}));await Promise.resolve();
 invalidateRead('room-b');const next=sharedRead('room-b',()=>new Promise<number>(r=>{finishNew=r;}));await Promise.resolve();
 finishOld(1);await old;assert.equal(sharedRead('room-b',async()=>99),next);finishNew(2);assert.equal(await next,2);
});
test('failed reads can retry and database errors are not authentication failures',async()=>{
 await assert.rejects(sharedRead('room-c',async()=>{throw Error('DB unavailable');}));
 assert.equal(await sharedRead('room-c',async()=>3),3);
 assert.equal(gameErrorStatus(Error('SQLITE_BUSY')),503);assert.equal(gameErrorStatus(Error('Phiên người chơi không hợp lệ.')),401);
});
