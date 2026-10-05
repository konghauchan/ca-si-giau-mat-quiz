import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
async function request(path, { method = 'GET', body, cookie, token, origin = base } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}), ...(token ? { 'x-game-token': token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function register() {
  const email = `quiz-test-${randomUUID()}@example.test`;
  const password = 'Test password 2026!';
  const response = await request('/api/auth', { method: 'POST', body: { action: 'register', email, password } });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.ok(response.cookie);
  return { email, password, cookie: response.cookie };
}

const question = gameRound => ({
  prompt: 'Đây là bài hát nào?', gameRound, topicKey: `round-${gameRound}`, listenSeconds: 3, answerSeconds: 12,
  mediaType: 'youtube', mediaUrl: `https://www.youtube.com/watch?v=${gameRound === 1 ? 'dQw4w9WgXcQ' : 'jNQXAC9IVRw'}`, mediaStart: 0,
  primaryAnswer: gameRound === 1 ? 'Never Gonna Give You Up' : 'Me at the Zoo', acceptedAnswers: [], artist: 'Rick Astley',
  hint: 'Một bài hát quen thuộc', revealMin: 1, revealMax: 10, revealStep: 1
});
const input = { title: 'Kiểm tra quản lý quiz', description: '', visibility: 'private', topics: [{ key: 'round-1', gameRound: 1, title: 'Nhạc mở màn', songCount: 1 }, { key: 'round-2', gameRound: 2, title: 'Nhạc đấu giá', songCount: 1 }], questions: [{ ...question(1), resultStart: 0, resultSeconds: 3 }, question(2)] };

assert.equal((await request('/api/quiz', { method: 'POST', body: input })).status, 400);
const owner = await register();
const other = await register();
assert.equal((await request('/api/auth', { cookie: owner.cookie })).body.user.email, owner.email);
assert.equal((await request('/api/quiz', { method: 'POST', body: input, cookie: owner.cookie, origin: 'https://other.example' })).status, 400);
assert.equal((await request('/api/quiz', { method: 'POST', body: { ...input, topics: [{ ...input.topics[0], songCount: 2 }, input.topics[1]] }, cookie: owner.cookie })).status, 400);

const created = await request('/api/quiz', { method: 'POST', body: input, cookie: owner.cookie });
assert.equal(created.status, 200, JSON.stringify(created.body));
const { id } = created.body;
assert.ok(id);
assert.equal(created.body.ownerToken, undefined);
const saved = await request(`/api/quiz?id=${id}`, { cookie: owner.cookie });
assert.equal(saved.body.own, true);
assert.deepEqual(saved.body.topics.map(topic => topic.title), ['Nhạc mở màn', 'Nhạc đấu giá']);
assert.equal(saved.body.questions[0].result_start, 0);
assert.equal((await request(`/api/quiz?id=${id}`)).status, 400);
assert.equal((await request(`/api/quiz?id=${id}`, { cookie: other.cookie })).status, 400);
assert.equal((await request(`/api/quiz?id=${id}`, { method: 'DELETE', cookie: other.cookie })).status, 400);
assert.equal((await request('/api/quiz', { method: 'POST', body: { ...input, id }, cookie: other.cookie })).status, 400);
assert.equal((await request(`/api/quiz/cover?id=${id}`, { method: 'DELETE', cookie: other.cookie })).status, 400);
assert.equal((await request('/api/room', { method: 'POST', body: { action: 'create', quizId: id, nickname: 'Other Host' } })).status, 400);

if (process.env.TEST_DATABASE_PATH) {
  const legacyId = randomUUID(); const legacyToken = randomUUID();
  const db = new DatabaseSync(process.env.TEST_DATABASE_PATH);
  db.prepare('INSERT INTO quizzes(id,owner_token,title,description,visibility,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(legacyId, legacyToken, 'Quiz cũ', '', 'private', Date.now(), Date.now());
  db.close();
  const deniedClaim = await request('/api/auth/claim', { method: 'POST', cookie: other.cookie, body: { claims: [{ id: legacyId, ownerToken: 'wrong' }] } });
  assert.deepEqual(deniedClaim.body.claimed, []);
  const claimed = await request('/api/auth/claim', { method: 'POST', cookie: owner.cookie, body: { claims: [{ id: legacyId, ownerToken: legacyToken }] } });
  assert.deepEqual(claimed.body.claimed, [legacyId]);
  assert.equal((await request(`/api/quiz?id=${legacyId}`, { cookie: owner.cookie })).body.own, true);
  assert.deepEqual((await request('/api/auth/claim', { method: 'POST', cookie: other.cookie, body: { claims: [{ id: legacyId, ownerToken: legacyToken }] } })).body.claimed, []);
  assert.equal((await request(`/api/quiz?id=${legacyId}`, { method: 'DELETE', cookie: owner.cookie })).status, 200);
}

const shared = await request('/api/quiz', { method: 'PATCH', body: { id, visibility: 'unlisted' }, cookie: owner.cookie });
assert.equal(shared.status, 200);
assert.equal((await request(`/api/quiz?id=${id}`)).body.own, false);
const room = await request('/api/room', { method: 'POST', body: { action: 'create', quizId: id, nickname: 'Guest Host' } });
assert.equal(room.status, 200, JSON.stringify(room.body));
const joined = await request('/api/room', { method: 'POST', body: { action: 'join', pin: room.body.pin, nickname: 'Guest Player' } });
assert.equal(joined.status, 200, JSON.stringify(joined.body));

const edited = await request('/api/quiz', { method: 'POST', body: { ...input, id, title: 'Quiz đã sửa' }, cookie: owner.cookie });
assert.equal(edited.status, 200, JSON.stringify(edited.body));
assert.equal(edited.body.replacedId, id);
assert.notEqual(edited.body.id, id);
assert.equal((await request(`/api/state?roomId=${room.body.roomId}`, { token: room.body.hostToken })).status, 200);
assert.equal((await request(`/api/quiz?id=${edited.body.id}`, { cookie: owner.cookie })).body.title, 'Quiz đã sửa');

const logout = await request('/api/auth', { method: 'POST', body: { action: 'logout' }, cookie: owner.cookie });
assert.equal(logout.status, 200);
assert.equal((await request('/api/auth', { cookie: owner.cookie })).body.user, null);
const login = await request('/api/auth', { method: 'POST', body: { action: 'login', email: owner.email.toUpperCase(), password: owner.password } });
assert.equal(login.status, 200, JSON.stringify(login.body));
assert.equal((await request(`/api/quiz?id=${edited.body.id}`, { cookie: login.cookie })).body.own, true);
assert.equal((await request(`/api/quiz?id=${edited.body.id}`, { method: 'DELETE', cookie: login.cookie })).status, 200);
assert.equal((await request(`/api/quiz?id=${edited.body.id}`, { cookie: login.cookie })).status, 400);
console.log('Quiz account smoke passed: registration, session, ownership, edit, anonymous play, replacement, logout, login, deletion.');
