import {randomUUID} from 'node:crypto';
import {one,atomicWrite} from './db';
import {bidWindow,type Choice} from './multiplayer';
import {invalidateRead} from './sharedRead';

export type CommandReceipt={ack:true;action:'bid'|'answer';questionId:string;playerId:string;value:number|string};
// Preflight is read-only. Every write rechecks the authoritative room and deadline
// inside ONE atomic database batch, without holding a transaction across HTTP trips.
export async function fastCommand(roomId:string,auth:string,action:string,value:string|number|undefined,receivedAt:number):Promise<CommandReceipt|null>{
  if(action!=='bid'&&action!=='answer')return null;
  const context=await one(`SELECT r.*,v.game_type,q.id AS question_id,q.type AS question_type,q.answer_mode,q.choice_options,q.correct_choice_id,q.answer_seconds,q.reveal_min,q.reveal_max,q.reveal_step,p.id AS player_id,b.amount AS own_bid
    FROM rooms r JOIN quizzes v ON v.id=r.quiz_id JOIN questions q ON q.quiz_id=r.quiz_id AND q.order_index=r.question_index
    LEFT JOIN players p ON p.room_id=r.id AND p.token=? LEFT JOIN bids b ON b.room_id=r.id AND b.question_index=r.question_index AND b.player_id=p.id WHERE r.id=?`,auth,roomId);
  if(!context||context.game_type==='SONG_CLUE'||['song_clue','film_clue'].includes(String(context.question_type)))return null;
  if(action==='answer'&&context.answer_mode!=='CHOICE')return null;
  if(!context.player_id)throw new Error('Phiên người chơi không hợp lệ.');
  if(context.paused_at!==null)throw new Error('Trò chơi đang tạm dừng.');
  const index=Number(context.question_index),playerId=String(context.player_id),started=Number(context.phase_started_at);
  let result;
  let receiptValue:number|string;
  if(action==='bid'){
    if(context.phase!=='BIDDING'||receivedAt>=Number(context.phase_ends_at))throw new Error('Đã hết thời gian đấu giá.');
    const amount=Number(value);
    if(!Number.isInteger(amount)||amount<Number(context.reveal_min)||amount>Number(context.reveal_max)||(amount-Number(context.reveal_min))%Number(context.reveal_step)!==0)throw new Error('Thời gian đấu giá không hợp lệ.');
    if(context.own_bid!==null)throw new Error('Bạn đã chốt thời gian.');
    receiptValue=amount;
    result=await atomicWrite([
      {sql:`INSERT OR IGNORE INTO bids(room_id,question_index,player_id,amount,auto_assigned,created_at)
        SELECT r.id,r.question_index,p.id,?,0,? FROM rooms r JOIN players p ON p.room_id=r.id AND p.token=?
        WHERE r.id=? AND r.question_index=? AND r.phase_started_at=? AND r.phase='BIDDING' AND r.paused_at IS NULL AND r.phase_ends_at>? RETURNING player_id`,args:[amount,receivedAt,auth,roomId,index,started,receivedAt]},
      {sql:`INSERT INTO game_events(room_id,type,payload,created_at) SELECT ?,'BID_SUBMITTED',?,? WHERE changes()>0`,args:[roomId,JSON.stringify({playerId}),receivedAt]},
      {sql:`UPDATE rooms SET phase='BID_REVEAL',phase_started_at=CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),phase_ends_at=CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)+2000,active_bid=NULL WHERE id=? AND question_index=? AND phase='BIDDING' AND paused_at IS NULL
        AND (SELECT COUNT(*) FROM bids WHERE room_id=? AND question_index=?)=(SELECT COUNT(*) FROM players WHERE room_id=?)`,args:[roomId,index,roomId,index,roomId]},
      {sql:`INSERT INTO game_events(room_id,type,payload,created_at) SELECT ?,'PHASE_CHANGED',?,? WHERE changes()>0`,args:[roomId,JSON.stringify({phase:'BID_REVEAL',activeBid:null}),receivedAt]}
    ]);
    if(!result[0].rows.length)throw new Error('Bạn đã chốt thời gian hoặc đã hết thời gian đấu giá.');
  }else{
    const simultaneous=context.phase==='MEDIA_PLAYING';
    const window=simultaneous&&context.own_bid!==null?bidWindow(started,Number(context.own_bid),Number(context.answer_seconds)):null;
    if(simultaneous?(!window||receivedAt<window.listenEndsAt||receivedAt>=window.answerEndsAt):(context.phase!=='OPEN_ANSWERING'||receivedAt>=Number(context.phase_ends_at)))throw new Error('Chưa đến lượt trả lời hoặc đã hết thời gian riêng của bạn.');
    const choices:Choice[]=JSON.parse(String(context.choice_options||'[]'));
    const chosen=choices.find(c=>c.id===String(value??''));if(!chosen)throw new Error('Lựa chọn không hợp lệ.');
    receiptValue=chosen.label;
    const attemptId=randomUUID();
    result=await atomicWrite([
      {sql:`INSERT INTO answer_attempts(id,room_id,question_index,player_id,amount,text,correct,created_at)
        SELECT ?,r.id,r.question_index,p.id,?,?,?,? FROM rooms r JOIN players p ON p.room_id=r.id AND p.token=?
        WHERE r.id=? AND r.question_index=? AND r.phase_started_at=? AND r.phase=? AND r.paused_at IS NULL AND r.phase_ends_at>?
        AND NOT EXISTS(SELECT 1 FROM answer_attempts a WHERE a.room_id=r.id AND a.question_index=r.question_index AND a.player_id=p.id) RETURNING id`,args:[attemptId,simultaneous?Number(context.own_bid):0,chosen.label,chosen.id===context.correct_choice_id?1:0,receivedAt,auth,roomId,index,started,String(context.phase),receivedAt]},
      {sql:`INSERT INTO game_events(room_id,type,payload,created_at) SELECT ?,'ANSWER_SUBMITTED',?,? WHERE changes()>0`,args:[roomId,JSON.stringify({playerId}),receivedAt]}
    ]);
    if(!result[0].rows.length)throw new Error('Bạn chỉ được trả lời một lần hoặc đã hết thời gian.');
  }
  invalidateRead('mode:'+roomId);invalidateRead('snapshot:'+roomId);
  return {ack:true,action,questionId:String(context.question_id),playerId,value:receiptValue};
}
