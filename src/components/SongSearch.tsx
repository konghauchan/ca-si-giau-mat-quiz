'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {musicScopeLabel,type MusicScope,type SongSuggestion} from '@/lib/musicSearch';

export function SongSearch({scope,roomId,gameToken,disabled=false,onSelect,onAnswer,selectedTitle}:{scope:MusicScope;roomId?:string;gameToken?:string;disabled?:boolean;onSelect?:(song:SongSuggestion)=>void;onAnswer?:(token:string,song:SongSuggestion)=>Promise<boolean|void>;selectedTitle?:string}) {
  const id=useId();const input=useRef<HTMLInputElement>(null);const submitting=useRef(false);
  const [query,setQuery]=useState('');const [items,setItems]=useState<SongSuggestion[]>([]);const [selected,setSelected]=useState<SongSuggestion|null>(null);
  const [active,setActive]=useState(-1);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [sent,setSent]=useState(false);const [busy,setBusy]=useState(false);const [retry,setRetry]=useState(0);
  useEffect(()=>{setQuery('');setSelected(null);setItems([]);setSent(false);setError('');submitting.current=false;},[scope,roomId]);
  useEffect(()=>{
    const controller=new AbortController();let alive=true;
    if(disabled||selected||query.trim().length<2){setItems([]);setLoading(false);return ()=>controller.abort();}
    setItems([]);setActive(-1);setLoading(true);setError('');
    const timer=setTimeout(async()=>{
      try {
        const params=new URLSearchParams({q:query.trim(),scope});if(roomId)params.set('roomId',roomId);
        const response=await fetch('/api/music/search?'+params,{headers:gameToken?{'x-game-token':gameToken}:{},signal:controller.signal,cache:'no-store'});
        const data=await response.json();if(!response.ok)throw new Error(data.error||'Chưa tìm được bài hát.');
        if(alive){setItems(data.items);setError(data.items.length?'':'Chưa tìm thấy bài trong phạm vi này. Kiểm tra phạm vi nhạc hoặc thử tên bài/ca sĩ đầy đủ.');}
      }catch(cause){if(alive&&!controller.signal.aborted)setError((cause as Error).message);}
      finally{if(alive)setLoading(false);}
    },500);
    return ()=>{alive=false;clearTimeout(timer);controller.abort();};
  },[query,scope,roomId,gameToken,disabled,selected,retry]);
  function choose(song:SongSuggestion){setSelected(song);setQuery(song.title);setItems([]);setActive(-1);setError('');onSelect?.(song);}
  async function submit(){
    if(!selected||!onAnswer||disabled||submitting.current||sent)return;
    submitting.current=true;setBusy(true);setError('');
    try{const result=await onAnswer(selected.token,selected);if(result!==false){setSent(true);}else{setSelected(null);setQuery('');requestAnimationFrame(()=>input.current?.focus());}}
    catch(cause){setError((cause as Error).message);}
    finally{submitting.current=false;setBusy(false);}
  }
  return <div className="song-search">
    <div className="field"><label htmlFor={id}>Tìm bài hát hoặc ca sĩ trên MusicBrainz</label><small>{musicScopeLabel(scope)} · Tìm theo tên bài hát hoặc ca sĩ</small>
      <input ref={input} autoFocus={!!onAnswer} id={id} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={items.length>0} aria-controls={id+'-list'} aria-activedescendant={active>=0?id+'-option-'+active:undefined} value={query} maxLength={80} disabled={disabled||busy||sent} placeholder="Nhập tên bài hát hoặc ca sĩ…" onChange={event=>{setQuery(event.target.value);setSelected(null);setSent(false);}} onKeyDown={event=>{
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setActive(i=>items.length?(event.key==='ArrowDown'?(i+1)%items.length:i<0?items.length-1:(i-1+items.length)%items.length):-1);}
        else if(event.key==='Escape'){setItems([]);setActive(-1);}
        else if(event.key==='Enter'){event.preventDefault();if(active>=0&&items[active])choose(items[active]);else if(selected)void submit();}
      }}/>
    </div>
    {items.length>0&&<ul className="song-search-results" role="listbox" id={id+'-list'} aria-label="Các bài hát phù hợp">{items.map((song,index)=><li role="option" aria-selected={active===index} id={id+'-option-'+index} key={song.id} className={active===index?'active':''} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(song)}><strong>{song.title}</strong><span className="song-search-performers">{song.performers?.length?`Ca sĩ: ${song.performers.join(', ')}`:"Chưa có thông tin ca sĩ"}</span><small>{song.detail}</small></li>)}</ul>}
    <p className="song-search-status" role="status" aria-live="polite">{sent?'Đã gửi lựa chọn.':loading?'Đang tìm bài hát…':selected?`Đã chọn: ${selected.title}`:selectedTitle?`Đáp án đã liên kết: ${selectedTitle}`:''}</p>
    {error&&<div className="notice info" role="status">{error} <button type="button" className="button ghost" disabled={disabled||loading} onClick={()=>setRetry(v=>v+1)}>Tìm lại</button></div>}
    {onAnswer&&<button type="button" className="button primary big full" disabled={!selected||disabled||busy||sent} onClick={()=>void submit()}>{busy?'Đang gửi…':sent?'Đã gửi đáp án':'Chốt bài hát đã chọn'}</button>}
    <small className="song-search-credit">Dữ liệu: <a href="https://musicbrainz.org/" target="_blank" rel="noreferrer">MusicBrainz</a>. Các bản hát lại có thể dùng chung một tác phẩm. Chỉ hiện bài đã có thông tin ngôn ngữ.</small>
  </div>;
}
