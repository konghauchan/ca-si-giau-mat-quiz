'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from './client';
type Versioned={lastEventId?:number;serverNow?:number};
export function useRoomState<T extends Versioned>(roomId:string,token:string){
  const [state,setState]=useState<T|null>(null);const [connectionError,setConnectionError]=useState('');const [error,setError]=useState('');const current=useRef<T|null>(null);
  const accept=(next:T)=>{if(current.current&&Number(next.lastEventId)<Number(current.current.lastEventId))return;current.current=next;setState(next);};
  const acceptRef=useRef(accept);acceptRef.current=accept;
  useEffect(()=>{if(!token){setConnectionError('Không tìm thấy phiên chơi. Hãy vào phòng lại.');return;}
    const abort=new AbortController();let timer:ReturnType<typeof setTimeout>;let failures=0;
    const connect=async()=>{try{
      const response=await fetch(`/api/events?roomId=${encodeURIComponent(roomId)}`,{headers:{'x-game-token':token},signal:abort.signal,cache:'no-store'});
      if(!response.ok||!response.body)throw new Error('Không kết nối được phòng chơi.');
      failures=0;setConnectionError('');const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
      while(!abort.signal.aborted){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});let split;
        while((split=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,split);buffer=buffer.slice(split+2);const event=frame.match(/^event: (.+)$/m)?.[1];const raw=frame.match(/^data: (.+)$/m)?.[1];if(!raw)continue;const data=JSON.parse(raw);if(event==='state')acceptRef.current(data);else if(event==='patch'&&current.current)acceptRef.current({...current.current,...data});}
      }
    }catch(e){if(abort.signal.aborted)return;failures++;setConnectionError((e as Error).message+' Đang kết nối lại…');
      // Sequential fallback only after a failed stream; no second polling loop.
      try{acceptRef.current(await api<T>(`/api/state?roomId=${roomId}`,{token,signal:AbortSignal.any([abort.signal,AbortSignal.timeout(10000)])}));}catch{}
    }
    if(!abort.signal.aborted)timer=setTimeout(connect,failures?Math.min(5000,500*failures):100);
    };void connect();return()=>{abort.abort();clearTimeout(timer);};
  },[roomId,token]);
  return {state,setState:(next:T)=>acceptRef.current(next),error:error||connectionError,setError};
}
