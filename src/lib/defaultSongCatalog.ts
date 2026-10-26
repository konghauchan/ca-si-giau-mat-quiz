import data from './data/music-catalog.json' with {type:'json'};
import {indexSongs,matchSongs} from './songCatalog.ts';
import type {MusicScope,SongWork} from './musicSearch.ts';
// Public provider metadata shared by every quiz, independent of hidden questions.
export const defaultSongs=data.songs as SongWork[];
const indexes={VI:indexSongs(defaultSongs.filter(s=>s.scope==='VI').map(s=>({...s,token:''}))),US_UK:indexSongs(defaultSongs.filter(s=>s.scope==='US_UK').map(s=>({...s,token:''})))};
const byId=new Map(defaultSongs.map(song=>[song.id,song]));
export function defaultSongMatches(query:string,scope:MusicScope):SongWork[]{return matchSongs(indexes[scope],query).map(song=>byId.get(song.id)!);}
