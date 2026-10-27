import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultSongs,defaultSongMatches} from '../src/lib/defaultSongCatalog.ts';
import type {SongWork} from '../src/lib/musicSearch.ts';

const imported=JSON.parse(readFileSync(new URL('../src/lib/musicCatalogPopular.json',import.meta.url),'utf8'));
const curated=JSON.parse(readFileSync(new URL('../src/lib/musicCatalogSeed.json',import.meta.url),'utf8'));
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

test('published import is complete, has 20,000 unique works and explicit source evidence',()=>{
  assert.equal(imported.source.complete,true);assert.equal(imported.source.target,20000);
  assert.equal(imported.songs.length,20000);assert.equal(imported.source.count,20000);
  assert.equal(new Set(imported.songs.map((song:SongWork)=>song.id)).size,20000);
  const seeded=new Set(curated.songs.map((song:SongWork)=>song.id));
  const counts={VI:0,US_UK:0};
  for(const song of imported.songs){
    assert.match(song.id,uuid);assert.ok(song.title.trim()&&song.title.length<=120);
    assert.ok(song.performers.length>0&&song.performers.every((artist:string)=>artist.trim()&&artist.length<=120));
    assert.ok(!song.title.includes('\ufffd'));
    assert.ok(song.performers.every((artist:string)=>!artist.includes('\ufffd')&&!['[unknown]','[no artist]','[anonymous]','various artists','unknown artist'].includes(artist.toLowerCase())));
    assert.ok(song.scope==='VI'||song.scope==='US_UK');counts[song.scope as keyof typeof counts]++;
    assert.equal(song.token,undefined);
    if(!seeded.has(song.id)){
      assert.equal(song.source.provider,'MusicBrainz');assert.equal(song.source.workId,song.id);
      assert.match(song.source.recordingId,uuid);assert.ok(song.source.recordingCount>0);
      assert.ok(song.source.languages.includes(song.scope==='VI'?'vie':'eng'));
      if(song.scope==='US_UK')assert.ok(!song.source.languages.includes('vie'));
    }
  }
  assert.deepEqual(counts,imported.source.counts);
});

test('bulk catalog preserves every existing curated answer ID and strips import provenance from player metadata',()=>{
  const byId=new Map(defaultSongs.map(song=>[song.id,song]));
  for(const song of curated.songs){
    const current=byId.get(song.id)!;assert.ok(current);assert.equal(current.title,song.title);
    assert.equal(current.scope,song.scope);assert.deepEqual(current.performers,song.performers);
  }
  assert.equal(defaultSongs.length,20000);assert.ok(defaultSongs.every(song=>!('source' in song)&&!('token' in song)));
  const final=imported.songs.at(-1);
  assert.ok(defaultSongMatches(final.title+' '+final.performers[0],final.scope).some(song=>song.id===final.id),'a work at the end of the shipped file is searchable');
});
