import crypto from 'node:crypto';
import { all, one, run, tx, batchRead, batchWrite } from './db';
import { answerMatches } from './core';
import { answerClue, catchUpClue, expireClue, claimBuzzer, clueInitial, requiredVotes, ranks, startClueQuestion, voteClue, type Clue, type ClueQuestion, type ClueState } from './clueRules';
type Row = Record<string, unknown>;
const parse = (r: Row): ClueState => { const saved = JSON.parse(String(r.clue_state || '{}')); return saved.phase ? saved : clueInitial(Number(r.created_at)); };
const config = (rows: Row[]): ClueQuestion[] => rows.map(q => ({ clues: JSON.parse(String(q.clues_json)), clueSeconds: Number(q.listen_seconds), answerSeconds: Number(q.answer_seconds) }));
async function persist(roomId: string, s: ClueState, event: string) {
  await batchWrite([
    {sql:'UPDATE rooms SET phase=?,question_index=?,phase_started_at=?,phase_ends_at=?,clue_state=? WHERE id=?',args:[s.phase,s.questionIndex,s.startedAt,s.endsAt,JSON.stringify(s),roomId]},
    {sql:'INSERT INTO game_events(room_id,type,payload,created_at) VALUES(?,?,?,?)',args:[roomId,event,JSON.stringify({phase:s.phase,clueIndex:s.clueIndex}),Date.now()]}
  ]);
}
export async function tickClue(roomId: string) {
  const head=await one('SELECT phase_ends_at FROM rooms WHERE id=?',roomId);
  if (head?.phase_ends_at == null || Date.now() < Number(head.phase_ends_at)) return;
  await tx(async () => {
    const r = await one('SELECT * FROM rooms WHERE id=?', roomId); if (!r) throw new Error('Không tìm thấy phòng.');
    const s = parse(r); if (s.endsAt === null || Date.now() < s.endsAt) return;
    const qs = await all('SELECT clues_json,listen_seconds,answer_seconds FROM questions WHERE quiz_id=? ORDER BY order_index', String(r.quiz_id));
    const ps = await all('SELECT id FROM players WHERE room_id=?', roomId);
    const updated = catchUpClue(s, config(qs), ps.map(p => String(p.id)), Date.now());
    if (updated !== s) await persist(roomId, updated, 'CLUE_TRANSITION');
  });
}
export async function clueCommand(roomId: string, auth: string, action: string, value?: string | number, currentOnly = false) {
  if (!currentOnly) await tickClue(roomId);
  await tx(async () => {
    const [rr,ps,qs]=await batchRead([
      {sql:'SELECT * FROM rooms WHERE id=?',args:[roomId]},
      {sql:'SELECT id,token,ready FROM players WHERE room_id=? ORDER BY joined_at,rowid',args:[roomId]},
      {sql:'SELECT questions.* FROM questions JOIN rooms ON rooms.quiz_id=questions.quiz_id WHERE rooms.id=? ORDER BY order_index',args:[roomId]}
    ]);
    const r=rr[0];if(!r)throw new Error('Không tìm thấy phòng.');
    const p=ps.find(p=>p.token===auth);if(!p)throw new Error('Phiên người chơi không hợp lệ.');
    if (currentOnly && (r.paused_at !== null || !['CLUE_ACTIVE','CLUE_ANSWERING','CLUE_FEEDBACK'].includes(String(r.phase)))) throw new Error('Không thể thực hiện thao tác lúc này.');
    const ids=ps.map(p=>String(p.id));
    const cfg = config(qs); let s = currentOnly ? parse(r) : catchUpClue(parse(r), cfg, ids, Date.now()); const q = qs[s.questionIndex];
    // The deadline preflight is committed separately before validating an action.
    if (JSON.stringify(s) !== JSON.stringify(parse(r))) await persist(roomId, s, 'CLUE_TRANSITION');
    if (action === 'ready') {
      if (s.phase !== 'LOBBY') throw new Error('Trò chơi đã bắt đầu.');
      await run('UPDATE players SET ready=1,last_seen_at=? WHERE id=?', Date.now(), String(p.id));
      if (ps.length === 4 && ps.every(other => other.id === p.id || Number(other.ready) === 1)) s = startClueQuestion(s, Date.now());
    } else if (action === 'buzz') s = claimBuzzer(s, cfg[s.questionIndex], String(p.id), Date.now());
    else if (action === 'nextClue') s = voteClue(s, cfg[s.questionIndex], String(p.id), ids, Date.now());
    else if (action === 'answer') {
      const text = String(value ?? '').trim().slice(0, 120); if (!text) throw new Error('Nhập tên bài hát.');
      const aliases = await all('SELECT answer FROM accepted_answers WHERE question_id=?', String(q.id));
      const correct = answerMatches(text, [String(q.primary_answer), ...aliases.map(a => String(a.answer))]);
      s = answerClue(s, String(p.id), correct, text, Date.now());
      await run('INSERT INTO answer_attempts(id,room_id,question_index,player_id,amount,text,correct,created_at) VALUES(?,?,?,?,?,?,?,?)', crypto.randomUUID(), roomId, s.questionIndex, String(p.id), s.lockedScore, text, correct ? 1 : 0, Date.now());
      if (correct) {
        await run('INSERT INTO score_events(id,room_id,question_index,player_id,delta,reason,created_at) VALUES(?,?,?,?,?,?,?)', crypto.randomUUID(), roomId, s.questionIndex, String(p.id), s.lockedScore, 'CLUE_CORRECT', Date.now());
        await run('UPDATE players SET score=score+? WHERE id=?', s.lockedScore, String(p.id));
      }
    } else throw new Error('Chế độ gợi ý tự vận hành. Hãy dùng các nút dành cho người chơi.');
    await persist(roomId, s, action === 'buzz' ? 'BUZZER_WINNER' : action === 'answer' ? 'ANSWER_RESULT' : action === 'nextClue' ? 'CLUE_VOTE' : 'PLAYER_READY');
  });
}
export async function getClueState(roomId: string, auth: string, currentOnly = false) {
  const head = await one('SELECT phase_ends_at FROM rooms WHERE id=?', roomId);
  if (!currentOnly && head?.phase_ends_at != null && Number(head.phase_ends_at) <= Date.now()) await tickClue(roomId);
  const [rr, pp, qq, ss, vv] = await batchRead([
    { sql:'SELECT rooms.*,quizzes.title FROM rooms JOIN quizzes ON quizzes.id=rooms.quiz_id WHERE rooms.id=?',args:[roomId] },
    { sql:'SELECT * FROM players WHERE room_id=? ORDER BY score DESC,joined_at,rowid',args:[roomId] },
    { sql:'SELECT questions.* FROM questions JOIN rooms ON rooms.quiz_id=questions.quiz_id WHERE rooms.id=? ORDER BY order_index',args:[roomId] },
    { sql:'SELECT player_id,delta FROM score_events WHERE room_id=? AND question_index=(SELECT question_index FROM rooms WHERE id=?)',args:[roomId,roomId] },
    { sql:'SELECT COALESCE(MAX(id),0) AS version FROM game_events WHERE room_id=?',args:[roomId] }
  ]);
  return clueSnapshot(roomId,auth,rr[0],pp,qq,ss,Number(vv[0].version),currentOnly);
}
// Reuse the shared engine's atomic read batch when a room switches rules.
export async function clueSnapshot(roomId: string, auth: string, r: Row, pp: Row[], qq: Row[], ss: Row[], version: number, currentOnly = false) {
  if(!r) throw new Error('Không tìm thấy phòng.'); const me=pp.find(p=>p.token===auth); if(!me) throw new Error('Phiên người chơi không hợp lệ.');
  const s=parse(r); const q=qq[s.questionIndex]; const reveal=['CLUE_RESULT','GAME_FINISHED'].includes(s.phase); const clues: Clue[]=JSON.parse(String(q.clues_json));
  const seats=[...pp].sort((a,b)=>Number(a.joined_at)-Number(b.joined_at));
  if(Date.now()-Number(me.last_seen_at)>10000) await tx(()=>run('UPDATE players SET last_seen_at=? WHERE id=? AND last_seen_at<?',Date.now(),String(me.id),Date.now()-10000));
  const players=ranks(pp.map(p=>({id:String(p.id),nickname:String(p.nickname),avatarId:Number(p.avatar_id),colorIndex:seats.findIndex(seat=>seat.id===p.id),score:Number(p.score),ready:Number(p.ready)===1,connected:p.id===me.id || Date.now()-Number(p.last_seen_at)<20000,eliminated:s.eliminated.includes(String(p.id)),roundDelta:ss.filter(e=>e.player_id===p.id).reduce((sum,e)=>sum+Number(e.delta),0)})));
  return {roomId,pin:String(r.pin),gameType:'SONG_CLUE' as const,playMode:'CLUE' as const,mixed:currentOnly,gameRound:Number(q.game_round),roundCount:new Set(qq.map(q=>q.game_round)).size,pausedAt:r.paused_at,quizTitle:String(r.title),phase:s.phase,phaseStartedAt:s.startedAt,phaseEndsAt:s.endsAt,serverNow:Date.now(),lastEventId:version,questionIndex:s.questionIndex,questionCount:qq.length,me:{id:String(me.id),nickname:String(me.nickname)},players,isHost:r.host_token===auth,
    clue:{index:s.clueIndex,scores:clues.map(c=>c.score),items:s.phase==='QUESTION_INTRO'||s.phase==='LOBBY'?[]:clues.slice(0,s.clueIndex+1),value:clues[s.clueIndex].score,votes:s.votes.length,hasVoted:s.votes.includes(String(me.id)),requiredVotes:requiredVotes(pp.length-s.eliminated.length),holder:s.holder,lockedScore:s.lockedScore,outcome:s.outcome,submittedAnswer:s.holder===me.id?s.answer:undefined,eliminated:s.eliminated.includes(String(me.id))},
    question:{id:String(q.id),primaryAnswer:reveal?String(q.primary_answer):undefined,artist:reveal?String(q.artist):undefined,answerSeconds:Number(q.answer_seconds)}};
}

// Mixed quizzes share the room clock and question order with the music engine.
// Stop at CLUE_RESULT; the shared engine then shows scores and starts any next rule.
export async function startCurrentClue(roomId: string, index: number) {
  await persist(roomId,startClueQuestion({...clueInitial(Date.now()),questionIndex:index},Date.now()),'CLUE_STARTED');
}
export async function advanceCurrentClue(r: Row) {
  const qs = await all('SELECT * FROM questions WHERE quiz_id=? ORDER BY order_index',String(r.quiz_id));
  const ps = await all('SELECT id FROM players WHERE room_id=?',String(r.id));
  let s=parse(r);
  for (let i=0;i<32 && s.phase!=='CLUE_RESULT' && s.endsAt!==null && Date.now()>=s.endsAt;i++) {
    const next=expireClue(s,config(qs),ps.map(p=>String(p.id)),Date.now());
    if(next===s)break;s=next;
  }
  await persist(String(r.id),s,'CLUE_TRANSITION');
}
export async function shiftClueClock(r: Row, elapsed: number) {
  const s=parse(r);s.startedAt+=elapsed;if(s.endsAt!==null)s.endsAt+=elapsed;
  await run('UPDATE rooms SET clue_state=? WHERE id=?',JSON.stringify(s),String(r.id));
}
