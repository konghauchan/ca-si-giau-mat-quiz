import test from 'node:test';
import assert from 'node:assert/strict';
import { formatStartTime, parseStartTime } from '../src/lib/time.ts';

test('accepts seconds or minute:second and formats minute marks', () => {
  assert.equal(parseStartTime('1'), 1);
  assert.equal(parseStartTime('0'), 0);
  assert.equal(parseStartTime('00:00'), 0);
  assert.equal(parseStartTime('75'), 75);
  assert.equal(parseStartTime('01:15'), 75);
  assert.equal(formatStartTime(59), '59');
  assert.equal(formatStartTime(60), '01:00');
  assert.equal(formatStartTime(75), '01:15');
  assert.equal(formatStartTime(61.5), '01:01.5');
});

test('rejects invalid minute:second values', () => {
  for (const value of ['1:60', '1:5', '-1', 'abc']) assert.equal(parseStartTime(value), null);
});
