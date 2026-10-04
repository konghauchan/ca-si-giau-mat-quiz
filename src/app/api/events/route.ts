import { NextRequest } from 'next/server';
import { getState } from '@/lib/game';
import { one } from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
type Watcher=()=>void;
type Hub={listeners:Set<Watcher>; version:number; timer:ReturnType<typeof setTimeout>|null; stopped:boolean};
const hubs=new Map<string,Hub>();
// Share lightweight change probes within a function instance. No full snapshot
// reads or write transaction while a room is idle. Each stream expires in 20s.
function watch(roomId:string,listener:Watcher) {
  let hub=hubs.get(roomId);
  if(!hub){hub={listeners:new Set(),version:-1,timer:null,stopped:false};hubs.set(roomId,hub);
    const current=hub;
    const poll=async()=>{if(current.stopped)return; try{
      const row=await one('SELECT phase_ends_at,paused_at,(SELECT COALESCE(MAX(id),0) FROM game_events WHERE room_id=rooms.id) AS version FROM rooms WHERE id=?',roomId);
      const due=row?.paused_at===null&&row.phase_ends_at!==null&&Number(row.phase_ends_at)<=Date.now();
      if(row&&(Number(row.version)!==current.version||due)){current.version=Number(row.version);current.listeners.forEach(fn=>fn());}
    }catch{current.listeners.forEach(fn=>fn());}
    if(!current.stopped)current.timer=setTimeout(poll,250);};void poll();
  }
  hub.listeners.add(listener);const current=hub;
  return()=>{current.listeners.delete(listener);if(!current.listeners.size){current.stopped=true;if(current.timer)clearTimeout(current.timer);hubs.delete(roomId);}};
}
export async function GET(req:NextRequest){
  const roomId=req.nextUrl.searchParams.get('roomId')||'';const auth=req.headers.get('x-game-token')||'';
  let initial:Record<string,unknown>;try{initial=await getState(roomId,auth);}catch{return new Response('Không có quyền truy cập phòng.',{status:401});}
  const encoder=new TextEncoder();let closeStream=()=>{};
  const stream=new ReadableStream<Uint8Array>({start(controller){
    let closed=false;let pending=false;let dirty=false;let previous=initial;
    const emit=(event:string,data:unknown)=>{if(!closed)controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));};
    const update=async()=>{if(closed)return;if(pending){dirty=true;return;}pending=true;try{
      const next=await getState(roomId,auth);const patch:Record<string,unknown>={};
      for(const [key,value] of Object.entries(next))if(key==='serverNow'||JSON.stringify(value)!==JSON.stringify(previous[key]))patch[key]=value;
      if(Object.keys(patch).some(key=>key!=='serverNow'))emit('patch',patch);previous=next;
    }catch{closeStream();}finally{pending=false;if(dirty){dirty=false;void update();}}};
    const unwatch=watch(roomId,()=>{void update();});
    const heartbeat=setInterval(()=>{void update();},10000);const limit=setTimeout(()=>closeStream(),20000);
    closeStream=()=>{if(closed)return;closed=true;unwatch();clearInterval(heartbeat);clearTimeout(limit);req.signal.removeEventListener('abort',closeStream);try{controller.close();}catch{}};
    emit('state',initial);req.signal.addEventListener('abort',closeStream,{once:true});if(req.signal.aborted)closeStream();
  },cancel(){closeStream();}});
  return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform',Connection:'keep-alive','X-Accel-Buffering':'no'}});
}
