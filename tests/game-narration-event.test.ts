import test from 'node:test';
import assert from 'node:assert/strict';
import { gameNarrationEvent, clueNarrationEvent } from '../src/lib/gameNarrationEvent.ts';
import { narrationText, narrationPreparationTexts, type NarrationState } from '../src/lib/narrationText.ts';

const music: NarrationState = {
  gameType: 'MUSIC_DUEL', category: 'MUSIC', playMode: 'OPEN', gameRound: 1,
  roundQuestionIndex: 1, phase: 'TOPIC_INTRO',
  question: { answerMode: 'SEARCH', prompt: 'Bài hát nào?', primaryAnswer: 'PRIVATE SONG' },
};

test('music events distinguish the round intro, bidding and answering while deduplicating equivalent phases', () => {
  const state = { ...music, question: {} };
  assert.deepEqual(gameNarrationEvent(state), { kind: 'intro', key: 'intro', autoPlay: true });
  assert.equal(gameNarrationEvent({ ...state, roundQuestionIndex: 2 }).kind, undefined);
  const bid = gameNarrationEvent({ ...state, phase: 'BIDDING' });
  assert.deepEqual(bid, gameNarrationEvent({ ...state, phase: 'BID_REVEAL' }));
  const answer = gameNarrationEvent({ ...state, phase: 'OPEN_ANSWERING' });
  assert.equal(answer.kind, 'question');
  assert.notEqual(answer.key, bid.key);
  assert.notEqual(answer.key, gameNarrationEvent(state).key);
  assert.deepEqual(answer, gameNarrationEvent({ ...state, phase: 'ANSWERING' }));
  assert.deepEqual(answer, gameNarrationEvent({ ...state, phase: 'MEDIA_PLAYING', personal: { stage: 'ANSWER' } }));
  for (const phase of ['MEDIA_PLAYING', 'ANSWERING'])
    for (const stage of ['PREPARE', 'LISTEN', 'WAIT'])
      assert.equal(gameNarrationEvent({ ...state, phase, personal: { stage } }).kind, undefined);
  for (const phase of ['LOBBY', 'OPEN_MEDIA_PLAYING', 'TURN_TRANSITION'])
    assert.equal(gameNarrationEvent({ ...state, phase }).kind, undefined);
  const result = gameNarrationEvent({ ...state, phase: 'ROUND_RESULT' });
  assert.equal(result.kind, 'answer');
  assert.deepEqual(result, gameNarrationEvent({ ...state, phase: 'SCOREBOARD' }));
  assert.deepEqual(result, gameNarrationEvent({ ...state, phase: 'GAME_FINISHED' }));
});

test('all music answer modes and languages leave submission rules in the introduction', () => {
  for (const language of ['vi-VN', 'en-US'] as const)
    for (const playMode of ['OPEN', 'BID'] as const)
      for (const answerMode of ['TEXT', 'CHOICE', 'SEARCH'] as const) {
        const state = { ...music, playMode, question: { ...music.question, answerMode } };
        const intro = narrationText(state, 'intro', language);
        const answering = { ...state, phase: playMode === 'OPEN' ? 'OPEN_ANSWERING' : 'ANSWERING' };
        assert.equal(narrationText(answering, 'question', language), 'Bài hát nào?');
        assert.notEqual(narrationText(answering, 'question', language), intro);
        assert.doesNotMatch(narrationText(answering, 'question', language), /PRIVATE|Chọn bài|Selecting a song|Chỉ được chọn/);
        assert.throws(() => narrationText(answering, 'intro', language));
        const prepared = narrationPreparationTexts(state, language);
        assert.ok(prepared.includes(intro));
        assert.ok(prepared.includes(narrationText(answering, 'question', language)));
      }
});

test('clue music uses stable event keys for each clue, winner instructions and result', () => {
  const state = { phase: 'QUESTION_INTRO', roundQuestionIndex: 1, me: { id: 'winner' },
    question: { answerMode: 'SEARCH' }, clue: { index: 0, holder: 'winner' } };
  assert.equal(clueNarrationEvent(state).key, 'intro');
  assert.equal(clueNarrationEvent({ ...state, mixed: true }).kind, undefined);
  assert.equal(clueNarrationEvent({ ...state, roundQuestionIndex: 2 }).kind, undefined);
  const active = clueNarrationEvent({ ...state, phase: 'CLUE_ACTIVE' });
  assert.equal(active.kind, 'clue');
  assert.notEqual(active.key, clueNarrationEvent({ ...state, phase: 'CLUE_ACTIVE', clue: { ...state.clue, index: 1 } }).key);
  const answering = { ...state, phase: 'CLUE_ANSWERING' };
  assert.equal(clueNarrationEvent(answering).kind, 'question');
  assert.deepEqual(clueNarrationEvent(answering), clueNarrationEvent({ ...answering, clue: { ...state.clue, index: 1 } }));
  assert.equal(clueNarrationEvent({ ...answering, me: { id: 'spectator' } }).kind, undefined);
  assert.equal(clueNarrationEvent({ ...answering, clue: { ...state.clue, answerLocked: true } }).kind, undefined);
  assert.equal(clueNarrationEvent({ ...answering, question: { answerMode: 'TEXT' } }).kind, undefined);
  assert.deepEqual(clueNarrationEvent({ ...state, phase: 'CLUE_RESULT' }), clueNarrationEvent({ ...state, phase: 'GAME_FINISHED' }));
});
