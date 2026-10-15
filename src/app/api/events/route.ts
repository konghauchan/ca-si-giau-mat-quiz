import {gameErrorStatus} from '@/lib/gameErrors';
import { NextRequest } from 'next/server';
import { getState } from '@/lib/game';
import { one } from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=180;
type Watcher=()=>void;
type Hub={listeners:Set<Watcher>; version:number; hintStart:number; timer:ReturnType<typeof setTimeout>|null; stopped:boolean};
const hubs=new Map<string,Hub>();
// Share lightweight change probes within a function instance. No full snapshot
// reads or write transaction while a room is idle. Each stream expires in 120s.
function watch(roomId:string,listener:Watcher) {
  let hub=hubs.get(roomId);
  if(!hub){hub={listeners:new Set(),version:-1,hintStart:-1,timer:null,stopped:false};hubs.set(roomId,hub);
    const current=hub;
    const poll=async()=>{if(current.stopped)return; try{
      const row=await one('SELECT phase,phase_started_at,phase_ends_at,paused_at,(SELECT COALESCE(MAX(id),0) FROM game_events WHERE room_id=rooms.id) AS version FROM rooms WHERE id=?',roomId);
      const due=row?.paused_at===null&&row.phase_ends_at!==null&&Number(row.phase_ends_at)<=Date.now();
      const hintDue=row?.paused_at===null&&row.phase==='OPEN_ANSWERING'&&Date.now()>=(Number(row.phase_started_at)+Number(row.phase_ends_at))/2&&current.hintStart!==Number(row.phase_started_at);
      if(hintDue)current.hintStart=Number(row!.phase_started_at);
      if(row&&(Number(row.version)!==current.version||due||hintDue)){current.version=Number(row.version);current.listeners.forEach(fn=>fn());}
    }catch{current.listeners.forEach(fn=>fn());}
    if(!current.stopped)current.timer=setTimeout(poll,250);};void poll();
  }
  hub.listeners.add(listener);const current=hub;
  return()=>{current.listeners.delete(listener);if(!current.listeners.size){current.stopped=true;if(current.timer)clearTimeout(current.timer);hubs.delete(roomId);}};
}
export async function GET(req:NextRequest){
  const roomId=req.nextUrl.searchParams.get('roomId')||'';const auth=req.headers.get('x-game-token')||'';
  let initial:Record<string,unknown>;try{initial=await getState(roomId,auth);}catch(error){const status=gameErrorStatus(error);return new Response(status===401?'Phiên chơi không hợp lệ.':'Chưa kết nối được phòng. Đang thử lại…',{status});}
  const encoder=new TextEncoder();let closeStream=()=>{};
  const stream=new ReadableStream<Uint8Array>({start(controller){
    let closed=false;let pending=false;let dirty=false;let previous=initial;let personalTimer:ReturnType<typeof setTimeout>|null=null;
    const emit=(event:string,data:unknown)=>{if(!closed)controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));};
    const schedulePersonal=(state:Record<string,unknown>)=>{if(personalTimer)clearTimeout(personalTimer);personalTimer=null;const p=state.personal as {stage:string;mediaStartsAt:number;listenEndsAt:number;answerEndsAt:number}|null;const end=p?.stage==='PREPARE'?p.mediaStartsAt:p?.stage==='LISTEN'?p.listenEndsAt:p?.stage==='ANSWER'?p.answerEndsAt:null;if(state.pausedAt===null&&end!==null)personalTimer=setTimeout(()=>{void update();},Math.max(20,end-Date.now()+15));};
    const update=async()=>{if(closed)return;if(pending){dirty=true;return;}pending=true;try{
      const next=await getState(roomId,auth);const patch:Record<string,unknown>={};
      for(const [key,value] of Object.entries(next))if(key==='serverNow'||JSON.stringify(value)!==JSON.stringify(previous[key]))patch[key]=value;
      if(Object.keys(patch).some(key=>key!=='serverNow'))emit('patch',patch);previous=next;schedulePersonal(next);
    }catch{closeStream();}finally{pending=false;if(dirty){dirty=false;void update();}}};
    const unwatch=watch(roomId,()=>{void update();});
    const heartbeat=setInterval(()=>{void update();},10000);const limit=setTimeout(()=>closeStream(),120000);
    closeStream=()=>{if(closed)return;closed=true;unwatch();clearInterval(heartbeat);clearTimeout(limit);if(personalTimer)clearTimeout(personalTimer);req.signal.removeEventListener('abort',closeStream);try{controller.close();}catch{}};
    emit('state',initial);schedulePersonal(initial);req.signal.addEventListener('abort',closeStream,{once:true});if(req.signal.aborted)closeStream();
  },cancel(){closeStream();}});
  return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform',Connection:'keep-alive','X-Accel-Buffering':'no'}});
}
