import test from 'node:test';
import assert from 'node:assert/strict';
import {clueInitial,claimBuzzer,queueClueAnswer,expireClue} from '../src/lib/clueRules.ts';

test('ABCD clue response stays pending and resolves exactly at its answer deadline',()=>{
 const q={clues:[{id:'c',text:'Gợi ý',score:600,category:'OTHER' as const}],clueSeconds:15,answerSeconds:8};
 for(const correct of [true,false]) {
  const active={...clueInitial(0),phase:'CLUE_ACTIVE' as const,endsAt:15000};
  const answering=claimBuzzer(active,q,'p1',1000);
  const submitted=queueClueAnswer(answering,'p1',correct,'Lựa chọn',1500);
  assert.equal(submitted.phase,'CLUE_ANSWERING');assert.equal(submitted.outcome,null);
  assert.equal(submitted.endsAt,9000);assert.equal(submitted.eliminated.length,0);
  assert.throws(()=>queueClueAnswer(submitted,'p1',!correct,'Khác',2000),/một lần/);
  assert.equal(expireClue(submitted,[q],['p1','p2'],8999),submitted);
  const result=expireClue(submitted,[q],['p1','p2'],9000);
  assert.equal(result.phase,correct?'CLUE_RESULT':'CLUE_FEEDBACK');
  assert.equal(result.outcome,correct?'correct':'wrong');assert.equal(result.pendingAnswer,undefined);
 }
});
