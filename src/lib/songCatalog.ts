import {normalizeAnswer} from './core.ts';
import type {SongSuggestion} from './musicSearch.ts';
export type IndexedSong={song:SongSuggestion;title:string;artists:string[];text:string};
const titles=new Intl.Collator('vi');
export function indexSongs(songs:SongSuggestion[]):IndexedSong[] {
  return songs.map(song=>{const title=normalizeAnswer(song.title),artists=(song.performers||[]).map(normalizeAnswer);return {song,title,artists,text:[title,...artists].join(' ')};}).sort((a,b)=>titles.compare(a.song.title,b.song.title));
}
export function matchSongs(index:IndexedSong[],query:string,limit=8):SongSuggestion[] {
  const term=normalizeAnswer(query);if(term.length<2||limit<=0)return [];
  const words=term.split(' ').filter(Boolean);
  const buckets:SongSuggestion[][]=Array.from({length:10},()=>[]);
  for(const item of index){
    if(!words.every(word=>item.text.includes(word)))continue;
    const score=item.title===term?0:item.title.startsWith(term)?1:item.artists.includes(term)?2:item.artists.some(artist=>artist.startsWith(term))?3:4;
    const bucket=buckets[score*2+(item.artists.length?0:1)];if(bucket.length<limit)bucket.push(item.song);
  }
  return buckets.flat().slice(0,limit);
}
