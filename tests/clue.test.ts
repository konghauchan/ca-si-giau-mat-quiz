import test from 'node:test';
import assert from 'node:assert/strict';
import { answerMatches } from '../src/lib/core.ts';
import { answerClue, catchUpClue, claimBuzzer, clueInitial, expireClue, ranks, requiredVotes, startClueQuestion, voteClue } from '../src/lib/clueRules.ts';
const questions=Array.from({length:3},()=>({clueSeconds:10,answerSeconds:8,clues:[1000,800,600,400,200].map((score,i)=>({id:String(i),text:'Gợi ý',score,category:'OTHER' as const}))}));
const players=['a','b','c','d'];
const active=()=>expireClue(startClueQuestion(clueInitial(0),0),questions,players,2000);
test('Vietnamese normalization and aliases',()=>{for(const text of ['Nơi này có anh','noi nay co anh','NOI NAY CO ANH','  nơi này có anh!!  '])assert.ok(answerMatches(text,['Nơi Này Có Anh']));assert.ok(answerMatches('nnca',['Nơi Này Có Anh','NNCA']));assert.equal(answerMatches('Một Nhà',['Nơi Này Có Anh']),false);});
test('buzzer permits one holder and snapshots current clue score',()=>{const s=claimBuzzer(active(),questions[0],'a',2001);assert.equal(s.holder,'a');assert.equal(s.lockedScore,1000);assert.throws(()=>claimBuzzer(s,questions[0],'b',2002));});
test('wrong answer eliminates only this question and next question resets it',()=>{let s=answerClue(claimBuzzer(active(),questions[0],'a',2001),'a',false,'sai',2002);assert.deepEqual(s.eliminated,['a']);s=expireClue(s,questions,players,3502);assert.equal(s.phase,'CLUE_ACTIVE');assert.equal(s.clueIndex,1);assert.throws(()=>claimBuzzer(s,questions[0],'a',3503));s=answerClue(claimBuzzer(s,questions[0],'b',3503),'b',true,'đúng',3504);assert.equal(s.lockedScore,800);s=expireClue(s,questions,players,6504);assert.deepEqual(s.eliminated,[]);assert.equal(s.questionIndex,1);});
test('75 percent vote threshold, duplicates and reset',()=>{assert.deepEqual([4,3,2,1].map(requiredVotes),[3,3,2,1]);let s=voteClue(active(),questions[0],'a',players,2001);s=voteClue(s,questions[0],'a',players,2002);assert.equal(s.votes.length,1);s=voteClue(s,questions[0],'b',players,2003);assert.equal(s.clueIndex,0);s=voteClue(s,questions[0],'c',players,2004);assert.equal(s.clueIndex,1);assert.equal(s.votes.length,0);});
test('timeout boundary rejects buzz and answer; holder timeout eliminates',()=>{assert.throws(()=>claimBuzzer(active(),questions[0],'a',12000));const s=claimBuzzer(active(),questions[0],'a',2001);assert.throws(()=>answerClue(s,'a',true,'đúng',10001));const expired=expireClue(s,questions,players,10001);assert.equal(expired.outcome,'timeout');assert.ok(expired.eliminated.includes('a'));});
test('all wrong and last clue timeout reveal answer',()=>{let s={...active(),clueIndex:4,eliminated:['a','b','c']};s=answerClue(claimBuzzer(s,questions[0],'d',2001),'d',false,'sai',2002);assert.equal(expireClue(s,questions,players,3502).phase,'CLUE_RESULT');assert.equal(expireClue({...active(),clueIndex:4},questions,players,12000).phase,'CLUE_RESULT');});
test('reconnect catches up deadlines without host; finishes all questions',()=>{const s=catchUpClue(startClueQuestion(clueInitial(0),0),questions,players,25000);assert.equal(s.clueIndex,2);assert.equal(s.endsAt,32000);assert.equal(catchUpClue(s,questions,players,300000).phase,'GAME_FINISHED');});
test('final ranking supports ties',()=>{assert.deepEqual(ranks([{score:1000},{score:1000},{score:500},{score:0}]).map(p=>p.rank),[1,1,3,4]);});
test('buzz vs threshold has one authoritative ordered outcome',()=>{let s=voteClue(voteClue(active(),questions[0],'a',players,2001),questions[0],'b',players,2002);const buzzFirst=claimBuzzer(s,questions[0],'c',2003);assert.throws(()=>voteClue(buzzFirst,questions[0],'d',players,2004));s=voteClue(s,questions[0],'d',players,2003);assert.equal(claimBuzzer(s,questions[0],'c',2004).lockedScore,800);});


test('sixth clue remains playable and locks its score before the result',()=>{
 const q={clueSeconds:10,answerSeconds:8,clues:[1200,1000,800,600,400,200].map((score,i)=>({id:String(i),text:'Gợi ý',score,category:'OTHER' as const}))};
 let s=expireClue(startClueQuestion(clueInitial(0),0),[q],players,2000);
 for(let i=0;i<5;i++) s=expireClue(s,[q],players,s.endsAt!);
 assert.equal(s.phase,'CLUE_ACTIVE');assert.equal(s.clueIndex,5);
 const claimed=claimBuzzer(s,q,'a',s.startedAt+1);assert.equal(claimed.lockedScore,200);
 assert.equal(answerClue(claimed,'a',true,'đúng',s.startedAt+2).phase,'CLUE_RESULT');
 assert.equal(expireClue(s,[q],players,s.endsAt!).phase,'CLUE_RESULT');
});
