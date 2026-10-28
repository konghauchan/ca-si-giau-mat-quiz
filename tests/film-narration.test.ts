import test from 'node:test';
import assert from 'node:assert/strict';
import { filmNarrationEvent } from '../src/lib/filmNarrationEvent.ts';
import { narrationText, narrationPreparationTexts, type NarrationState } from '../src/lib/narrationText.ts';

const film: NarrationState = {
  gameType: 'MUSIC_DUEL', category: 'FILM', playMode: 'BID', gameRound: 2,
  roundQuestionIndex: 1, phase: 'BIDDING',
  question: { answerMode: 'SEARCH', prompt: 'Public prompt', hint: 'A public hint',
    primaryAnswer: 'PRIVATE TITLE', artist: 'PRIVATE CAST' },
};

test('film narration uses public bidding hints and a short answer prompt in both languages', () => {
  for (const language of ['vi-VN', 'en-US'] as const) {
    const bidding = narrationText(film, 'question', language);
    assert.match(bidding, /A public hint/);
    assert.doesNotMatch(bidding, /PRIVATE|bài hát|ca sĩ|nghe nhạc/);
    assert.equal(narrationText({ ...film, phase: 'BID_REVEAL' }, 'question', language), bidding);
    for (const answerMode of ['TEXT', 'CHOICE', 'SEARCH'] as const) {
      const answering = { ...film, phase: 'MEDIA_PLAYING', personal: { stage: 'ANSWER' }, question: { ...film.question, answerMode } };
      assert.equal(narrationText(answering, 'question', language), language === 'vi-VN' ? 'Tên phim là gì?' : 'What is the film title?');
      for (const stage of ['PREPARE', 'LISTEN', 'WAIT'])
        assert.throws(() => narrationText({ ...answering, personal: { stage } }, 'question', language));
    }
    assert.throws(() => narrationText(film, 'answer', language));
    assert.equal(narrationText({ ...film, phase: 'ROUND_RESULT' }, 'answer', language),
      `${language === 'vi-VN' ? 'Đáp án là' : 'The answer is'}: PRIVATE TITLE.`);
  }
});

test('film preparation includes exact intro, bid, answer and result variants for every answer mode', () => {
  for (const language of ['vi-VN', 'en-US'] as const)
    for (const playMode of ['OPEN', 'BID', 'CLUE'] as const)
      for (const answerMode of ['TEXT', 'CHOICE', 'SEARCH'] as const) {
        const state: NarrationState = { ...film, playMode, question: { ...film.question, answerMode }, clue: { index: 0, items: [{ text: 'Public clue' }] } };
        const prepared = narrationPreparationTexts(state, language);
        const intro = narrationText({ ...state, phase: 'TOPIC_INTRO' }, 'intro', language);
        assert.ok(prepared.includes(intro));
        assert.doesNotMatch(intro, /bài hát|ca sĩ|nghe nhạc|sáu gợi ý|Six clues|PRIVATE/);
        if (playMode !== 'CLUE') {
          for (const phase of playMode === 'BID' ? ['BIDDING', 'ANSWERING'] : ['OPEN_ANSWERING'])
            assert.ok(prepared.includes(narrationText({ ...state, phase }, 'question', language)));
        }
      }
});

test('film playback stays silent during clips and waits for each player answer window', () => {
  const state = { phase: 'MEDIA_PLAYING', question: { mediaType: 'youtube', mediaUrl: 'https://youtu.be/example' } };
  for (const phase of ['LOBBY', 'OPEN_MEDIA_PLAYING', 'TURN_TRANSITION'])
    assert.equal(filmNarrationEvent({ ...state, phase }).kind, undefined);
  for (const stage of ['PREPARE', 'LISTEN', 'WAIT'])
    assert.equal(filmNarrationEvent({ ...state, personal: { stage } }).kind, undefined);
  assert.deepEqual(filmNarrationEvent({ ...state, personal: { stage: 'ANSWER' } }), { kind: 'question', key: 'question', autoPlay: true });
  const result = filmNarrationEvent({ ...state, phase: 'ROUND_RESULT' });
  assert.equal(result.kind, 'answer'); // Manual replay remains available.
  assert.equal(result.autoPlay, false);
  const board = filmNarrationEvent({ ...state, phase: 'SCOREBOARD' });
  assert.equal(board.autoPlay, true);
  assert.equal(board.key, result.key);
  assert.equal(filmNarrationEvent({ ...state, phase: 'GAME_FINISHED' }).key, board.key);
  assert.equal(filmNarrationEvent({ phase: 'ROUND_RESULT', question: {} }).autoPlay, true);
  assert.equal(filmNarrationEvent({ ...state, phase: 'BIDDING' }).key,
    filmNarrationEvent({ ...state, phase: 'BID_REVEAL' }).key);
  assert.equal(filmNarrationEvent({ ...state, phase: 'TOPIC_INTRO', roundQuestionIndex: 2 }).kind, undefined);
});
