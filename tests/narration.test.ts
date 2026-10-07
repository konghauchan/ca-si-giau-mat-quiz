import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, generateKeyPairSync, createVerify } from 'node:crypto';
import { narrationText } from '../src/lib/narrationText.ts';
import { audioFromWaveNet, encryptSpeech, decryptSpeech } from '../src/lib/narrationAudio.ts';

test('narration cannot reveal an answer or unopened clue before the result', () => {
  const state = { gameType: 'SONG_CLUE', phase: 'CLUE_ACTIVE', question: { primaryAnswer: 'Secret answer' }, clue: { index: 0, items: [{ text: 'Opened hint' }] } };
  assert.throws(() => narrationText(state, 'answer'), /chưa được công bố/);
  assert.equal(narrationText(state, 'clue'), 'Gợi ý 1: Opened hint');
  assert.throws(() => narrationText({ ...state, clue: { index: 1, items: state.clue.items } }, 'clue'), /chưa được mở/);
  assert.equal(narrationText({ ...state, phase: 'CLUE_RESULT' }, 'answer'), 'Đáp án là: Secret answer.');
});
test('narration skips listening phases and includes the bidding hint only in bidding', () => {
  const state = { gameType: 'MUSIC_BID', phase: 'MEDIA_PLAYING', question: { prompt: 'Which song?', hint: 'Released in 2015', primaryAnswer: 'Hidden' } };
  assert.throws(() => narrationText(state, 'question'), /chưa sẵn sàng/);
  assert.equal(narrationText({ ...state, phase: 'BIDDING' }, 'question'), 'Which song? Gợi ý: Released in 2015');
  assert.equal(narrationText({ ...state, phase: 'OPEN_ANSWERING' }, 'question'), 'Which song?');
});
test('WaveNet REST audio is validated, cached encrypted and rejects tampering', () => {
  const wav = Buffer.alloc(128); wav.write('RIFF'); wav.write('WAVE', 8);
  const payload = { audioContent: wav.toString('base64') };
  assert.deepEqual(audioFromWaveNet(payload), wav);
  assert.throws(() => audioFromWaveNet(null));
  assert.throws(() => audioFromWaveNet({ audioContent: Buffer.from('invalid').toString('base64') }));
  const secret = randomBytes(32); const ciphertext = encryptSpeech(wav, secret);
  assert.notDeepEqual(ciphertext, wav); assert.deepEqual(decryptSpeech(ciphertext, secret), wav);
  assert.throws(() => decryptSpeech(ciphertext, randomBytes(32)));
  ciphertext[30] ^= 1; assert.throws(() => decryptSpeech(ciphertext, secret));
});


test('WaveNet authenticates server-side, reads Vietnamese and reuses its OAuth token', async () => {
  const { generateWaveNetSpeech } = await import('../src/lib/waveNet.ts');
  const originalFetch = globalThis.fetch;
  const originalAccount = process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON;
  const originalVoice = process.env.GOOGLE_TTS_VOICE;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'test@example.test', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  delete process.env.GOOGLE_TTS_VOICE;
  const wav = Buffer.alloc(128); wav.write('RIFF'); wav.write('WAVE', 8);
  let authenticationCalls = 0; let synthesisCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      authenticationCalls++;
      const assertion = new URLSearchParams(String(options?.body)).get('assertion')!;
      const [header, claims, signature] = assertion.split('.');
      assert.equal(createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, 'base64url')), true);
      assert.equal(JSON.parse(Buffer.from(claims, 'base64url').toString()).iss, 'test@example.test');
      return Response.json({ access_token: 'mock-access-token', expires_in: 3600 });
    }
    assert.equal(String(url), 'https://texttospeech.googleapis.com/v1/text:synthesize');
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer mock-access-token');
    const body = JSON.parse(String(options?.body));
    assert.equal(body.input.text, 'Đáp án là: Một ngày mới.');
    assert.equal(body.voice.name, synthesisCalls === 2 ? 'en-US-Wavenet-F' : 'vi-VN-Wavenet-A');
    assert.equal(body.voice.languageCode, synthesisCalls === 2 ? 'en-US' : 'vi-VN');
    assert.equal(body.audioConfig.audioEncoding, 'LINEAR16');
    synthesisCalls++;
    return Response.json({ audioContent: wav.toString('base64') });
  };
  try {
    assert.deepEqual(await generateWaveNetSpeech('Đáp án là: Một ngày mới.'), wav);
    await generateWaveNetSpeech('Đáp án là: Một ngày mới.');
    await generateWaveNetSpeech('Đáp án là: Một ngày mới.', 'en-US');
    assert.equal(authenticationCalls, 1); assert.equal(synthesisCalls, 3);
    process.env.GOOGLE_TTS_VOICE = 'vi-VN-Chirp3-HD-Kore';
    await assert.rejects(generateWaveNetSpeech('Đáp án là: Một ngày mới.'), /WaveNet tiếng Việt/);
    assert.equal(synthesisCalls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAccount === undefined) delete process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON; else process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON = originalAccount;
    if (originalVoice === undefined) delete process.env.GOOGLE_TTS_VOICE; else process.env.GOOGLE_TTS_VOICE = originalVoice;
  }
});


test('round introduction never reads hidden answers and is restricted to the first question', () => {
  const state = { gameType: 'MUSIC_DUEL', phase: 'TOPIC_INTRO', gameRound: 2, roundQuestionIndex: 1, playMode: 'BID' as const, question: { primaryAnswer: 'Secret track' } };
  const text = narrationText(state, 'intro');
  assert.match(text, /Đấu giá thời gian/); assert.doesNotMatch(text, /Secret track/);
  assert.throws(() => narrationText({...state, roundQuestionIndex: 2}, 'intro'));
  assert.throws(() => narrationText({...state, phase: 'BIDDING'}, 'intro'));
});
