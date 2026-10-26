import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requireUser} from '@/lib/auth';
import {one} from '@/lib/db';
import {bidWindow} from '@/lib/multiplayer';
import {MusicSearchBusy,limitMusicSearch,searchSongs} from '@/lib/musicBrainz';
import {MUSIC_SCOPES,type MusicScope} from '@/lib/musicSearch';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const querySchema=z.string().trim().min(2).max(80).refine(v=>/[\p{L}\p{N}]/u.test(v));
export async function GET(req:NextRequest) {
  try {
    const query=querySchema.parse(req.nextUrl.searchParams.get('q'));
    const roomId=req.nextUrl.searchParams.get('roomId');
    let scope:MusicScope;let identity:string;
    if(roomId) {
      z.string().uuid().parse(roomId);
      const token=req.headers.get('x-game-token')||'';
      const row=await one(`SELECT r.phase,r.paused_at,r.phase_started_at,r.phase_ends_at,r.clue_state,v.music_scope,q.answer_mode,q.answer_seconds,p.id,b.amount FROM rooms r JOIN quizzes v ON v.id=r.quiz_id JOIN questions q ON q.quiz_id=r.quiz_id AND q.order_index=r.question_index JOIN players p ON p.room_id=r.id AND p.token=? LEFT JOIN bids b ON b.room_id=r.id AND b.question_index=r.question_index AND b.player_id=p.id WHERE r.id=?`,token,roomId);
      if(!row)return NextResponse.json({error:'Phiên người chơi không hợp lệ.'},{status:401});
      const clock=Date.now();
      const clue=JSON.parse(String(row.clue_state||'{}'));
      const canSearch=row.paused_at===null&&row.answer_mode==='SEARCH'&&(
        row.phase==='OPEN_ANSWERING'&&clock<Number(row.phase_ends_at)||
        row.phase==='MEDIA_PLAYING'&&row.amount!==null&&clock>=bidWindow(Number(row.phase_started_at),Number(row.amount),Number(row.answer_seconds)).listenEndsAt&&clock<bidWindow(Number(row.phase_started_at),Number(row.amount),Number(row.answer_seconds)).answerEndsAt||
        row.phase==='CLUE_ANSWERING'&&clue.holder===row.id&&!clue.pendingAnswer&&clock<Number(row.phase_ends_at));
      if(!canSearch)return NextResponse.json({error:'Chưa đến thời gian tìm và trả lời hoặc lượt đã kết thúc.'},{status:403});
      scope=z.enum(MUSIC_SCOPES).parse(row.music_scope);identity='player:'+row.id;
    }else {
      const user=await requireUser(req);scope=z.enum(MUSIC_SCOPES).parse(req.nextUrl.searchParams.get('scope'));identity='creator:'+user.id;
    }
    await limitMusicSearch(identity);
    return NextResponse.json({...await searchSongs(query,scope),scope},{headers:{'Cache-Control':'no-store'}});
  }catch(error) {
    if(error instanceof MusicSearchBusy)return NextResponse.json({error:error.message,retryAfter:error.retryAfter},{status:429,headers:{'Retry-After':String(error.retryAfter),'Cache-Control':'no-store'}});
    return NextResponse.json({error:error instanceof z.ZodError?'Nhập ít nhất 2 ký tự; chọn phạm vi nhạc hợp lệ.':(error as Error).message},{status:400,headers:{'Cache-Control':'no-store'}});
  }
}
