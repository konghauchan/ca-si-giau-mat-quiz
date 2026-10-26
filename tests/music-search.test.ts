import test from 'node:test';
import assert from 'node:assert/strict';
import {musicBrainzQuery,scopedWorks} from '../src/lib/musicSearch.ts';
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
