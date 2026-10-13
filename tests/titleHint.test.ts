import test from 'node:test';
import assert from 'node:assert/strict';
import { maskedTitle, titleHintIndices, titleHintLimit, scoreWithTitleHint } from '../src/lib/titleHint.ts';
test('Vietnamese title masks keep spaces and punctuation, reveal only selected letters',()=>{
  assert.equal(maskedTitle('Nơi này có anh'),'＿＿＿ ＿＿＿ ＿＿ ＿＿＿');
  assert.equal(maskedTitle('Nơi này có anh',[0,5,11],true),'N＿＿ ＿à＿ ＿＿ a＿＿');
  assert.equal(titleHintIndices('Nơi này có anh').length,3);
  assert.equal(titleHintLimit('Đợi'),1);
  assert.equal(titleHintLimit('A'),0);
  assert.equal(maskedTitle('A',[],true),'＿');
  assert.equal(maskedTitle('Đợi!',[],false),'＿＿＿!');
});
test('hint penalty starts exactly halfway; pre-hint scores stay intact and timer still reaches zero',()=>{
  assert.equal(scoreWithTitleHint(500,0,12000,5999),250);
  assert.equal(scoreWithTitleHint(500,0,12000,6000),175);
  assert.equal(scoreWithTitleHint(500,0,12000,9000),87);
  assert.equal(scoreWithTitleHint(500,0,12000,12000),0);
  assert.equal(scoreWithTitleHint(500,0,12000,1000),458);
  assert.equal(scoreWithTitleHint(500,5000,17000,6000),458,'pause shifts both time and answer timestamps equally');
});
