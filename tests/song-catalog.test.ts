import test from 'node:test';
import assert from 'node:assert/strict';
import {indexSongs,matchSongs} from '../src/lib/songCatalog.ts';
import {cachedSongMatches,primeSongCatalog,rememberSongs,subscribeSongCatalog} from '../src/lib/musicCatalogClient.ts';
import type {SongSuggestion} from '../src/lib/musicSearch.ts';
const song=(id:string,title:string,performers:string[]=[]):SongSuggestion=>({id,title,performers,scope:'VI',token:'signed-'+id,detail:''});
test('downloaded catalog matches unaccented title or performer and prefers exact titles',()=>{
  const index=indexSongs([song('1','Biển nhớ',['Trịnh Công Sơn']),song('2','Biển nhớ em',['Test singer']),song('3','Bài khác',['Biển Nhớ']),song('4','Ru em từng ngón xuân nồng',['Trịnh Công Sơn'])]);
  assert.deepEqual(matchSongs(index,'bien nho').map(item=>item.id),['1','3','2']);
  assert.deepEqual(matchSongs(index,'trinh cong son').map(item=>item.id),['1','4']);
  assert.equal(matchSongs(index,'b').length,0);assert.equal(matchSongs(index,'unknown').length,0);
});
test('same work is not duplicated, cross-scope results are ignored and preload is shared',async()=>{
  const original=globalThis.fetch;let calls=0;
  try {
    globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({scope:'VI',items:[song('a','Tên bài',['Ca sĩ Việt'])]}));};
    await Promise.all(Array.from({length:30},()=>primeSongCatalog('VI',{roomId:'room',gameToken:'player'})));
    assert.equal(calls,1);assert.equal(cachedSongMatches('VI','ca si viet')[0].id,'a');
    rememberSongs('VI',[song('a','Tên bài đã cập nhật',['Ca sĩ Việt']),{...song('b','Foreign'),scope:'US_UK'}]);
    assert.equal(cachedSongMatches('VI','cap nhat').length,1);assert.equal(cachedSongMatches('VI','foreign').length,0);
    await primeSongCatalog('VI');assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});

test('partial artist, possessive and spaced typing all list songs without a complete name',()=>{
  const entries=Array.from({length:24},(_,i)=>({...song('backstreet-'+i,'Song '+i,['Backstreet Boys']),scope:'US_UK' as const}));
  const index=indexSongs([...entries,song('other','Unrelated song',['Unrelated artist'])]);
  for(const query of ['backstreet','backst',"backstreet's boy",'back street']){
    const matches=matchSongs(index,query);assert.equal(matches.length,20);assert.ok(matches.every(item=>item.performers?.includes('Backstreet Boys')));
  }
  assert.equal(matchSongs(index,'Song 12')[0].id,'backstreet-12');
  assert.equal(matchSongs(index,'something else').length,0);
});


test('a loaded artist can be found with one missing letter without another API call',()=>{
  const index=indexSongs([song('r1','Umbrella',['Rihanna']),song('r2','Diamonds',['Rihanna']),song('j1','Baby',['Justin Bieber'])]);
  assert.deepEqual(matchSongs(index,'rihana').map(song=>song.id),['r2','r1']);
  assert.equal(matchSongs(index,'justin bieber')[0].title,'Baby');
  assert.equal(matchSongs(index,'entirely unknown').length,0);
});

test('artist matches rank ahead of partial song titles and aliases remain searchable',()=>{
  const index=indexSongs([song('w','Queen of My Heart',['Westlife']),song('q','Bohemian Rhapsody',['Queen']),{...song('d','Lối nhỏ',['Đen']),artistAliases:['Đen Vâu']},song('c','Yellow',['Coldplay']),song('j','Cold Water',['Justin Bieber'])]);
  assert.deepEqual(matchSongs(index,'queen').map(song=>song.id),['q','w']);
  assert.deepEqual(matchSongs(index,'cold').map(song=>song.id),['c','j']);
  assert.equal(matchSongs(index,'den vau')[0].id,'d');
  assert.equal(matchSongs(indexSongs([song('wrong','Foreign song',['Denny Vaughn'])]),'den vau').length,0);
});

test('20,000 songs load progressively through shared pages and remain searchable beyond 5,000',async()=>{
  const original=globalThis.fetch;let calls=0,updates=0;
  const unsubscribe=subscribeSongCatalog('US_UK',()=>updates++);
  try {
    globalThis.fetch=async(input,options)=>{
      const url=new URL(String(input),'https://example.test');
      const offset=Number(url.searchParams.get('offset'));calls++;
      assert.equal(url.searchParams.get('roomId'),'bulk-room');
      assert.equal(new Headers(options?.headers).get('x-game-token'),'bulk-player');
      const items=Array.from({length:1000},(_,i)=>({...song('bulk-'+(offset+i),'Catalog track '+(offset+i),['Catalog artist '+(offset+i)]),scope:'US_UK'}));
      if(offset===1000)assert.equal(cachedSongMatches('US_UK','Catalog track 999')[0].id,'bulk-999','first page is usable before the rest arrives');
      return new Response(JSON.stringify({scope:'US_UK',items,total:20000,nextOffset:offset+1000<20000?offset+1000:null}));
    };
    await Promise.all(Array.from({length:30},()=>primeSongCatalog('US_UK',{roomId:'bulk-room',gameToken:'bulk-player'})));
    assert.equal(calls,20);assert.equal(updates,20);
    assert.equal(cachedSongMatches('US_UK','Catalog track 0')[0].id,'bulk-0');
    assert.equal(cachedSongMatches('US_UK','Catalog track 19999')[0].id,'bulk-19999');
    assert.equal(cachedSongMatches('US_UK','Catalog artist 19999')[0].id,'bulk-19999');
    assert.equal(cachedSongMatches('VI','Catalog track 19999').length,0);
    unsubscribe();rememberSongs('US_UK',[{...song('bulk-extra','An additional song'),scope:'US_UK'}]);assert.equal(updates,20);
  }finally{unsubscribe();globalThis.fetch=original;}
});
