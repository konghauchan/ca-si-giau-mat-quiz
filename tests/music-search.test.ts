import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {musicBrainzQuery,musicBrainzRecordingQuery,musicBrainzArtistQuery,musicBrainzArtistFallbackQuery,matchingArtist,musicSearchCacheKey,findMusicBrainzSongs,scopedWorks,hasStrongSongMatch} from '../src/lib/musicSearch.ts';
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
test('artist prefix lookup resolves identity, keeps work IDs and never confuses composers with singers',async()=>{
  const calls:string[]=[];const work={id,title:'Hello',language:'eng',relations:[{type:'composer',artist:{name:'Composer only'}},{type:'performance',recording:{id:'00000000-0000-4000-8000-000000000009'}}]};
  const found=await findMusicBrainzSongs('Adele','US_UK',async(entity,query)=>{
    calls.push(entity);if(entity==='artist')return {artists:[{id,name:'Adele',score:100}]};if(entity==='recording'){assert.equal(query,'arid:'+id);return {recordings:[{id:'00000000-0000-4000-8000-000000000009','artist-credit':[{name:'Adele',artist:{name:'Adele Adkins'}}]}]};}
    assert.match(query,/rid:00000000-0000-4000-8000-000000000009/);assert.match(query,/lang:eng AND NOT lang:vie$/);
    return {works:[work,{...work,id:id.replace(/1$/,'2'),language:'vie'},{...work,id:id.replace(/1$/,'3'),language:undefined}]};
  });
  assert.deepEqual(calls,['artist','recording','work']);assert.equal(found.length,1);assert.equal(found[0].id,id);assert.deepEqual(found[0].performers,['Adele']);assert.match(found[0].detail,/Tác giả: Composer only/);
});
test('covers do not become a fake duet; a recording with a real duet retains both credits',()=>{
  const recordings=[{id,'artist-credit':[{artist:{name:'Singer A'}}]},{id:id.replace(/1$/,'2'),'artist-credit':[{name:'Singer A'},{name:'Singer B'}]}];
  const works=[{id,title:'Known',language:'eng',relations:[{type:'performance',recording:{id}},{type:'performance',recording:{id:id.replace(/1$/,'2')}}]},{id:id.replace(/1$/,'3'),title:'Unknown',language:'eng'}];
  const found=scopedWorks(works,'US_UK',recordings);assert.deepEqual(found[0].performers,['Singer A']);assert.deepEqual(found[1].performers,[]);
  assert.deepEqual(scopedWorks([{...works[0],relations:[works[0].relations![1]]}],'US_UK',recordings)[0].performers,['Singer A','Singer B']);
});

test('artist prefixes tolerate possessives and spacing, with higher relevance winning',()=>{
  const artists=[{id,name:'Backstreet Girls',score:77},{id:id.replace(/1$/,'2'),name:'Backstreet Boys',score:100}];
  for(const query of ['backstreet','backst',"backstreet's boy",'back street'])assert.equal(matchingArtist(artists,query)?.name,'Backstreet Boys');
  assert.equal(matchingArtist(artists,'as long as you'),undefined);
  assert.match(musicBrainzArtistFallbackQuery('back street'),/artist:backstreet\*/);
  assert.doesNotMatch(musicBrainzArtistQuery("backstreet's boy"),/s\*/);
});
test('song-title fallback still searches title and returns a scrollable list beyond eight works',async()=>{
  const works=Array.from({length:25},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),title:'Title '+i,language:'eng'}));
  const calls:string[]=[];
  const found=await findMusicBrainzSongs('a partial title','US_UK',async(entity,query,limit)=>{
    calls.push(entity);if(entity==='artist')return {artists:[]};
    if(entity==='recording'){assert.match(query,/recording:/);assert.equal(limit,100);return {recordings:[]};}
    assert.match(query,/work:/);return {works};
  });
  assert.deepEqual(calls,['artist','artist','recording','work']);assert.equal(found.length,20);
});

test('real MusicBrainz Backstreet metadata returns twenty songs from a partial artist name',async()=>{
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/backstreet-search.json',import.meta.url),'utf8'));
  const found=await findMusicBrainzSongs('backstreet','US_UK',async(entity,query)=>{
    if(entity==='artist')return {artists:fixture.artists};
    if(entity==='recording'){assert.equal(query,'arid:2f569e60-0a1b-4fb9-95a4-3dc1525d1aad');return {recordings:fixture.recordings};}
    return {works:fixture.works};
  });
  assert.equal(found.length,20);assert.equal(new Set(found.map(s=>s.id)).size,20);
  for(const title of ['As Long as You Love Me','I Want It That Way','Larger Than Life','All I Have to Give'])assert.deepEqual(found.find(s=>s.title===title)?.performers,['Backstreet Boys']);
});

test('Rihana is recognized as Rihanna without hardcoded artist IDs',()=>{
  const artist={id,name:'Rihanna',score:100};
  assert.equal(matchingArtist([artist],'rihana')?.name,'Rihanna');
  assert.match(musicBrainzArtistFallbackQuery('rihana'),/artist:\(rihana~1\)/);
  assert.equal(matchingArtist([artist],'justin bieber'),undefined);
});

test('exact Vietnamese alias beats a higher-scored fuzzy foreign artist',()=>{
  const artists=[{id,name:'Denny Vaughn',score:100},{id:id.replace(/1$/,'2'),name:'Đen',aliases:[{name:'Đen Vâu'}],score:77}];
  assert.equal(matchingArtist(artists,'Đen Vâu')?.name,'Đen');
  assert.equal(matchingArtist([artists[0]],'Đen Vâu'),undefined);
  assert.match(musicBrainzArtistQuery('Đen Vâu'),/alias:"den vau"/);
});
test('Da LAB does not mean Daly and Labyrinth even with a high provider score',()=>{
  const wrong={id,name:'Ross Daly & Labyrinth',score:100};
  const right={id:id.replace(/1$/,'2'),name:'Da LAB',score:70};
  assert.equal(matchingArtist([wrong,right],'Da LAB')?.name,'Da LAB');
  assert.equal(matchingArtist([wrong],'Da LAB'),undefined);
});
test('a matching title alone never completes an artist search',()=>{
  const song={id,title:'Queen of My Heart',scope:'US_UK' as const,detail:'',performers:['Westlife']};
  assert.equal(hasStrongSongMatch([song],'Queen'),false);
  assert.equal(hasStrongSongMatch([{...song,title:'Queen'}],'Queen'),false);
  assert.equal(hasStrongSongMatch([song],'Westlife'),true);
  assert.equal(hasStrongSongMatch([{...song,performers:['Đen'],artistAliases:['Đen Vâu']}],'den vau'),true);
});
test('missing scoped works produce an accurate diagnostic rather than invented answer IDs',async()=>{
  const missing:Array<[string,number]>=[];
  const result=await findMusicBrainzSongs('Sơn Tùng M-TP','VI',async(entity)=>entity==='artist'?{artists:[{id,name:'Sơn Tùng M-TP'}]}:entity==='recording'?{recordings:[{id,title:'Bài tiếng Việt','artist-credit':[{name:'Sơn Tùng M-TP'}]}]}:{works:[{id,title:'English work',language:'eng'}]},(artist,count)=>missing.push([artist,count]));
  assert.deepEqual(result,[]);assert.deepEqual(missing,[['Sơn Tùng M-TP',1]]);
});

test('Queen uses the exact query before any prefix/fuzzy query can override the artist',async()=>{
  assert.equal(musicBrainzArtistQuery('Queen'),'(artist:"queen" OR alias:"queen")');
  let artists=0;
  const found=await findMusicBrainzSongs('Queen','US_UK',async(entity,query)=>{
    if(entity==='artist'){artists++;return {artists:[{id,name:'Queen',score:100}]};}
    if(entity==='recording'){assert.equal(query,'arid:'+id);return {recordings:[{id,title:'Bohemian Rhapsody','artist-credit':[{name:'Queen'}]}]};}
    assert.doesNotMatch(query,/work:queen/);return {works:[{id,title:'Bohemian Rhapsody',language:'eng',relations:[{type:'performance',recording:{id}}]}]};
  });
  assert.equal(artists,1);assert.deepEqual(found[0].performers,['Queen']);
});
