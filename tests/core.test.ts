import test from 'node:test';
import assert from 'node:assert/strict';
import { answerMatches, groupBids, nextGroup, scoreForBid, scoreForCorrectRank, scoreForTimedAnswer, youtubeId } from '../src/lib/core.ts';

test('groups tied bids and escalates', () => {
  const groups = groupBids([{ playerId: 'A', amount: 2 }, { playerId: 'B', amount: 2 }, { playerId: 'C', amount: 4 }, { playerId: 'D', amount: 6 }]);
  assert.deepEqual(groups, [{ amount: 2, playerIds: ['A', 'B'] }, { amount: 4, playerIds: ['C'] }, { amount: 6, playerIds: ['D'] }]);
  assert.deepEqual(nextGroup(groups, 2), { amount: 4, playerIds: ['C'] });
  assert.equal(nextGroup(groups, 6), null);
});
test('score edges', () => { assert.equal(scoreForBid(1), 1000); assert.equal(scoreForBid(10), 100); });
test('correct tied bids reward faster answers', () => {
  assert.deepEqual([1, 2, 3, 4].map(rank => scoreForCorrectRank(900, rank)), [900, 675, 450, 225]);
});
test('answer points fall with the timer and stop at zero', () => {
  assert.equal(scoreForTimedAnswer(500, 1000, 11000, 1000), 500);
  assert.equal(scoreForTimedAnswer(500, 1000, 11000, 6000), 250);
  assert.equal(scoreForTimedAnswer(500, 1000, 11000, 11000), 0);
  assert.equal(scoreForTimedAnswer(500, 1000, 11000, 12000), 0);
});
test('Vietnamese normalization', () => {
  assert.equal(answerMatches('chung ta cua hien tai', ['Chúng Ta Của Hiện Tại']), true);
  assert.equal(answerMatches('Chúng ta không thuộc về nhau', ['Chúng Ta Của Hiện Tại']), false);
});
test('YouTube URL validation', () => {
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://evil.com/watch?v=dQw4w9WgXcQ'), null);
});
