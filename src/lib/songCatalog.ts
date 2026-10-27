import {normalizeMusicSearch,artistTextRank,MUSIC_RESULT_LIMIT} from './musicSearch.ts';
import type {SongSuggestion} from './musicSearch.ts';
export type IndexedSong={song:SongSuggestion;title:string;artists:string[];text:string;compactText:string;artistWords:string[][]};
const titles=new Intl.Collator('vi');
export function indexSongs(songs:SongSuggestion[]):IndexedSong[] {
  return songs.map(song=>{const title=normalizeMusicSearch(song.title),artists=[...(song.performers||[]),...(song.artistAliases||[])].map(normalizeMusicSearch);const text=[title,...artists].join(' ');return {song,title,artists,text,compactText:text.replaceAll(' ',''),artistWords:artists.map(artist=>artist.split(' '))};}).sort((a,b)=>titles.compare(a.song.title,b.song.title));
}
export function matchSongs(index:IndexedSong[],query:string,limit=MUSIC_RESULT_LIMIT):SongSuggestion[] {
  const term=normalizeMusicSearch(query);if(term.length<2||limit<=0)return [];
  const words=term.split(' ').filter(Boolean),compactTerm=term.replaceAll(' ','');
  const artistRanks=new Map<string,number>();
  function artistRank(name:string){let rank=artistRanks.get(name);if(rank===undefined){rank=artistTextRank(term,name);artistRanks.set(name,rank);}return rank;}
  const buckets:SongSuggestion[][]=Array.from({length:10},()=>[]);
  for(const item of index){
    const artistMatch=item.artists.some(name=>Number.isFinite(artistRank(name)));
    const titleMatch=words.every(word=>item.title.includes(word))||item.title.replaceAll(' ','').includes(compactTerm);
    const combined=words.some(word=>item.title.includes(word))&&words.every(word=>item.title.includes(word)||item.artistWords.some(artist=>artist.some(name=>name.startsWith(word))));
    if(!titleMatch&&!artistMatch&&!combined)continue;
    const score=item.title===term?0:item.artists.includes(term)?1:item.artists.some(artist=>artist.startsWith(term))?2:item.title.startsWith(term)?3:4;
    const bucket=buckets[score*2+(item.artists.length?0:1)];if(bucket.length<limit)bucket.push(item.song);
  }
  return buckets.flat().slice(0,limit);
}
