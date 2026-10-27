import {defaultSongs,defaultSongMatches} from '../src/lib/defaultSongCatalog.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {requestMusicMetadata,MusicSearchPending,type MusicMetadata} from '../src/lib/musicProvider.ts';
import {loadSongMatches} from '../src/lib/musicSearchClient.ts';
function storage(){
  let clock=10000,nextAt=0,owner='',calls=0;
  const cache=new Map<string,{data:MusicMetadata;expires:number}>();
  const starts:number[]=[];
  const store={
    now:()=>clock,
    read:async(key:string,now:number)=>{const hit=cache.get(key);return hit&&hit.expires>now?hit.data:undefined;},
    claim:async(lease:string,expires:number,now:number)=>{if(nextAt>now)return false;owner=lease;nextAt=expires;return true;},
    write:async(key:string,data:MusicMetadata,expires:number)=>{cache.set(key,{data,expires});},
    release:async(lease:string,next:number)=>{if(owner===lease)nextAt=next;},
    fetch:(async()=>{calls++;starts.push(clock);return new Response(JSON.stringify({artists:[{id:'artist',name:'Justin Bieber'}]}));}) as typeof fetch,
  };
  return {store,cache,starts,advance:(ms:number)=>clock+=ms,calls:()=>calls,nextAt:()=>nextAt};
}
test('thirty cold readers share persisted metadata, and a second name waits without an empty result',async()=>{
  const state=storage();
  const first=await Promise.allSettled(Array.from({length:30},()=>requestMusicMetadata('artist','justin*',5,state.store)));
  assert.ok(first.every(result=>result.status==='fulfilled'||result.reason instanceof MusicSearchPending));
  assert.equal(state.calls(),1);
  const same=await Promise.all(Array.from({length:30},()=>requestMusicMetadata('artist','justin*',5,state.store)));
  assert.ok(same.every(data=>data.artists?.[0].name==='Justin Bieber'));assert.equal(state.calls(),1);
  await assert.rejects(requestMusicMetadata('artist','rihana~1',5,state.store),MusicSearchPending);
  assert.equal(state.calls(),1);state.advance(1100);
  await requestMusicMetadata('artist','rihana~1',5,state.store);assert.equal(state.calls(),2);
  assert.ok(state.starts[1]-state.starts[0]>=1100);
});
test('provider 503 sets a shared cooldown without caching a false empty list',async()=>{
  const state=storage();let calls=0;state.store.fetch=async()=>{calls++;return new Response('busy',{status:503});};
  await assert.rejects(requestMusicMetadata('artist','rihana~1',5,state.store),error=>error instanceof MusicSearchPending&&error.retryAfter===5);
  assert.equal(state.cache.size,0);state.advance(4999);
  await assert.rejects(requestMusicMetadata('artist','other',5,state.store),MusicSearchPending);assert.equal(calls,1);
  state.advance(1);state.store.fetch=async()=>new Response(JSON.stringify({artists:[{name:'Rihanna'}]}));
  assert.equal((await requestMusicMetadata('artist','rihana~1',5,state.store)).artists?.[0].name,'Rihanna');
});
test('timeout releases the lease and invalid metadata never enters the cache',async()=>{
  const state=storage();state.store.fetch=async()=>{throw new DOMException('timeout','TimeoutError');};
  await assert.rejects(requestMusicMetadata('artist','query',5,state.store),MusicSearchPending);
  assert.equal(state.nextAt(),12000);state.advance(2000);
  state.store.fetch=async()=>new Response(JSON.stringify({works:[]}));
  await assert.rejects(requestMusicMetadata('artist','query',5,state.store),/không hợp lệ/);assert.equal(state.cache.size,0);
});
test('pending search updates automatically and returns the eventual signed choices',async()=>{
  let calls=0,waiting=0,clock=0;const delays:number[]=[];const signal=new AbortController().signal;
  const found=await loadSongMatches('/api/music/search?q=justin',{},signal,()=>waiting++,{
    now:()=>clock,fetch:async()=>++calls<3?new Response(JSON.stringify({pending:true,retryAfter:2}),{status:202}):new Response(JSON.stringify({items:[{id:'work',token:'signed'}]})),
    pause:async(ms)=>{delays.push(ms);clock+=ms;},
  });
  assert.equal(found[0].token,'signed');assert.equal(waiting,2);assert.deepEqual(delays,[2000,2000]);assert.equal(calls,3);
});
test('pending retries are bounded and aborted questions never poll again',async()=>{
  let clock=0,calls=0;const controller=new AbortController();
  const pending=async()=>{calls++;return new Response(JSON.stringify({pending:true,retryAfter:2}),{status:202});};
  await assert.rejects(loadSongMatches('/search',{},controller.signal,()=>{},{now:()=>clock,maxWaitMs:3000,fetch:pending,pause:async(ms)=>{clock+=ms;}}),/chưa tải kịp/);assert.equal(calls,2);
  calls=0;await assert.rejects(loadSongMatches('/search',{},controller.signal,()=>{},{fetch:pending,pause:async()=>controller.abort()}));assert.equal(calls,1);
});

test('public starter catalog finds Justin Bieber and misspelled Rihanna without the provider',()=>{
  for(const query of ['justin bieber','justin','rihana','rihanna','backstreet']){
    const matches=defaultSongMatches(query,'US_UK');assert.ok(matches.length>=10,query);
    assert.ok(matches.every(song=>song.scope==='US_UK'&&/^[a-f0-9-]{36}$/i.test(song.id)));
    assert.ok(matches.every(song=>!('token' in song)));
    // A Vietnamese song may legitimately have an English title containing the
    // query (e.g. Backstreet Man); test scope rather than assuming no such title.
    assert.ok(defaultSongMatches(query,'VI').every(song=>song.scope==='VI'));
  }
  assert.equal(new Set(defaultSongs.map(song=>song.id)).size,defaultSongs.length);
});

test('metadata gaps keep the server diagnostic through the client response',async()=>{
  let notice='';const items=await loadSongMatches('/search',{},new AbortController().signal,()=>{},{fetch:async()=>new Response(JSON.stringify({items:[],notice:'Thiếu liên kết tác phẩm'})),onNotice:value=>notice=value});
  assert.deepEqual(items,[]);assert.equal(notice,'Thiếu liên kết tác phẩm');
});
