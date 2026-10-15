'use client';
import {useEffect,useRef,useState} from 'react';
import type { Choice } from '@/lib/multiplayer';
export function ChoiceAnswers({choices,disabled=true,onAnswer,selectedLabel,submitted=false,correctId}:{choices:Choice[];disabled?:boolean;onAnswer?:(id:string)=>void|Promise<boolean|void>;selectedLabel?:string|null;submitted?:boolean;correctId?:string|null}){
  const [selected,setSelected]=useState<string|null>(null);const [confirmed,setConfirmed]=useState(false);
  const locked=useRef(false);const previousDisabled=useRef(disabled);const generation=useRef(0);
  const identity=choices.map(c=>c.id+':'+c.label).join('|');
  useEffect(()=>{generation.current++;locked.current=false;setSelected(null);setConfirmed(false);},[identity]);
  useEffect(()=>()=>{generation.current++;},[]);
  useEffect(()=>{if(previousDisabled.current&&!disabled&&!confirmed&&!submitted){locked.current=false;setSelected(null);}previousDisabled.current=disabled;},[disabled,confirmed,submitted]);
  const chosen=choices.find(c=>c.label===selectedLabel)?.id??selected;
  const revealed=!!correctId;
  async function choose(id:string){
    if(disabled||locked.current||submitted||revealed||!onAnswer)return;
    const requestGeneration=generation.current;locked.current=true;setSelected(id);
    try{const result=await onAnswer(id);if(requestGeneration!==generation.current)return;if(result===false){locked.current=false;setSelected(null);}else if(result===true)setConfirmed(true);}
    catch{if(requestGeneration===generation.current){locked.current=false;setSelected(null);}}
  }
  const status=revealed?chosen?chosen===correctId?'Bạn đã chọn đúng!':'Bạn đã chọn chưa đúng. Đáp án đúng được tô xanh.':'Đáp án đúng được tô xanh.':submitted||confirmed?'Đã chốt đáp án. Chờ hết giờ.':chosen?'Đang gửi lựa chọn…':disabled?'Đã hết thời gian trả lời.':'Chỉ được chọn một lần.';
  return <div className={`choice-answers ${chosen?'has-selection':''} ${revealed?'is-revealed':''}`} role="group" aria-label={revealed?'Kết quả bốn đáp án':'Chọn một đáp án'}>
    <p className="choice-status" role="status" aria-live="polite">{status}</p>
    {choices.map((choice,i)=>{const isSelected=chosen===choice.id;const correct=revealed&&choice.id===correctId;return <button type="button" className={`choice-option choice-${'abcd'[i]} ${isSelected?'choice-selected':''} ${revealed?correct?'choice-correct':'choice-wrong':''}`} aria-pressed={isSelected} key={choice.id} disabled={disabled||chosen!==null||submitted||revealed} onClick={()=>void choose(choice.id)}>
      <b className="choice-letter">{'ABCD'[i]}</b><span className="choice-copy"><span className="choice-label">{choice.label}</span>{(isSelected||correct)&&<small className="choice-tag">{correct?'✓ Đáp án đúng':''}{correct&&isSelected?' · ':''}{isSelected?'Bạn đã chọn':''}</small>}</span>{isSelected&&!revealed&&<span className="choice-check" aria-hidden="true">✓</span>}
    </button>;})}
  </div>;
}
