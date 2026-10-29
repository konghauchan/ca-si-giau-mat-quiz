'use client';
import { SearchSuggestions } from './SearchSuggestions';
import {useEffect,useId,useRef,useState} from 'react';
import {musicScopeLabel,MUSIC_RESULT_LIMIT,hasStrongSongMatch,hasExactSongMatch,type MusicScope,type SongSuggestion} from '@/lib/musicSearch';
import {cachedSongMatches,primeSongCatalog,rememberSongs,subscribeSongCatalog} from '@/lib/musicCatalogClient';
import {loadSongMatches} from '@/lib/musicSearchClient';

export function SongSearch({scope,roomId,gameToken,disabled=false,onSelect,onAnswer,selectedTitle}:{scope:MusicScope;roomId?:string;gameToken?:string;disabled?:boolean;onSelect?:(song:SongSuggestion)=>void;onAnswer?:(token:string,song:SongSuggestion)=>Promise<boolean|void>;selectedTitle?:string}) {
  const isAnswering=!!onAnswer;
  const [expanded,setExpanded]=useState(false);
  const id=useId();const input=useRef<HTMLInputElement>(null);const submitting=useRef(false);const generation=useRef(0);
  const pendingSearch=useRef<{controller:AbortController}|null>(null);const completedSearch=useRef('');const completedNotice=useRef('');
  const [query,setQuery]=useState('');const [items,setItems]=useState<SongSuggestion[]>([]);const [selected,setSelected]=useState<SongSuggestion|null>(null);
  const [active,setActive]=useState(-1);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [sent,setSent]=useState(false);const [busy,setBusy]=useState(false);
  const [waiting,setWaiting]=useState(false);
  const [catalogVersion,setCatalogVersion]=useState(0);const [retry,setRetry]=useState(0);const [forcedTerm,setForcedTerm]=useState('');
  useEffect(()=>{generation.current++;pendingSearch.current?.controller.abort();pendingSearch.current=null;completedSearch.current='';completedNotice.current='';setQuery('');setSelected(null);setItems([]);setSent(false);setBusy(false);setLoading(false);setWaiting(false);setActive(-1);setError('');submitting.current=false;},[scope,roomId]);
  useEffect(()=>{if(disabled)pendingSearch.current?.controller.abort();},[disabled]);
  useEffect(()=>()=>{generation.current++;pendingSearch.current?.controller.abort();pendingSearch.current=null;},[]);
  useEffect(()=>subscribeSongCatalog(scope,()=>setCatalogVersion(v=>v+1)),[scope]);
  useEffect(()=>{let alive=true;void primeSongCatalog(scope,{roomId,gameToken}).then(()=>{if(alive)setCatalogVersion(v=>v+1);});return ()=>{alive=false;};},[scope,roomId,gameToken]);
  useEffect(()=>{
    const controller=new AbortController();let alive=true;
    if(disabled||selected||query.trim().length<2){setItems([]);setLoading(false);return ()=>controller.abort();}
    const local=cachedSongMatches(scope,query);const refresh=forcedTerm===query.trim()&&retry>0;
    setItems(local);setActive(-1);setError('');
    if(!refresh&&(hasStrongSongMatch(local,query)||hasExactSongMatch(local,query)||completedSearch.current===query.trim())){setLoading(false);if(completedSearch.current===query.trim()&&!local.length)setError(completedNotice.current||(!local.length?'Chưa tìm thấy bài trong phạm vi này.':''));return ()=>controller.abort();}
    setLoading(true);setWaiting(false);
    // Let one cold lookup finish while typing continues. Reuse its metadata for
    // the latest query instead of discarding it and competing for the API lease.
    if(pendingSearch.current){setWaiting(true);return ()=>{alive=false;};}
    let started=false;
    const timer=setTimeout(async()=>{
      started=true;const requestGeneration=generation.current;const job={controller};pendingSearch.current=job;
      try {
        const params=new URLSearchParams({q:query.trim(),scope});if(roomId)params.set('roomId',roomId);if(refresh)params.set('refresh','1');
        let notice='';
        const found=await loadSongMatches('/api/music/search?'+params,gameToken?{'x-game-token':gameToken}:{},controller.signal,()=>{if(alive)setWaiting(true);},{onNotice:message=>{notice=message+(!isAnswering?' Bạn có thể chọn kiểu Gõ đáp án hoặc ABCD cho vòng này.':'');}});
        if(requestGeneration===generation.current){
          completedSearch.current=query.trim();completedNotice.current=notice;rememberSongs(scope,found);
          if(alive){const merged=[...new Map([...found,...local].map((song:SongSuggestion)=>[song.id,song])).values()] as SongSuggestion[];setItems(merged.slice(0,MUSIC_RESULT_LIMIT));setError(notice||(merged.length?'':'Chưa tìm thấy bài trong phạm vi này. Kiểm tra phạm vi nhạc hoặc thử một phần tên bài/ca sĩ khác.'));}
        }
      }catch(cause){if(alive&&!controller.signal.aborted)setError((cause as Error).message);}
      finally{
        if(pendingSearch.current===job)pendingSearch.current=null;
        if(requestGeneration===generation.current){if(alive){setLoading(false);setWaiting(false);}else setCatalogVersion(value=>value+1);}
      }
    },300);
    return ()=>{alive=false;clearTimeout(timer);if(!started)controller.abort();};
  },[query,scope,roomId,gameToken,disabled,selected,retry,forcedTerm,catalogVersion,isAnswering]);
  const showResults=items.length>0&&(!onAnswer||expanded)&&!disabled;
  const activeId=showResults&&active>=0&&active<items.length?id+'-option-'+active:undefined;
  async function submit(song:SongSuggestion){
    if(!onAnswer||disabled||submitting.current||sent)return;
    const requestGeneration=generation.current;submitting.current=true;setBusy(true);setError('');
    try {
      const result=await onAnswer(song.token,song);if(requestGeneration!==generation.current)return;
      if(result!==false)setSent(true);
      else {setSelected(null);setQuery('');requestAnimationFrame(()=>input.current?.focus());}
    }catch(cause){if(requestGeneration===generation.current){setError((cause as Error).message);setSelected(null);setQuery('');requestAnimationFrame(()=>input.current?.focus());}}
    finally{if(requestGeneration===generation.current){submitting.current=false;setBusy(false);}}
  }
  function choose(song:SongSuggestion){
    if(disabled||submitting.current||sent)return;
    setSelected(song);setQuery(song.title);setItems([]);setActive(-1);setError('');onSelect?.(song);
    if(onAnswer)void submit(song);
  }
  function searchMore(){setExpanded(true);input.current?.focus();setForcedTerm(query.trim());setRetry(value=>value+1);}
  return <div className="song-search">
    <div className="field"><label htmlFor={id}>Tìm bài hát hoặc ca sĩ</label><small>{musicScopeLabel(scope)} · {onAnswer?'Chọn bài là gửi đáp án ngay.':'Tìm theo tên bài hát hoặc ca sĩ'}</small>
      <input ref={input} autoFocus={!!onAnswer} id={id} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={showResults} aria-controls={showResults?id+'-list':undefined} aria-activedescendant={activeId} value={query} maxLength={80} disabled={disabled||busy||sent} placeholder="Nhập một phần tên bài hát hoặc ca sĩ…" onClick={()=>setExpanded(true)} onFocus={()=>setExpanded(true)} onChange={event=>{setExpanded(true);const value=event.target.value;setQuery(value);setSelected(null);setSent(false);setForcedTerm('');setError('');setActive(-1);setItems(cachedSongMatches(scope,value));}} onKeyDown={event=>{
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setExpanded(true);setActive(i=>items.length?(event.key==='ArrowDown'?(i+1)%items.length:i<0?items.length-1:(i-1+items.length)%items.length):-1);}
        else if(event.key==='Escape'){if(onAnswer)setExpanded(false);else setItems([]);setActive(-1);}
        else if(event.key==='Enter'){event.preventDefault();if(showResults&&active>=0&&items[active])choose(items[active]);}
      }}/>
    </div>
    <SearchSuggestions anchor={input} open={showResults} floating={!!onAnswer} activeId={activeId} onDismiss={()=>{setExpanded(false);setActive(-1);}}><ul className="song-search-results" role="listbox" id={id+'-list'} aria-label="Các bài hát phù hợp">{items.map((song,index)=><li role="option" aria-selected={active===index} id={id+'-option-'+index} key={song.id} className={active===index?'active':''} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(song)}><strong>{song.title}</strong><span className="song-search-performers search-result-meta">{song.performers?.length?`Ca sĩ: ${song.performers.join(', ')}`:'Chưa có thông tin ca sĩ'}</span>{!onAnswer&&<small>{song.detail}</small>}</li>)}</ul></SearchSuggestions>
    <p className="song-search-status" role="status" aria-live="polite">{busy?'Đang gửi đáp án…':sent?'Đã gửi lựa chọn.':loading?(waiting?'Đang tải danh mục bài hát… Kết quả sẽ tự cập nhật.':'Đang tìm bài hát…'):selected?`Đã chọn: ${selected.title}`:selectedTitle?`Đáp án đã liên kết: ${selectedTitle}`:''}</p>
    {error&&<div className="notice info" role="status">{error} <button type="button" className="button ghost" disabled={disabled||loading||busy} onClick={searchMore}>Tìm lại</button></div>}
    {items.length>0&&!selected&&<button type="button" className="button ghost" disabled={disabled||loading||busy} onClick={searchMore}>Tìm thêm trên MusicBrainz</button>}
    {!onAnswer&&<small className="song-search-credit">Danh mục Đọ Nhạc · Dữ liệu <a href="https://musicbrainz.org/" target="_blank" rel="noreferrer">MusicBrainz</a> và <a href="https://www.wikidata.org/" target="_blank" rel="noreferrer">Wikidata</a>. Tìm theo tên bài hoặc ca sĩ, có hỗ trợ không dấu. Bài ngoài danh mục có thể cần chờ thêm.</small>}
  </div>;
}
