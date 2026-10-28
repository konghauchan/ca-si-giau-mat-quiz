import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, generateKeyPairSync, createVerify } from 'node:crypto';
import { narrationPreparationTexts, narrationText, type NarrationState } from '../src/lib/narrationText.ts';
import { roundIntroText, roundRules } from '../src/lib/roundIntro.ts';
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

test('search introductions explain immediate submission and the actual retry rule in both languages', () => {
  for (const language of ['vi-VN', 'en-US'] as const) {
    for (const mode of ['OPEN', 'BID', 'CLUE'] as const) {
      const text = roundIntroText(mode, 2, false, language, 'SEARCH');
      assert.match(text, language === 'vi-VN' ? /Tìm tên bài hoặc ca sĩ\. Chọn bài là gửi ngay/ : /Search by song title or artist\. Selecting a song submits it immediately/);
      assert.doesNotMatch(text, /ABCD|hé chữ|Gõ|press Submit|Text answers/i);
      assert.match(text, language === 'vi-VN' ? mode === 'OPEN' ? /Sai có thể thử lại/ : /Chỉ chốt một lần/ : mode === 'OPEN' ? /If wrong, try again/ : /You get one answer/);
      const visual = roundRules(mode, false, 'SEARCH');
      assert.ok(visual.steps.some(step => step.title === 'Tìm và chọn bài'));
      assert.doesNotMatch(visual.rules.join(' '), /ABCD|hé chữ|Gõ/);
    }
  }
  const choice = roundIntroText('OPEN', 1, false, 'vi-VN', 'CHOICE');
  assert.match(choice, /Chọn một trong bốn đáp án/);
  assert.match(choice, /Hết giờ mới công bố đúng sai/);
  assert.doesNotMatch(choice, /thử lại|Tìm tên bài/);
  assert.match(roundIntroText('OPEN', 1, true), /Gõ tên phim/);
  assert.match(roundRules('OPEN').notes.join(' '), /Hé chữ/);
});

test('search narration uses server answer mode and never speaks a hidden answer while answering', () => {
  const state: NarrationState = { gameType: 'MUSIC_DUEL', playMode: 'OPEN', phase: 'OPEN_ANSWERING', question: { answerMode: 'SEARCH', prompt: 'Bài hát nào?', primaryAnswer: 'SECRET TRACK', artist: 'SECRET ARTIST' } };
  const open = narrationText(state, 'question');
  assert.match(open, /Chọn bài là gửi ngay/);
  assert.match(open, /Sai có thể chọn lại/);
  assert.doesNotMatch(open, /SECRET/);
  const intro = narrationText({ ...state, phase: 'TOPIC_INTRO', roundQuestionIndex: 1 }, 'intro');
  assert.match(intro, /Tìm tên bài hoặc ca sĩ/);
  assert.doesNotMatch(intro, /SECRET/);
  const bid: NarrationState = { ...state, playMode: 'BID', phase: 'MEDIA_PLAYING', personal: { stage: 'ANSWER' } };
  assert.match(narrationText(bid, 'question'), /Chỉ được chọn một lần/);
  assert.doesNotMatch(narrationText(bid, 'question'), /chọn lại|SECRET/);
  for (const stage of ['PREPARE', 'LISTEN', 'WAIT']) assert.throws(() => narrationText({ ...bid, personal: { stage } }, 'question'));
  assert.equal(narrationText({ ...state, question: { ...state.question, answerMode: 'TEXT' } }, 'question'), 'Bài hát nào?');
});

test('clue search instructions are available only to the current unanswered buzzer winner', () => {
  const state: NarrationState = { gameType: 'SONG_CLUE', phase: 'CLUE_ANSWERING', me: { id: 'winner' }, clue: { index: 0, items: [{ text: 'Public clue' }], holder: 'winner' }, question: { answerMode: 'SEARCH', primaryAnswer: 'SECRET' } };
  const text = narrationText(state, 'question');
  assert.match(text, /Chọn bài là gửi ngay/);
  assert.match(text, /Chỉ được chọn một lần/);
  assert.doesNotMatch(text, /SECRET/);
  assert.throws(() => narrationText({ ...state, me: { id: 'other' } }, 'question'));
  assert.throws(() => narrationText({ ...state, clue: { ...state.clue!, answerLocked: true } }, 'question'));
  assert.throws(() => narrationText({ ...state, phase: 'CLUE_ACTIVE' }, 'question'));
  assert.throws(() => narrationText({ ...state, question: { ...state.question, answerMode: 'TEXT' } }, 'question'));
});

test('prepared audio texts exactly match the guarded playback variants, including bid hint and search', () => {
  for (const language of ['vi-VN', 'en-US'] as const) {
    for (const mode of ['OPEN', 'BID', 'CLUE'] as const) {
      for (const answerMode of ['TEXT', 'CHOICE', 'SEARCH'] as const) {
        const state: NarrationState = { gameType: mode === 'CLUE' ? 'SONG_CLUE' : 'MUSIC_DUEL', playMode: mode, phase: 'LOBBY', me: { id: 'winner' }, clue: { index: 0, items: [{ text: 'First clue' }, { text: 'Second clue' }], holder: 'winner' }, question: { answerMode, prompt: 'Public prompt', hint: 'Bidding hint', primaryAnswer: 'Private answer' } };
        const prepared = narrationPreparationTexts(state, language);
        assert.ok(prepared.includes(narrationText({ ...state, phase: 'ROUND_RESULT' }, 'answer', language)));
        const phases = mode === 'CLUE' ? [] : mode === 'BID' ? ['BIDDING', 'BID_REVEAL', 'ANSWERING'] : ['OPEN_ANSWERING'];
        for (const phase of phases) assert.ok(prepared.includes(narrationText({ ...state, phase }, 'question', language)), `${mode}/${answerMode}/${phase}/${language}`);
        if (mode === 'CLUE') {
          assert.ok(prepared.includes(narrationText({ ...state, phase: 'CLUE_ACTIVE' }, 'clue', language)));
          assert.deepEqual(narrationPreparationTexts({ ...state, gameType: 'MUSIC_DUEL', phase: 'TOPIC_INTRO' }, language), prepared, 'mixed quiz warms clue audio during the round intro too');
          if (answerMode === 'SEARCH') assert.ok(prepared.includes(narrationText({ ...state, phase: 'CLUE_ANSWERING' }, 'question', language)));
        }
        assert.equal(new Set(prepared).size, prepared.length);
      }
    }
  }
});
