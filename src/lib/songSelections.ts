import {randomBytes} from 'node:crypto';
import {one,run} from './db';
import {signSong,readSong} from './songToken';
import type {MusicScope} from './musicSearch';

// Keep gameplay answer validation independent of the bulk search dataset.
let keyPromise:Promise<string>|undefined;
export function songSigningKey():Promise<string> {
  return keyPromise??= (async()=>{
    await run('INSERT OR IGNORE INTO music_search_control(id,value,next_at) VALUES(?,?,0)','signing-key',randomBytes(32).toString('hex'));
    return String((await one('SELECT value FROM music_search_control WHERE id=?','signing-key'))!.value);
  })().catch(error=>{keyPromise=undefined;throw error;});
}
export async function verifySongSelection(token:string,scope:MusicScope) {
  const song=readSong(token,await songSigningKey());
  if(song.scope!==scope)throw new Error('Bài hát không thuộc phạm vi nhạc của quiz. Hãy chọn lại bài.');
  return song;
}
export async function savedSongToken(id:string,title:string,scope:MusicScope) {
  return signSong({id,title,scope,detail:''},await songSigningKey());
}
