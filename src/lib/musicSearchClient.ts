import type {SongSuggestion} from './musicSearch.ts';
function pause(ms:number,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{
  if(signal.aborted){reject(signal.reason);return;}
  const abort=()=>{clearTimeout(timer);reject(signal.reason);};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
  signal.addEventListener('abort',abort,{once:true});
});}
// A shared provider lease is pending work, not an empty list or a failed answer.
// Bound retries and honor cancellation so an old question cannot keep polling.
export async function loadSongMatches(url:string,headers:HeadersInit,signal:AbortSignal,onPending:()=>void,options:{fetch?:typeof fetch;pause?:typeof pause;now?:()=>number;maxWaitMs?:number}={}):Promise<SongSuggestion[]> {
  const request=options.fetch||fetch,wait=options.pause||pause,now=options.now||Date.now;
  const deadline=now()+(options.maxWaitMs??20000);
  for(;;){
    signal.throwIfAborted();
    const response=await request(url,{headers,signal,cache:'no-store'});const data=await response.json();
    if(response.status===202&&data.pending===true){
      onPending();const delay=Math.min(5000,Math.max(1000,Number(data.retryAfter)*1000||2000));
      if(now()+delay>=deadline)throw new Error('Danh mục của ca sĩ này chưa tải kịp. Hãy thử lại sau ít giây.');
      await wait(delay,signal);continue;
    }
    if(!response.ok)throw new Error(data.error||'Chưa tìm được bài hát.');
    if(!Array.isArray(data.items))throw new Error('Danh sách bài hát không hợp lệ.');
    return data.items;
  }
}
