'use client';
import {useEffect,useRef,useState} from 'react';
import type { Choice } from '@/lib/multiplayer';
export function ChoiceAnswers({choices,disabled,onAnswer}:{choices:Choice[];disabled:boolean;onAnswer:(id:string)=>void|Promise<boolean|void>}){
  const [selected,setSelected]=useState<string|null>(null);const [confirmed,setConfirmed]=useState(false);
  const locked=useRef(false);const previousDisabled=useRef(disabled);const identity=choices.map(c=>c.id+':'+c.label).join('|');
  useEffect(()=>{locked.current=false;setSelected(null);setConfirmed(false);},[identity]);
  useEffect(()=>{if(previousDisabled.current&&!disabled&&!confirmed){locked.current=false;setSelected(null);}previousDisabled.current=disabled;},[disabled,confirmed]);
  async function choose(id:string){
    if(disabled||locked.current)return;locked.current=true;setSelected(id);
    try{const result=await onAnswer(id);if(result===false){locked.current=false;setSelected(null);}else if(result===true)setConfirmed(true);}
    catch{locked.current=false;setSelected(null);}
  }
  return <div className="choice-answers" role="group" aria-label="Chọn một đáp án"><p role="status" aria-live="polite">{selected?confirmed?'Đã chốt đáp án. Chờ hết giờ.':'Đang gửi lựa chọn…':'Chỉ được chọn một lần.'}</p>{choices.map((choice,i)=><button type="button" className={`button secondary ${selected===choice.id?'choice-selected':''}`} aria-pressed={selected===choice.id} key={choice.id} disabled={disabled||selected!==null} onClick={()=>void choose(choice.id)}><b>{'ABCD'[i]}</b><span>{choice.label}</span>{selected===choice.id&&<span aria-hidden="true">✓</span>}</button>)}</div>;
}
