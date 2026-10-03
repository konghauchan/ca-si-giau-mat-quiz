import crypto from 'node:crypto';
import { one, all, run, tx } from './db';
import { answerMatches, groupBids, nextGroup, normalizeAnswer, scoreForBid, scoreForCorrectRank, youtubeId, type Phase } from './core';
import { storedAssetExists } from './media';

type Row = Record<string, unknown>;
const now = () => Date.now();
const id = () => crypto.randomUUID();
const token = () => crypto.randomBytes(24).toString('hex');
const RESULT_MS = 4000;
const SCOREBOARD_MS = 4000;
const TURN_TRANSITION_MS = 3000;
function fail(message: string): never { throw new Error(message); }
async function event(roomId: string, type: string, payload: Row = {}) { await run('INSERT INTO game_events(room_id,type,payload,created_at) VALUES(?,?,?,?)', roomId, type, JSON.stringify(payload), now()); }
async function room(roomId: string): Promise<Row> { return await one('SELECT * FROM rooms WHERE id=?', roomId) ?? fail('Không tìm thấy phòng.'); }
async function question(quizId: string, index: number): Promise<Row> { return await one('SELECT * FROM questions WHERE quiz_id=? AND order_index=?', quizId, index) ?? fail('Không tìm thấy câu hỏi.'); }
function gameRound(q: Row): 1 | 2 { return Number(q.game_round) === 1 ? 1 : 2; }
function assertHost(r: Row, value: string) { if (r.host_token !== value) fail('Chỉ người tạo phòng được thực hiện thao tác này.'); }
async function player(r: Row, value: string): Promise<Row> { return await one('SELECT * FROM players WHERE room_id=? AND token=?', String(r.id), value) ?? fail('Phiên người chơi không hợp lệ.'); }
async function setPhase(roomId: string, phase: Phase, durationMs: number | null = null, activeBid: number | null = null, startedAt = now()) {
  await run('UPDATE rooms SET phase=?,phase_started_at=?,phase_ends_at=?,active_bid=?,paused_at=NULL WHERE id=?', phase, startedAt, durationMs === null ? null : startedAt + durationMs, activeBid, roomId);
  await event(roomId, 'PHASE_CHANGED', { phase, activeBid });
}
async function bids(roomId: string, index: number) { return await all('SELECT player_id,amount,auto_assigned FROM bids WHERE room_id=? AND question_index=? ORDER BY amount,created_at', roomId, index); }
async function challengers(r: Row): Promise<string[]> {
  if (gameRound(await question(String(r.quiz_id), Number(r.question_index))) === 1) return (await all('SELECT id FROM players WHERE room_id=? ORDER BY joined_at, rowid', String(r.id))).map(p => String(p.id));
  return (await bids(String(r.id), Number(r.question_index))).filter(b => b.amount === r.active_bid).map(b => String(b.player_id));
}
async function startQuestion(r: Row, index: number) {
  const q = await question(String(r.quiz_id), index);
  const previous = index > 0 ? await question(String(r.quiz_id), index - 1) : undefined;
  if (!previous || previous.topic_id !== q.topic_id || gameRound(previous) !== gameRound(q)) await setPhase(String(r.id), 'TOPIC_INTRO', 3000);
  else await beginQuestion(r, q);
  await event(String(r.id), 'QUESTION_CHANGED', { index, gameRound: gameRound(q) });
}
async function beginQuestion(r: Row, q: Row) {
  if (gameRound(q) === 1) await setPhase(String(r.id), 'OPEN_MEDIA_PLAYING', (Number(q.listen_seconds) + 5) * 1000);
  else await setPhase(String(r.id), 'BIDDING', 30000);
}
async function finishBidding(r: Row) {
  const q = await question(String(r.quiz_id), Number(r.question_index));
  for (const p of await all('SELECT id FROM players WHERE room_id=?', String(r.id))) {
    if (!await one('SELECT 1 FROM bids WHERE room_id=? AND question_index=? AND player_id=?', String(r.id), Number(r.question_index), String(p.id))) {
      await run('INSERT INTO bids VALUES(?,?,?,?,?,?)', String(r.id), Number(r.question_index), String(p.id), Number(q.reveal_max), 1, now());
    }
  }
  await setPhase(String(r.id), 'BID_REVEAL', 3000);
  await event(String(r.id), 'BIDDING_ENDED');
}
async function startNextGroup(r: Row, announce = false) {
  const groups = groupBids((await bids(String(r.id), Number(r.question_index))).map(b => ({ playerId: String(b.player_id), amount: Number(b.amount) })));
  const group = nextGroup(groups, r.active_bid === null ? null : Number(r.active_bid));
  if (!group) { await setPhase(String(r.id), 'ROUND_RESULT', RESULT_MS); await event(String(r.id), 'ROUND_ENDED'); return; }
  await setPhase(String(r.id), announce ? 'TURN_TRANSITION' : 'MEDIA_PLAYING', announce ? TURN_TRANSITION_MS : (group.amount + 5) * 1000, group.amount);
  await event(String(r.id), 'CHALLENGERS_SELECTED', { amount: group.amount, playerIds: group.playerIds });
}
async function moveToNextQuestion(r: Row) {
  const roomId = String(r.id); const index = Number(r.question_index);
  const count = Number((await one('SELECT COUNT(*) AS count FROM questions WHERE quiz_id=?', String(r.quiz_id)))?.count);
  if (index + 1 >= count) { await setPhase(roomId, 'GAME_FINISHED'); await event(roomId, 'GAME_ENDED'); }
  else { await run('UPDATE rooms SET question_index=question_index+1 WHERE id=?', roomId); await startQuestion(r, index + 1); }
}
async function resolveAnswers(r: Row) {
  const roomId = String(r.id); const index = Number(r.question_index); const amount = Number(r.active_bid);
  const attempts = await all('SELECT * FROM answers WHERE room_id=? AND question_index=? AND amount=? ORDER BY created_at, rowid', roomId, index, amount);
  const q = await question(String(r.quiz_id), index);
  let correct = false; let correctRank = 0;
  for (const a of attempts) {
    if (a.correct === 1) {
      correct = true;
      correctRank++;
      const basePoints = scoreForBid(amount, Number(q.reveal_min), Number(q.reveal_max), Number(q.reveal_step));
      const points = scoreForCorrectRank(basePoints, correctRank);
      await run('UPDATE players SET score=score+? WHERE id=?', points, String(a.player_id));
      await run('INSERT INTO score_events VALUES(?,?,?,?,?,?,?)', id(), roomId, index, String(a.player_id), points, 'CORRECT', now());
      await event(roomId, 'SCORE_AWARDED', { playerId: a.player_id, points, correctRank });
    } else if (Number(r.wrong_penalty_percentage) > 0) {
      const penalty = Math.floor(scoreForBid(amount, Number(q.reveal_min), Number(q.reveal_max), Number(q.reveal_step)) * Number(r.wrong_penalty_percentage) / 100);
      await run('UPDATE players SET score=score-? WHERE id=?', penalty, String(a.player_id));
      await run('INSERT INTO score_events VALUES(?,?,?,?,?,?,?)', id(), roomId, index, String(a.player_id), -penalty, 'WRONG', now());
    }
  }
  await event(roomId, 'ANSWER_RESOLVED', { amount, correct });
  if (correct) { await setPhase(roomId, 'ROUND_RESULT', RESULT_MS); await event(roomId, 'ROUND_ENDED'); }
  else await startNextGroup(r, true);
}
async function resolveOpenAnswers(r: Row) {
  const roomId = String(r.id); const index = Number(r.question_index);
  const attempts = await all('SELECT * FROM answers WHERE room_id=? AND question_index=? AND amount=0 ORDER BY created_at, rowid', roomId, index);
  let correctRank = 0;
  for (const answer of attempts) {
    if (answer.correct !== 1) continue;
    correctRank++;
    const points = scoreForCorrectRank(500, correctRank);
    await run('UPDATE players SET score=score+? WHERE id=?', points, String(answer.player_id));
    await run('INSERT INTO score_events VALUES(?,?,?,?,?,?,?)', id(), roomId, index, String(answer.player_id), points, 'OPEN_CORRECT', now());
    await event(roomId, 'SCORE_AWARDED', { playerId: answer.player_id, points, correctRank, gameRound: 1 });
  }
  await event(roomId, 'ANSWER_RESOLVED', { gameRound: 1, correct: correctRank > 0 });
  await setPhase(roomId, 'ROUND_RESULT', RESULT_MS);
  await event(roomId, 'ROUND_ENDED');
}
async function advance(r: Row) {
  const roomId = String(r.id);
  const q = await question(String(r.quiz_id), Number(r.question_index));
  if (r.phase === 'TOPIC_INTRO') await beginQuestion(r, q);
  else if (r.phase === 'OPEN_MEDIA_PLAYING') await setPhase(roomId, 'OPEN_ANSWERING', Number(q.answer_seconds) * 1000);
  else if (r.phase === 'OPEN_ANSWERING') await resolveOpenAnswers(r);
  else if (r.phase === 'BIDDING') await finishBidding(r);
  else if (r.phase === 'BID_REVEAL') await startNextGroup({ ...r, active_bid: null });
  else if (r.phase === 'TURN_TRANSITION') await setPhase(roomId, 'MEDIA_PLAYING', (Number(r.active_bid) + 5) * 1000, Number(r.active_bid));
  else if (r.phase === 'MEDIA_PLAYING') await setPhase(roomId, 'ANSWERING', Number(q.answer_seconds) * 1000, Number(r.active_bid));
  else if (r.phase === 'ANSWERING') await resolveAnswers(r);
  else if (r.phase === 'ROUND_RESULT') await setPhase(roomId, 'SCOREBOARD', SCOREBOARD_MS, null, Number(r.phase_ends_at));
  else if (r.phase === 'SCOREBOARD') await moveToNextQuestion(r);
}
async function tick(roomId: string) {
  for (let i = 0; i < 6; i++) {
    const r = await room(roomId);
    if (r.paused_at !== null) break;
    if (r.phase_ends_at === null || Number(r.phase_ends_at) > now()) break;
    await advance(r);
  }
}

export type QuestionInput = { prompt: string; gameRound: 1 | 2; topicKey: string; listenSeconds: number; answerSeconds: number; mediaType: 'youtube' | 'uploaded_audio'; mediaUrl: string; mediaStart: number; primaryAnswer: string; acceptedAnswers: string[]; artist: string; hint: string; revealMin: number; revealMax: number; revealStep: number };
export type TopicInput = { key: string; gameRound: 1 | 2; title: string; songCount: number };
export async function saveQuiz(input: { id?: string; ownerToken?: string; title: string; description: string; visibility: string; topics: TopicInput[]; questions: QuestionInput[] }) {
  return await tx(async () => {
    let quizId = input.id || id(); let ownerToken = input.ownerToken || token();
    if (!input.title.trim()) fail('Nhập tên bộ câu hỏi.');
    if (input.questions.length < 2 || !input.questions.some(q => q.gameRound === 1) || !input.questions.some(q => q.gameRound === 2)) fail('Bộ câu hỏi cần ít nhất một câu cho mỗi vòng.');
    if (input.questions.length > 30) fail('Tối đa 30 câu hỏi.');
    if (![1, 2].every(round => input.topics.some(topic => topic.gameRound === round))) fail('Mỗi vòng cần ít nhất một chủ đề.');
    const topicKeys = new Set<string>();
    for (const topic of input.topics) {
      if (topicKeys.has(topic.key)) fail('Mã chủ đề bị trùng.');
      topicKeys.add(topic.key);
      if (!topic.title.trim()) fail('Nhập tên cho từng chủ đề.');
      if (input.questions.filter(q => q.topicKey === topic.key && q.gameRound === topic.gameRound).length !== topic.songCount) fail(`Chủ đề “${topic.title}” cần đúng ${topic.songCount} bài hát.`);
    }
    if (input.questions.some(q => !input.topics.some(topic => topic.key === q.topicKey && topic.gameRound === q.gameRound))) fail('Có bài hát chưa thuộc chủ đề hợp lệ.');
    const existing = input.id ? await one('SELECT * FROM quizzes WHERE id=?', quizId) ?? fail('Không tìm thấy bộ câu hỏi.') : undefined;
    if (existing && (existing.owner_token !== ownerToken || existing.deleted_at !== null)) fail('Bạn không có quyền sửa bộ câu hỏi này.');
    const songIds = new Set<string>();
    const songNames = new Set<string>();
    for (const q of input.questions) {
      if (!q.prompt.trim() || !q.primaryAnswer.trim()) fail('Câu hỏi và đáp án không được trống.');
      const songName = normalizeAnswer(q.primaryAnswer);
      if (songNames.has(songName)) fail('Tên bài hát không được lặp lại giữa các chủ đề hoặc hai vòng.');
      songNames.add(songName);
      if (q.gameRound === 2 && !q.hint.trim()) fail('Câu ở vòng 2 cần có gợi ý trước khi đấu giá.');
      if (![1, 2].includes(q.gameRound)) fail('Vòng chơi không hợp lệ.');
      if (!Number.isInteger(q.listenSeconds) || q.listenSeconds < 1 || q.listenSeconds > 10) fail('Thời lượng nghe vòng 1 phải từ 1 đến 10 giây.');
      if (!Number.isInteger(q.answerSeconds) || q.answerSeconds < 5 || q.answerSeconds > 60) fail('Thời gian trả lời phải từ 5 đến 60 giây.');
      if (q.mediaType === 'youtube' && !youtubeId(q.mediaUrl)) fail('Đường dẫn YouTube không hợp lệ.');
      const songId = q.mediaType === 'youtube' ? youtubeId(q.mediaUrl) : q.mediaUrl;
      if (songId && songIds.has(songId)) fail('Một bài hát không được lặp lại giữa các chủ đề hoặc hai vòng.');
      if (songId) songIds.add(songId);
      if (q.mediaType === 'uploaded_audio' && !storedAssetExists(q.mediaUrl)) fail('Tệp âm thanh chưa được tải lên hoặc không tồn tại.');
      if (!['youtube', 'uploaded_audio'].includes(q.mediaType)) fail('Nguồn nhạc không hợp lệ.');
      if (!Number.isFinite(q.mediaStart) || q.mediaStart < 1) fail('Thời điểm bắt đầu phải từ 1 giây.');
      if (q.revealMin < 1 || q.revealMax > 30 || q.revealMax < q.revealMin || q.revealStep < 1) fail('Cấu hình thời gian đấu giá không hợp lệ.');
    }
    let replacedId: string | undefined;
    if (existing && await one('SELECT 1 FROM rooms WHERE quiz_id=? LIMIT 1', quizId)) {
      replacedId = quizId;
      await run('UPDATE quizzes SET deleted_at=? WHERE id=?', now(), quizId);
      quizId = id(); ownerToken = token();
    }
    if (existing && !replacedId) { await run('UPDATE quizzes SET title=?,description=?,visibility=?,updated_at=? WHERE id=?', input.title.trim(), input.description.trim(), input.visibility, now(), quizId); await run('DELETE FROM questions WHERE quiz_id=?', quizId); await run('DELETE FROM topics WHERE quiz_id=?', quizId); }
    else await run('INSERT INTO quizzes(id,owner_token,title,description,visibility,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', quizId, ownerToken, input.title.trim(), input.description.trim(), input.visibility, now(), now());
    const topicIds = new Map<string, string>();
    for (const round of [1, 2]) {
      for (const [index, topic] of input.topics.filter(topic => topic.gameRound === round).entries()) {
        const topicId = id(); topicIds.set(topic.key, topicId);
        await run('INSERT INTO topics(id,quiz_id,game_round,order_index,title,song_count) VALUES(?,?,?,?,?,?)', topicId, quizId, round, index, topic.title.trim(), topic.songCount);
      }
    }
    const sorted = [1, 2].flatMap(round => input.topics.filter(topic => topic.gameRound === round).flatMap(topic => input.questions.filter(q => q.topicKey === topic.key)));
    for (const [index, q] of sorted.entries()) {
      const questionId = id();
      await run('INSERT INTO questions(id,quiz_id,order_index,type,prompt,reveal_type,reveal_unit,reveal_min,reveal_max,reveal_step,media_type,media_url,media_start,game_round,listen_seconds,answer_seconds,primary_answer,artist,hint,topic_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', questionId, quizId, index, 'music', q.prompt.trim(), 'media_time', 'seconds', q.revealMin, q.revealMax, q.revealStep, q.mediaType, q.mediaUrl, q.mediaStart, q.gameRound, q.listenSeconds, q.answerSeconds, q.primaryAnswer.trim(), q.artist.trim(), q.hint.trim(), topicIds.get(q.topicKey)!);
      for (const answer of new Set(q.acceptedAnswers.map(x => x.trim()).filter(Boolean))) await run('INSERT OR IGNORE INTO accepted_answers VALUES(?,?)', questionId, answer);
    }
    return { id: quizId, ownerToken, replacedId };
  });
}
export async function deleteQuiz(quizId: string, ownerToken?: string) {
  return await tx(async () => {
    const quiz = await one('SELECT owner_token,deleted_at FROM quizzes WHERE id=?', quizId) ?? fail('Không tìm thấy bộ câu hỏi.');
    if (!ownerToken || quiz.owner_token !== ownerToken) fail('Bạn không có quyền xóa bộ câu hỏi này.');
    if (quiz.deleted_at !== null) fail('Bộ câu hỏi này đã được xóa.');
    await run('UPDATE quizzes SET deleted_at=? WHERE id=?', now(), quizId);
    return { deleted: true };
  });
}
export async function getQuiz(quizId: string, ownerToken?: string) {
  const q = await one('SELECT * FROM quizzes WHERE id=? AND deleted_at IS NULL', quizId) ?? fail('Không tìm thấy bộ câu hỏi.');
  const own = ownerToken === q.owner_token;
  const questions = await Promise.all((await all('SELECT * FROM questions WHERE quiz_id=? ORDER BY order_index', quizId)).map(async question => ({
    ...question,
    primary_answer: own ? question.primary_answer : undefined,
    accepted_answers: own ? (await all('SELECT answer FROM accepted_answers WHERE question_id=?', String(question.id))).map(row => row.answer) : undefined
  })));
  const topics = await all('SELECT id,game_round,order_index,title,song_count FROM topics WHERE quiz_id=? ORDER BY game_round,order_index', quizId);
  return { id: q.id, title: q.title, description: q.description, visibility: q.visibility, topics, questions, own, usedInRoom: own && Boolean(await one('SELECT 1 FROM rooms WHERE quiz_id=? LIMIT 1', quizId)) };
}
export async function listQuizzes(ownerToken?: string) {
  const counts = '(SELECT COUNT(*) FROM questions WHERE quiz_id=quizzes.id) AS question_count,(SELECT COUNT(*) FROM questions WHERE quiz_id=quizzes.id AND game_round=1) AS round_one_count,(SELECT COUNT(*) FROM questions WHERE quiz_id=quizzes.id AND game_round=2) AS round_two_count';
  const publicQuizzes = await all(`SELECT id,title,description,visibility,${counts} FROM quizzes WHERE visibility='public' AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 50`);
  if (!ownerToken) return publicQuizzes;
  const owned = await all(`SELECT id,title,description,visibility,${counts} FROM quizzes WHERE owner_token=? AND deleted_at IS NULL ORDER BY updated_at DESC`, ownerToken);
  return [...owned, ...publicQuizzes.filter(q => !owned.some(o => o.id === q.id))];
}
export async function createRoom(quizId: string, ownerToken: string, nickname: string, avatarId = 1) {
  return await tx(async () => {
    const quiz = await one('SELECT * FROM quizzes WHERE id=? AND deleted_at IS NULL', quizId) ?? fail('Không tìm thấy bộ câu hỏi.');
    if (quiz.owner_token !== ownerToken && quiz.visibility !== 'public') fail('Bộ câu hỏi này được đặt ở chế độ riêng tư.');
    if (!await one('SELECT 1 FROM questions WHERE quiz_id=?', quizId)) fail('Bộ câu hỏi chưa có câu hỏi nào.');
    const rounds = await all('SELECT game_round,COUNT(*) AS count FROM questions WHERE quiz_id=? GROUP BY game_round', quizId);
    if (!rounds.some(item => Number(item.game_round) === 1) || !rounds.some(item => Number(item.game_round) === 2)) fail('Bộ câu hỏi cần có bài hát cho cả hai vòng. Hãy lưu bản mới và phân bài vào từng vòng.');
    const hostName = nickname.trim().slice(0, 24);
    if (hostName.length < 2) fail('Tên hiển thị cần ít nhất 2 ký tự.');
    const roomId = id(); const hostToken = token(); let pin = '';
    do { pin = String(crypto.randomInt(100000, 1000000)); } while (await one('SELECT 1 FROM rooms WHERE pin=?', pin));
    await run('INSERT INTO rooms(id,pin,quiz_id,host_token,phase,question_index,active_bid,phase_started_at,phase_ends_at,wrong_penalty_percentage,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', roomId, pin, quizId, hostToken, 'LOBBY', 0, null, now(), null, 0, now());
    await event(roomId, 'ROOM_CREATED');
    const hostPlayerId = id();
    await run('INSERT INTO players(id,room_id,token,nickname,avatar_id,score,joined_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?)', hostPlayerId, roomId, hostToken, hostName, avatarId, 0, now(), now());
    await event(roomId, 'PLAYER_JOINED', { playerId: hostPlayerId, nickname: hostName, host: true });
    return { roomId, pin, hostToken, hostPlayerId };
  });
}
export async function joinRoom(pin: string, nickname: string, avatarId = 1) {
  return await tx(async () => {
    const r = await one('SELECT * FROM rooms WHERE pin=?', pin) ?? fail('Mã phòng không đúng.');
    if (r.phase !== 'LOBBY') fail('Trò chơi đã bắt đầu.');
    const name = nickname.trim().slice(0, 24);
    if (name.length < 2) fail('Tên hiển thị cần ít nhất 2 ký tự.');
    if (Number((await one('SELECT COUNT(*) AS count FROM players WHERE room_id=?', String(r.id)))?.count) >= 4) fail('Phòng đã đủ 4 người.');
    if (await one('SELECT 1 FROM players WHERE room_id=? AND lower(nickname)=lower(?)', String(r.id), name)) fail('Tên hiển thị đã được dùng.');
    const playerId = id(); const playerToken = token();
    await run('INSERT INTO players(id,room_id,token,nickname,avatar_id,score,joined_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?)', playerId, String(r.id), playerToken, name, avatarId, 0, now(), now());
    await event(String(r.id), 'PLAYER_JOINED', { playerId, nickname: name });
    return { roomId: r.id, playerId, playerToken };
  });
}
export async function gameCommand(roomId: string, auth: string, action: string, value?: string | number) {
  return await tx(async () => {
    await tick(roomId);
    const r = await room(roomId); const index = Number(r.question_index);
    if (['start', 'endBidding', 'showScoreboard', 'nextQuestion', 'skipQuestion', 'endGame', 'pause', 'resume'].includes(action)) {
      assertHost(r, auth);
      if (action === 'pause') {
        if (['LOBBY', 'GAME_FINISHED'].includes(String(r.phase)) || r.paused_at !== null) fail('Không thể tạm dừng lúc này.');
        await run('UPDATE rooms SET paused_at=? WHERE id=?', now(), roomId);
        await event(roomId, 'GAME_PAUSED');
      } else if (action === 'resume') {
        if (r.paused_at === null) fail('Trò chơi chưa tạm dừng.');
        const elapsed = now() - Number(r.paused_at);
        await run('UPDATE rooms SET paused_at=NULL,phase_started_at=phase_started_at+?,phase_ends_at=CASE WHEN phase_ends_at IS NULL THEN NULL ELSE phase_ends_at+? END WHERE id=?', elapsed, elapsed, roomId);
        await event(roomId, 'GAME_RESUMED');
      } else if (action === 'endGame') {
        if (r.phase === 'GAME_FINISHED') fail('Trò chơi đã kết thúc.');
        await setPhase(roomId, 'GAME_FINISHED'); await event(roomId, 'GAME_ENDED');
      } else if (r.paused_at !== null) fail('Trò chơi đang tạm dừng.');
      else if (action === 'start') {
        if (r.phase !== 'LOBBY') fail('Trò chơi đã bắt đầu.');
        if (Number((await one('SELECT COUNT(*) AS count FROM players WHERE room_id=?', roomId))?.count) < 2) fail('Cần ít nhất 2 người chơi.');
        await startQuestion(r, index); await event(roomId, 'GAME_STARTED');
      } else if (action === 'endBidding') { if (r.phase !== 'BIDDING') fail('Không trong thời gian đấu giá.'); await finishBidding(r); }
      else if (action === 'showScoreboard') { if (r.phase !== 'ROUND_RESULT') fail('Chưa có kết quả.'); await setPhase(roomId, 'SCOREBOARD', SCOREBOARD_MS); }
      else if (action === 'nextQuestion') {
        if (r.phase !== 'SCOREBOARD') fail('Chưa đến bảng điểm.');
        await moveToNextQuestion(r);
      } else if (action === 'skipQuestion') { if (['LOBBY', 'GAME_FINISHED', 'SCOREBOARD'].includes(String(r.phase))) fail('Không thể bỏ qua lúc này.'); await setPhase(roomId, 'ROUND_RESULT', RESULT_MS); await event(roomId, 'QUESTION_SKIPPED'); }
    } else {
      if (r.paused_at !== null) fail('Trò chơi đang tạm dừng.');
      const p = await player(r, auth);
      await run('UPDATE players SET last_seen_at=? WHERE id=?', now(), String(p.id));
      if (action === 'bid') {
        if (r.phase !== 'BIDDING' || (r.phase_ends_at !== null && Number(r.phase_ends_at) <= now())) fail('Đã hết thời gian đấu giá.');
        const q = await question(String(r.quiz_id), index); const amount = Number(value);
        if (!Number.isInteger(amount) || amount < Number(q.reveal_min) || amount > Number(q.reveal_max) || (amount - Number(q.reveal_min)) % Number(q.reveal_step) !== 0) fail('Thời gian đấu giá không hợp lệ.');
        if (await one('SELECT 1 FROM bids WHERE room_id=? AND question_index=? AND player_id=?', roomId, index, String(p.id))) fail('Bạn đã chốt thời gian.');
        await run('INSERT INTO bids VALUES(?,?,?,?,?,?)', roomId, index, String(p.id), amount, 0, now());
        await event(roomId, 'BID_SUBMITTED', { playerId: p.id });
        const total = Number((await one('SELECT COUNT(*) AS count FROM players WHERE room_id=?', roomId))?.count);
        const locked = Number((await one('SELECT COUNT(*) AS count FROM bids WHERE room_id=? AND question_index=?', roomId, index))?.count);
        if (locked === total) await finishBidding(r);
      } else if (action === 'answer') {
        if (!['OPEN_ANSWERING', 'ANSWERING'].includes(String(r.phase)) || (r.phase_ends_at !== null && Number(r.phase_ends_at) <= now())) fail('Đã hết thời gian trả lời.');
        if (!(await challengers(r)).includes(String(p.id))) fail('Chưa đến lượt bạn trả lời.');
        if (await one('SELECT 1 FROM answers WHERE room_id=? AND question_index=? AND player_id=?', roomId, index, String(p.id))) fail('Bạn đã khóa đáp án.');
        const text = String(value ?? '').trim().slice(0, 120);
        if (!text) fail('Nhập đáp án.');
        const q = await question(String(r.quiz_id), index);
        const accepted = [String(q.primary_answer), ...(await all('SELECT answer FROM accepted_answers WHERE question_id=?', String(q.id))).map(x => String(x.answer))];
        const correct = answerMatches(text, accepted) ? 1 : 0;
        const amount = r.phase === 'OPEN_ANSWERING' ? 0 : Number(r.active_bid);
        await run('INSERT INTO answers VALUES(?,?,?,?,?,?,?)', roomId, index, String(p.id), amount, text, correct, now());
        await event(roomId, 'ANSWER_SUBMITTED', { playerId: p.id });
        const answerCount = Number((await one('SELECT COUNT(*) AS count FROM answers WHERE room_id=? AND question_index=? AND amount=?', roomId, index, amount))?.count);
        if (answerCount === (await challengers(r)).length) {
          if (r.phase === 'OPEN_ANSWERING') await resolveOpenAnswers(r);
          else await resolveAnswers(r);
        }
      } else fail('Thao tác không hợp lệ.');
    }
    return await getState(roomId, auth);
  });
}
export async function getState(roomId: string, auth: string) {
  return tx(async () => {
  await tick(roomId);
  const r = await room(roomId); const host = r.host_token === auth;
  // Older rooms may have a host without a player row. Newly created rooms use
  // the host token for both host controls and that person's one player seat.
  const me = host ? await one('SELECT * FROM players WHERE room_id=? AND token=?', roomId, auth) ?? null : await player(r, auth);
  if (me) await run('UPDATE players SET last_seen_at=? WHERE id=?', now(), String(me.id));
  const index = Number(r.question_index); const q = await question(String(r.quiz_id), index);
  const topic = q.topic_id ? await one('SELECT title,song_count FROM topics WHERE id=?', String(q.topic_id)) : undefined;
  const currentRound = gameRound(q);
  const nextQuestion = await one('SELECT game_round FROM questions WHERE quiz_id=? AND order_index=?', String(r.quiz_id), index + 1);
  const reveal = ['ROUND_RESULT', 'SCOREBOARD', 'GAME_FINISHED'].includes(String(r.phase));
  const canHear = r.phase === 'OPEN_MEDIA_PLAYING' || (r.phase === 'MEDIA_PLAYING' && (host || (await challengers(r)).includes(String(me?.id))));
  const showBids = !['LOBBY', 'BIDDING'].includes(String(r.phase));
  const bidRows = await bids(roomId, index);
  const answerRows = await all('SELECT player_id,amount,text,correct FROM answers WHERE room_id=? AND question_index=? ORDER BY created_at, rowid', roomId, index);
  const myAnswerRow = me ? answerRows.find(a => a.player_id === me.id) : undefined;
  const correctRows = answerRows.filter(a => a.correct === 1);
  const scores = await all('SELECT player_id,COALESCE(SUM(delta),0) AS delta FROM score_events WHERE room_id=? AND question_index=? GROUP BY player_id', roomId, index);
  const seatOrder = (await all('SELECT id FROM players WHERE room_id=? ORDER BY joined_at,rowid', roomId)).map(p => String(p.id));
  const players = (await all('SELECT id,nickname,avatar_id,score,last_seen_at FROM players WHERE room_id=? ORDER BY score DESC,joined_at', roomId)).map(p => ({
    id: p.id, nickname: p.nickname, avatarId: p.avatar_id, colorIndex: seatOrder.indexOf(String(p.id)), score: p.score, connected: now() - Number(p.last_seen_at) < 15000,
    bidLocked: bidRows.some(b => b.player_id === p.id),
    bid: showBids ? bidRows.find(b => b.player_id === p.id)?.amount ?? null : undefined,
    autoBid: showBids ? !!bidRows.find(b => b.player_id === p.id)?.auto_assigned : undefined,
    answerLocked: answerRows.some(a => a.player_id === p.id),
    answer: reveal ? answerRows.find(a => a.player_id === p.id)?.text ?? null : undefined,
    correct: reveal ? answerRows.find(a => a.player_id === p.id)?.correct === 1 : undefined,
    correctRank: reveal && correctRows.some(a => a.player_id === p.id) ? correctRows.findIndex(a => a.player_id === p.id) + 1 : undefined,
    roundDelta: reveal ? scores.find(s => s.player_id === p.id)?.delta ?? 0 : undefined
  }));
  const bidGroups = currentRound === 2 ? groupBids(bidRows.map(b => ({ playerId: String(b.player_id), amount: Number(b.amount) }))) : [];
  const previousGroup = r.active_bid !== null ? bidGroups.filter(group => group.amount < Number(r.active_bid)).at(-1) : undefined;
  const previousAttempts = previousGroup ? answerRows.filter(a => a.amount === previousGroup.amount) : [];
  const turnNotice = previousGroup && previousAttempts.length > 0 && ['TURN_TRANSITION', 'MEDIA_PLAYING', 'ANSWERING'].includes(String(r.phase)) ? {
    previousNames: players.filter(p => previousGroup.playerIds.includes(String(p.id))).map(p => String(p.nickname)),
    nextNames: players.filter(p => bidGroups.find(group => group.amount === Number(r.active_bid))?.playerIds.includes(String(p.id))).map(p => String(p.nickname)),
    previousAllWrong: previousAttempts.length === previousGroup.playerIds.length && previousAttempts.every(a => a.correct !== 1),
    nextBid: Number(r.active_bid)
  } : null;
  return {
    roomId, pin: r.pin, phase: r.phase, phaseStartedAt: r.phase_started_at, phaseEndsAt: r.phase_ends_at, pausedAt: r.paused_at,
    questionIndex: index, questionCount: Number((await one('SELECT COUNT(*) AS count FROM questions WHERE quiz_id=?', String(r.quiz_id)))?.count),
    gameRound: currentRound, nextGameRound: nextQuestion ? Number(nextQuestion.game_round) : null,
    roundQuestionIndex: Number((await one('SELECT COUNT(*) AS count FROM questions WHERE quiz_id=? AND game_round=? AND order_index<=?', String(r.quiz_id), currentRound, index))?.count),
    roundQuestionCount: Number((await one('SELECT COUNT(*) AS count FROM questions WHERE quiz_id=? AND game_round=?', String(r.quiz_id), currentRound))?.count),
    quizTitle: (await one('SELECT title FROM quizzes WHERE id=?', String(r.quiz_id)))?.title,
    topicName: topic?.title ?? 'Chủ đề chung',
    topicQuestionIndex: q.topic_id ? Number((await one('SELECT COUNT(*) AS count FROM questions WHERE quiz_id=? AND topic_id=? AND order_index<=?', String(r.quiz_id), String(q.topic_id), index))?.count) : Number((await one('SELECT COUNT(*) AS count FROM questions WHERE quiz_id=? AND game_round=? AND order_index<=?', String(r.quiz_id), currentRound, index))?.count),
    topicQuestionCount: topic?.song_count ?? Number((await one('SELECT COUNT(*) AS count FROM questions WHERE quiz_id=? AND game_round=?', String(r.quiz_id), currentRound))?.count),
    question: { id: q.id, prompt: q.prompt, type: q.type, revealType: q.reveal_type, revealUnit: q.reveal_unit, revealMin: q.reveal_min, revealMax: q.reveal_max, revealStep: q.reveal_step,
      mediaType: q.media_type, mediaUrl: canHear || reveal ? q.media_url : undefined,
      mediaStart: canHear || reveal ? q.media_start : undefined,
      listenSeconds: q.listen_seconds, answerSeconds: q.answer_seconds, primaryAnswer: reveal ? q.primary_answer : undefined, artist: reveal ? q.artist : undefined, hint: q.hint },
    activeBid: r.active_bid, activeChallengerIds: (currentRound === 1 && r.phase !== 'LOBBY') || r.active_bid !== null ? await challengers(r) : [],
    turnNotice,
    players, me: me ? { id: me.id, nickname: me.nickname } : null, isHost: host,
    myBid: me ? bidRows.find(b => b.player_id === me.id)?.amount ?? null : null,
    myAnswer: myAnswerRow?.text ?? null,
    myAnswerCorrect: myAnswerRow ? myAnswerRow.correct === 1 : null,
    lastEventId: (await one('SELECT MAX(id) AS id FROM game_events WHERE room_id=?', roomId))?.id ?? 0
  };
  });
}
export async function eventVersion(roomId: string) { return Number((await one('SELECT MAX(id) AS id FROM game_events WHERE room_id=?', roomId))?.id ?? 0); }
