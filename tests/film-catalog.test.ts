import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { indexFilms, matchFilms, type FilmWork } from '../src/lib/filmCatalog.ts';
import { signFilm, readFilm } from '../src/lib/filmToken.ts';
import { signSong, readSong } from '../src/lib/songToken.ts';
import { importFilmLibrary, prepareFilmLibrary, readFilmLibrary } from '../src/lib/filmLibraryStore.ts';
import { narrationText } from '../src/lib/narrationText.ts';
const film = (title:string,year=1997,kind:'MOVIE'|'SERIES'='MOVIE'):FilmWork=>({id:randomUUID(),title,year,kind,originalTitle:title,aliases:[],directors:['James Cameron'],cast:['Kate Winslet','Leonardo DiCaprio'],countries:['Q30'],rank:20,source:{provider:'Wikidata',id:'Q1'}});

test('film search supports prefixes, unaccented aliases, actors, directors, years and kind without merging remakes',()=>{
  const a=film('Titanic'),b=film('Titanic',1953),c={...film('Bố già',2021),aliases:['Bo Gia'],originalTitle:'Dad, I’m Sorry'},d={...film('A television series',2000,'SERIES'),aliases:['西游记']};
  const suggestions=[a,b,c,d].map(f=>({...f,token:signFilm(f,'key')}));const index=indexFilms(suggestions);
  assert.equal(matchFilms(index,'tit').length,2);
  assert.equal(matchFilms(index,'titanic 1953')[0].id,b.id);
  assert.equal(matchFilms(index,'bo gia')[0].id,c.id);
  assert.equal(matchFilms(index,'Dad Im Sorry')[0].id,c.id);
  assert.equal(matchFilms(index,'西游')[0].id,d.id);
  assert.equal(matchFilms(index,'dicap').length,4);
  assert.equal(matchFilms(index,'James Cameron','SERIES').length,1);
  assert.equal(matchFilms(index,'James Cameron','MOVIE').length,3);
  assert.equal(matchFilms(index,'x').length,0);
});

test('film selections are signed, tamper-proof and cannot be used as music selections',()=>{
  const f=film('Titanic'),token=signFilm(f,'key');assert.deepEqual(readFilm(token,'key'),{id:f.id,title:f.title});
  assert.throws(()=>readFilm(token,'other'));assert.throws(()=>readSong(token,'key'));
  const song=signSong({id:f.id,title:f.title,scope:'US_UK',detail:''},'key');assert.throws(()=>readFilm(song,'key'));
  const [payload,signature]=token.split('.');const data=JSON.parse(Buffer.from(payload,'base64url').toString());data.id=randomUUID();
  assert.throws(()=>readFilm(Buffer.from(JSON.stringify(data)).toString('base64url')+'.'+signature,'key'));
});

test('film imports activate only a verified snapshot, retain old IDs and keep same-title movies distinct',async()=>{
  const client=createClient({url:':memory:'});
  try{
    const a=film('Titanic'),b=film('Titanic',1953);const first=prepareFilmLibrary({films:[a]});await importFilmLibrary(client,first);
    const second=prepareFilmLibrary({films:[a,b]});const report=await importFilmLibrary(client,second);assert.equal(report.count,2);
    assert.equal((await readFilmLibrary(client,second.version)).length,2);
    await assert.rejects(importFilmLibrary(client,prepareFilmLibrary({films:[b]})),/thiếu phim cũ/);
    assert.equal((await client.execute("SELECT version FROM film_library_active WHERE id='active'")).rows[0].version,second.version);
    assert.throws(()=>prepareFilmLibrary({films:[a,a]}),/trùng mã/);
  }finally{client.close();}
});

test('film narration describes film selection, retry limits and preserves the hidden-answer guard',()=>{
  const state={gameType:'MUSIC_DUEL',category:'FILM',phase:'TOPIC_INTRO',roundQuestionIndex:1,playMode:'OPEN' as const,question:{answerMode:'SEARCH' as const,primaryAnswer:'SECRET FILM'}};
  const intro=narrationText(state,'intro');assert.match(intro,/Tìm tên phim hoặc diễn viên/);assert.doesNotMatch(intro,/ca sĩ|SECRET FILM/);
  const help=narrationText({...state,phase:'OPEN_ANSWERING'},'question');assert.match(help,/Chọn phim là gửi ngay/);assert.match(help,/chọn lại/);
  assert.match(narrationText({...state,phase:'ANSWERING',playMode:'BID'},'question'),/Chỉ được chọn một lần/);
  assert.throws(()=>narrationText({...state,phase:'OPEN_ANSWERING'},'answer'));
});
