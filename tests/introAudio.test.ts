import test from 'node:test';
import assert from 'node:assert/strict';
import { loadIntroAudio, prepareIntroAudio } from '../src/lib/introAudio.ts';

test('intro is downloaded before play, reused across rounds, and retried after failure', async () => {
  const original = globalThis.fetch;
  const requests: Array<{ mode: string; kind: string; language: string }> = [];
  let fail = true;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body)); requests.push(body);
    if (body.mode === 'BID' && fail) return new Response(JSON.stringify({error:'Retry'}), {status:503});
    return new Response(new Blob(['intro'], {type:'audio/wav'}));
  };
  try {
    const context = {roomId:'room', questionId:'first', token:'token', language:'vi-VN' as const, film:false};
    const pending = loadIntroAudio(context, 'OPEN');
    assert.equal(loadIntroAudio(context, 'OPEN'), pending);
    await pending;
    await prepareIntroAudio(context, 'OPEN');
    assert.equal(requests.length, 3);
    assert.ok(requests.every(r=>r.kind==='intro-audio'));
    const before = requests.length;
    await loadIntroAudio({...context,questionId:'next-round'}, 'CLUE');
    assert.equal(requests.length, before, 'starting the next round needs no network request');
    fail = false;
    await loadIntroAudio(context, 'BID');
    assert.equal(requests.length, before+1, 'failed downloads do not poison the cache');
    await loadIntroAudio({...context,language:'en-US'}, 'OPEN');
    await loadIntroAudio({...context,film:true}, 'OPEN');
    assert.equal(requests.length, before+3, 'language and film rules use separate clips');
  } finally { globalThis.fetch = original; }
});
