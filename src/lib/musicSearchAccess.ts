import type {NextRequest} from 'next/server';
import {z} from 'zod';
import {requireUser} from './auth';
import {one} from './db';
import {bidWindow} from './multiplayer';
import {MUSIC_SCOPES,type MusicScope} from './musicSearch';
export class MusicAccessError extends Error {
  constructor(message:string,public status:number){super(message);}
}
export async function musicSearchAccess(req:NextRequest,catalog=false):Promise<{scope:MusicScope;identity:string}> {
  const roomId=req.nextUrl.searchParams.get('roomId');
  if(!roomId){const user=await requireUser(req);return {scope:z.enum(MUSIC_SCOPES).parse(req.nextUrl.searchParams.get('scope')),identity:'creator:'+user.id};}
  z.string().uuid().parse(roomId);
  const token=req.headers.get('x-game-token')||'';
  const row=await one(`SELECT r.phase,r.paused_at,r.phase_started_at,r.phase_ends_at,r.clue_state,v.music_scope,q.answer_mode,q.answer_seconds,p.id,b.amount,EXISTS(SELECT 1 FROM questions sq WHERE sq.quiz_id=r.quiz_id AND sq.answer_mode='SEARCH') AS has_search FROM rooms r JOIN quizzes v ON v.id=r.quiz_id JOIN questions q ON q.quiz_id=r.quiz_id AND q.order_index=r.question_index JOIN players p ON p.room_id=r.id AND p.token=? LEFT JOIN bids b ON b.room_id=r.id AND b.question_index=r.question_index AND b.player_id=p.id WHERE r.id=?`,token,roomId);
  if(!row)throw new MusicAccessError('Phiên người chơi không hợp lệ.',401);
  if(catalog){
    // Public provider metadata may be prepared in the lobby. No quiz answer is read.
    if(!row.has_search)throw new MusicAccessError('Phòng này không dùng tìm bài hát.',403);
  }else {
    const clock=Date.now();const clue=JSON.parse(String(row.clue_state||'{}'));
    const window=row.amount===null?null:bidWindow(Number(row.phase_started_at),Number(row.amount),Number(row.answer_seconds));
    const canSearch=row.paused_at===null&&row.answer_mode==='SEARCH'&&(
      row.phase==='OPEN_ANSWERING'&&clock<Number(row.phase_ends_at)||
      row.phase==='MEDIA_PLAYING'&&window&&clock>=window.listenEndsAt&&clock<window.answerEndsAt||
      row.phase==='CLUE_ANSWERING'&&clue.holder===row.id&&!clue.pendingAnswer&&clock<Number(row.phase_ends_at));
    if(!canSearch)throw new MusicAccessError('Chưa đến thời gian tìm và trả lời hoặc lượt đã kết thúc.',403);
  }
  return {scope:z.enum(MUSIC_SCOPES).parse(row.music_scope),identity:'player:'+row.id};
}
