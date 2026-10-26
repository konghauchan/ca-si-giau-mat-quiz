import test from 'node:test';
import assert from 'node:assert/strict';
import {musicBrainzQuery,musicBrainzRecordingQuery,musicSearchCacheKey,findMusicBrainzSongs,scopedWorks} from '../src/lib/musicSearch.ts';
import {signSong,readSong} from '../src/lib/songToken.ts';
const id='00000000-0000-4000-8000-000000000001';
test('music search uses lyric language, escapes query operators and requires all words',()=>{
  assert.equal(musicBrainzQuery('Nơi này','VI'),'(work:(noi* AND nay*) OR alias:(noi* AND nay*)) AND lang:vie');
  const query=musicBrainzQuery('hello OR lang:vie','US_UK');
  assert.match(query,/AND lang:eng AND NOT lang:vie$/);assert.doesNotMatch(query,/country:/);assert.doesNotMatch(query,/OR lang:vie/);
});
test('language filters reject unknown and foreign works even if provider returns them',()=>{
  const works=[{id,title:'Việt',type:'Song',languages:['vie']},{id:id.replace(/1$/,'2'),title:'English',language:'eng'},{id:id.replace(/1$/,'3'),title:'Unknown'},{id:id.replace(/1$/,'4'),title:'Mixed',languages:['eng','vie']},{id:id.replace(/1$/,'5'),title:'Korean',language:'kor'}];
  assert.deepEqual(scopedWorks(works,'VI').map(w=>w.title),['Việt','Mixed']);assert.deepEqual(scopedWorks(works,'US_UK').map(w=>w.title),['English']);
});
test('work credits are labeled as authors; duplicate works and non-song types are removed',()=>{
  const work={id,title:'Bài hát',language:'vie',relations:[{type:'composer',artist:{name:'Tác giả A'}},{type:'lyricist',artist:{name:'Tác giả A'}}]};
  const result=scopedWorks([work,work,{...work,id:id.replace(/1$/,'2'),type:'Symphony'}],'VI');assert.equal(result.length,1);assert.equal(result[0].detail,'Tác giả: Tác giả A');
});
test('signed choices preserve Unicode and reject changed title, scope or signature',()=>{
  const song={id,title:'Nơi này có anh',scope:'VI' as const,detail:''};const token=signSong(song,'secret');assert.deepEqual(readSong(token,'secret'),{id,title:song.title,scope:'VI'});
  assert.throws(()=>readSong(token,'wrong'));const payload=Buffer.from(JSON.stringify({...song,scope:'US_UK'})).toString('base64url');assert.throws(()=>readSong(payload+'.'+token.split('.')[1],'secret'));assert.throws(()=>readSong('a'.repeat(1201),'secret'));
});
test('song and performer query is separate from lyric language filtering',()=>{
  assert.equal(musicBrainzRecordingQuery('Sơn Tùng'),'(recording:(son* AND tung*) OR artist:(son* AND tung*)^5 OR artistname:(son* AND tung*)^5)');
  assert.match(musicBrainzQuery('Adele','US_UK',[id,'bad OR lang:vie']),new RegExp('rid:'+id));
  assert.doesNotMatch(musicBrainzQuery('Adele','US_UK',[id,'bad OR lang:vie']),/bad OR/);
  assert.notEqual(musicSearchCacheKey('Adele','VI'),musicSearchCacheKey('Adele','US_UK'));
  assert.notEqual(musicSearchCacheKey('Adele','VI'),'VI:adele');
});
test('two-step performer lookup keeps work IDs and never confuses composers with singers',async()=>{
  const calls:string[]=[];const work={id,title:'Hello',language:'eng',relations:[{type:'composer',artist:{name:'Composer only'}},{type:'performance',recording:{id:'00000000-0000-4000-8000-000000000009'}}]};
  const found=await findMusicBrainzSongs('Adele','US_UK',async(entity,query)=>{
    calls.push(entity);if(entity==='recording'){assert.match(query,/artist:/);return {recordings:[{id:'00000000-0000-4000-8000-000000000009','artist-credit':[{name:'Adele',artist:{name:'Adele Adkins'}}]}]};}
    assert.match(query,/rid:00000000-0000-4000-8000-000000000009/);assert.match(query,/lang:eng AND NOT lang:vie$/);
    return {works:[work,{...work,id:id.replace(/1$/,'2'),language:'vie'},{...work,id:id.replace(/1$/,'3'),language:undefined}]};
  });
  assert.deepEqual(calls,['recording','work']);assert.equal(found.length,1);assert.equal(found[0].id,id);assert.deepEqual(found[0].performers,['Adele']);assert.match(found[0].detail,/Tác giả: Composer only/);
});
test('missing performer credits stay unknown, while multiple linked singers are deduplicated',()=>{
  const recordings=[{id,'artist-credit':[{artist:{name:'Singer A'}}]},{id:id.replace(/1$/,'2'),'artist-credit':[{name:'Singer A'},{name:'Singer B'}]}];
  const works=[{id,title:'Known',language:'eng',relations:[{type:'performance',recording:{id}},{type:'performance',recording:{id:id.replace(/1$/,'2')}}]},{id:id.replace(/1$/,'3'),title:'Unknown',language:'eng'}];
  const found=scopedWorks(works,'US_UK',recordings);assert.deepEqual(found[0].performers,['Singer A','Singer B']);assert.deepEqual(found[1].performers,[]);
});
