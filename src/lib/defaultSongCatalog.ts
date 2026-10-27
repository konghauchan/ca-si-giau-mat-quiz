import data from './musicCatalogSeed.json' with {type:'json'};
import imported from './musicCatalogPopular.json' with {type:'json'};
import {indexSongs,matchSongs} from './songCatalog.ts';
import type {MusicScope,SongWork} from './musicSearch.ts';
// Public provider metadata shared by every quiz, independent of hidden questions.
// Curated labels/aliases win over bulk provider credits. Existing Work IDs stay
// unchanged, so importing metadata cannot change how older quizzes are scored.
export const defaultSongs=[...new Map([...(imported.songs as SongWork[]),...(data.songs as SongWork[])].map(song=>[song.id,song])).values()].map(({id,title,scope,detail,performers,artistAliases})=>({id,title,scope,detail,performers,artistAliases}));
const indexes={VI:indexSongs(defaultSongs.filter(s=>s.scope==='VI').map(s=>({...s,token:''}))),US_UK:indexSongs(defaultSongs.filter(s=>s.scope==='US_UK').map(s=>({...s,token:''})))};
const byId=new Map(defaultSongs.map(song=>[song.id,song]));
export function defaultSongMatches(query:string,scope:MusicScope):SongWork[]{return matchSongs(indexes[scope],query).map(song=>byId.get(song.id)!);}
