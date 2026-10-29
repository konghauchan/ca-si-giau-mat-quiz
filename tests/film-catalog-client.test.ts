import test from 'node:test';
import assert from 'node:assert/strict';
import {primeFilmCatalog,cachedFilmMatches,subscribeFilmCatalog} from '../src/lib/filmCatalogClient.ts';
test('film preloading pins its version, retries changed snapshots and reuses the completed index',async()=>{
  const original=globalThis.fetch;let calls=0,changing=true,notifications=0;
  const unsubscribe=subscribeFilmCatalog(()=>notifications++);
  const film={id:'00000000-0000-5000-8000-000000000001',title:'Bố già',originalTitle:'Dad, I’m Sorry',year:2021,kind:'MOVIE',aliases:[],directors:[],cast:[],countries:['Q881'],rank:1,source:{provider:'Wikidata',id:'Q1'},token:'test-token'};
  globalThis.fetch=async(url,options)=>{
    calls++;assert.equal(new Headers(options?.headers).get('x-game-token'),'player');
    const params=new URL(String(url),'http://localhost').searchParams;assert.equal(params.get('roomId'),'room');
    const offset=Number(params.get('offset'));
    if(changing&&offset>0){assert.equal(params.get('version'),'v1');return Response.json({version:'v2',items:[],nextOffset:null});}
    const items=changing?[film]:Array.from({length:45},(_,i)=>({...film,id:String(i),cast:['A shared actor']}));
    return Response.json({version:changing?'v1':'v2',items,nextOffset:changing?1:null});
  };
  try{
    await assert.rejects(primeFilmCatalog({roomId:'room',gameToken:'player'}),/thay đổi/);
    changing=false;await primeFilmCatalog({roomId:'room',gameToken:'player'});
    assert.equal(cachedFilmMatches('bo gia')[0].id,'0');assert.equal(cachedFilmMatches('Dad Im')[0].id,'0');
    assert.equal(cachedFilmMatches('A shared actor').length,30);
    assert.equal(cachedFilmMatches('A shared actor','ALL',31).length,31);
    assert.equal(cachedFilmMatches('A shared actor','ALL',60).length,45);
    const before=calls;await primeFilmCatalog({roomId:'room',gameToken:'player'});assert.equal(calls,before);assert.ok(notifications>=2);
  }finally{globalThis.fetch=original;unsubscribe();}
});
