'use client';
import { SearchSuggestions } from './SearchSuggestions';
import { useEffect, useId, useRef, useState } from 'react';
import { cachedFilmById, cachedFilmMatches, primeFilmCatalog, subscribeFilmCatalog } from '@/lib/filmCatalogClient';
import { filmKindLabel, type FilmKind, type FilmSuggestion } from '@/lib/filmCatalog';

export function FilmSearch({roomId,gameToken,disabled=false,selectedTitle='',selectedToken,onSelect,onAnswer}:{roomId?:string;gameToken?:string;disabled?:boolean;selectedTitle?:string;selectedToken?:string;onSelect?:(film:FilmSuggestion)=>void;onAnswer?:(token:string,film:FilmSuggestion)=>Promise<unknown>}) {
  const [expanded,setExpanded]=useState(false);
  const id = useId(), input = useRef<HTMLInputElement>(null), sending = useRef(false), generation = useRef(0);
  const [query,setQuery] = useState(''), [kind,setKind] = useState<FilmKind>('ALL'), [active,setActive] = useState(-1), [,setVersion] = useState(0);
  const [loading,setLoading] = useState(true), [error,setError] = useState(''), [busy,setBusy] = useState(false), [sent,setSent] = useState(false), [selected,setSelected] = useState<FilmSuggestion|null>(null), [retry,setRetry] = useState(0);
  useEffect(()=>subscribeFilmCatalog(()=>setVersion(v=>v+1)),[]);
  useEffect(()=>{
    const current = ++generation.current; setLoading(true); setError(''); setQuery(''); setSelected(null); setSent(false); setBusy(false); sending.current=false;
    void primeFilmCatalog({roomId,gameToken}).then(()=>{if(current===generation.current)setLoading(false);},cause=>{if(current===generation.current){setLoading(false);setError((cause as Error).message);}});
    return ()=>{generation.current=current+1;};
  },[roomId,gameToken,retry]);
  const items = selected || sent ? [] : cachedFilmMatches(query,onAnswer?'ALL':kind);
  const showResults=items.length>0&&(!onAnswer||expanded)&&!disabled;
  const activeId=showResults&&active>=0&&active<items.length?id+'-'+active:undefined;
  // Display-only lookup; signatures and film identity are checked by the server.
  let linked: FilmSuggestion|undefined;
  if(selectedToken)try{linked=cachedFilmById(JSON.parse(atob(selectedToken.split('.')[0].replace(/-/g,'+').replace(/_/g,'/'))).id);}catch{}
  async function choose(film: FilmSuggestion) {
    if(disabled||sending.current||sent)return;
    setSelected(film); setQuery(film.title); setActive(-1); setError(''); onSelect?.(film);
    if(!onAnswer)return;
    const current=generation.current; sending.current=true; setBusy(true);
    try {
      const result=await onAnswer(film.token,film); if(current!==generation.current)return;
      if(result!==false)setSent(true);
      else {setSelected(null);setQuery('');requestAnimationFrame(()=>input.current?.focus());}
    } catch(cause) {
      if(current===generation.current){setError((cause as Error).message);setSelected(null);setQuery('');requestAnimationFrame(()=>input.current?.focus());}
    } finally {if(current===generation.current){sending.current=false;setBusy(false);}}
  }
  return <div className="song-search">
    <div className="field"><label htmlFor={id}>Tìm phim hoặc diễn viên</label><small>{onAnswer?'Chọn phim là gửi đáp án ngay.':'Tìm tên Việt, tên gốc, đạo diễn hoặc diễn viên.'}</small>
      <input ref={input} id={id} autoFocus={!!onAnswer} role="combobox" aria-autocomplete="list" aria-expanded={showResults} aria-controls={showResults?id+'-list':undefined} aria-activedescendant={activeId} autoComplete="off" value={query} maxLength={80} disabled={disabled||busy||sent} placeholder="Nhập một phần tên phim hoặc diễn viên…" onClick={()=>setExpanded(true)} onFocus={()=>setExpanded(true)} onChange={event=>{setExpanded(true);setQuery(event.target.value);setSelected(null);setSent(false);setActive(-1);}} onKeyDown={event=>{
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setExpanded(true);setActive(i=>items.length?(event.key==='ArrowDown'?(i+1)%items.length:i<=0?items.length-1:i-1):-1);}
        else if(event.key==='Escape'){if(onAnswer)setExpanded(false);else setQuery('');setActive(-1);}
        else if(event.key==='Enter'){event.preventDefault();if(showResults&&active>=0&&items[active])void choose(items[active]);}
      }}/>
    </div>
    {!onAnswer&&<div className="field"><label htmlFor={id+'-kind'}>Loại phim</label><select id={id+'-kind'} value={kind} disabled={disabled||busy||sent} onChange={event=>{setKind(event.target.value as FilmKind);setActive(-1);}}><option value="ALL">Phim lẻ và phim bộ</option><option value="MOVIE">Phim lẻ</option><option value="SERIES">Phim bộ</option></select></div>}
    <SearchSuggestions anchor={input} open={showResults} floating={!!onAnswer} activeId={activeId} onDismiss={()=>{setExpanded(false);setActive(-1);}}><ul className="song-search-results" role="listbox" id={id+'-list'} aria-label="Các phim phù hợp">{items.map((film,i)=><li id={id+'-'+i} role="option" aria-selected={active===i} className={active===i?'active':''} key={film.id} onMouseDown={event=>event.preventDefault()} onClick={()=>void choose(film)}><strong>{onAnswer?<><span className="search-result-title">{film.title}</span>{film.year&&<span className="search-result-year">({film.year})</span>}</>:<>{film.title} {film.year&&`(${film.year})`}</>}</strong>{onAnswer?<small className="search-result-meta">{film.originalTitle!==film.title?film.originalTitle:film.directors.slice(0,2).join(', ')||film.cast.slice(0,2).join(', ')}</small>:<><span>{filmKindLabel(film.kind)}{film.originalTitle!==film.title?` · ${film.originalTitle}`:''}</span>{film.directors.length>0&&<small>Đạo diễn: {film.directors.slice(0,3).join(', ')}</small>}{film.cast.length>0&&<small>Diễn viên: {film.cast.slice(0,4).join(', ')}</small>}</>}</li>)}</ul></SearchSuggestions>
    <p className="song-search-status" role="status">{busy?'Đang gửi đáp án…':sent?'Đã gửi lựa chọn.':selected?`Đã chọn: ${selected.title}${selected.year?' ('+selected.year+')':''}`:loading?'Đang tải danh mục phim…':query.trim().length>=2&&!items.length?'Chưa thấy phim phù hợp. Thử tên khác, tên gốc hoặc diễn viên.':selectedTitle?`Đáp án đã liên kết: ${selectedTitle}${linked?.year?' ('+linked.year+')':''}${linked&&!onAnswer?' · '+filmKindLabel(linked.kind):''}`:''}</p>
    {error&&<div className="notice info" role="status">{error} <button type="button" className="button ghost" disabled={loading||busy} onClick={()=>setRetry(v=>v+1)}>Tải lại</button></div>}
  </div>;
}
