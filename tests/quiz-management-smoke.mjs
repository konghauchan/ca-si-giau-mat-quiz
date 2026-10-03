import assert from 'node:assert/strict';

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
async function request(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { 'x-quiz-token': token, 'x-game-token': token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

const question = gameRound => ({
  prompt: 'Đây là bài hát nào?', gameRound, listenSeconds: 3, answerSeconds: 12,
  mediaType: 'youtube', mediaUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', mediaStart: 1,
  primaryAnswer: 'Never Gonna Give You Up', acceptedAnswers: [], artist: 'Rick Astley',
  hint: 'Một bài hát quen thuộc', revealMin: 1, revealMax: 10, revealStep: 1
});
const input = { title: 'Kiểm tra quản lý quiz', description: '', visibility: 'private', questions: [question(1), question(2)] };
const created = await request('/api/quiz', { method: 'POST', body: input });
assert.equal(created.status, 200);
const { id, ownerToken } = created.body;

const rejected = await request(`/api/quiz?id=${id}`, { method: 'DELETE', token: 'not-the-owner' });
assert.equal(rejected.status, 400);
assert.equal((await request(`/api/quiz?id=${id}`, { token: ownerToken })).body.own, true);
assert.equal((await request('/api/quiz', { method: 'POST', body: { ...input, id, ownerToken: 'not-the-owner' } })).status, 400);
const firstEdit = await request('/api/quiz', { method: 'POST', body: { ...input, id, ownerToken, title: 'Sửa trước khi tạo phòng' } });
assert.equal(firstEdit.status, 200);
assert.equal(firstEdit.body.id, id);

const room = await request('/api/room', { method: 'POST', body: { action: 'create', quizId: id, ownerToken, nickname: 'Test Host' } });
assert.equal(room.status, 200);
const edited = await request('/api/quiz', { method: 'POST', body: { ...input, id, ownerToken, title: 'Quiz đã sửa' } });
assert.equal(edited.status, 200);
assert.equal(edited.body.replacedId, id);
assert.notEqual(edited.body.id, id);
assert.equal((await request(`/api/quiz?id=${id}`, { token: ownerToken })).status, 400);
assert.equal((await request(`/api/state?roomId=${room.body.roomId}`, { token: room.body.hostToken })).status, 200);

const replacement = edited.body;
assert.equal((await request(`/api/quiz?id=${replacement.id}`, { token: replacement.ownerToken })).body.title, 'Quiz đã sửa');
const deleted = await request(`/api/quiz?id=${replacement.id}`, { method: 'DELETE', token: replacement.ownerToken });
assert.equal(deleted.status, 200);
assert.equal((await request(`/api/quiz?id=${replacement.id}`, { token: replacement.ownerToken })).status, 400);
assert.equal((await request(`/api/room`, { method: 'POST', body: { action: 'create', quizId: replacement.id, ownerToken: replacement.ownerToken, nickname: 'Test Host' } })).status, 400);
console.log('Quiz management smoke passed: owner authorization, edit after room creation, room preservation, and deletion.');
