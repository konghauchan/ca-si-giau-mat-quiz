import type {LibrarySong} from './songLibraryStore.ts';

type Credit={artistId:string;name:string;recordingId:string};
type Evidence={provider:string;id:string;artistId:string;url:string};
type Source={performerCredits?:Credit[];evidence?:Evidence[];artistIds?:string[];[key:string]:unknown};
export function extendLibrarySongs(existing:LibrarySong[],incoming:LibrarySong[]){
  const songs=new Map(existing.map(song=>[song.id,song]));
  let added=0,updated=0;
  for(const next of incoming){
    const previous=songs.get(next.id);
    if(!previous){songs.set(next.id,next);added++;continue;}
    if(previous.scope!==next.scope)throw new Error('Tác phẩm khác phạm vi: '+next.id);
    const oldSource=(previous.source||{}) as Source,newSource=(next.source||{}) as Source;
    const credits=new Map((oldSource.performerCredits||[]).map(credit=>[credit.artistId,credit]));
    for(const credit of newSource.performerCredits||[])credits.set(credit.artistId,credit);
    const evidence=new Map((oldSource.evidence||[]).map(value=>[JSON.stringify([value.provider,value.id,value.artistId]),value]));
    for(const value of newSource.evidence||[])evidence.set(JSON.stringify([value.provider,value.id,value.artistId]),value);
    // Keep existing display credits, titles and aliases. Alternate recording
    // performers remain searchable without displaying them as a fake duet.
    const merged={...previous,artistAliases:[...new Set([...(previous.artistAliases||[]),...(next.artistAliases||[])])],
      source:{...oldSource,performerCredits:[...credits.values()],
        ...(evidence.size?{evidence:[...evidence.values()]}:{}),
        ...((oldSource.artistIds||newSource.artistIds)?{artistIds:[...new Set([...(oldSource.artistIds||[]),...(newSource.artistIds||[])])]}:{})}};
    songs.set(next.id,merged);
    if(JSON.stringify(previous)!==JSON.stringify(merged))updated++;
  }
  return {songs:[...songs.values()],added,updated};
}
