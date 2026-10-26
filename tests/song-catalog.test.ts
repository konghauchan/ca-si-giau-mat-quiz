import test from 'node:test';
import assert from 'node:assert/strict';
import {indexSongs,matchSongs} from '../src/lib/songCatalog.ts';
import {cachedSongMatches,primeSongCatalog,rememberSongs} from '../src/lib/musicCatalogClient.ts';
import type {SongSuggestion} from '../src/lib/musicSearch.ts';
const song=(id:string,title:string,performers:string[]=[]):SongSuggestion=>({id,title,performers,scope:'VI',token:'signed-'+id,detail:''});
test('downloaded catalog matches unaccented title or performer and prefers exact titles',()=>{
  const index=indexSongs([song('1','Biển nhớ',['Trịnh Công Sơn']),song('2','Biển nhớ em',['Test singer']),song('3','Bài khác',['Biển Nhớ']),song('4','Ru em từng ngón xuân nồng',['Trịnh Công Sơn'])]);
  assert.deepEqual(matchSongs(index,'bien nho').map(item=>item.id),['1','2','3']);
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

