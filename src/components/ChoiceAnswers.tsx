'use client';
import type { Choice } from '@/lib/multiplayer';
export function ChoiceAnswers({choices,disabled,onAnswer}:{choices:Choice[];disabled:boolean;onAnswer:(id:string)=>void}){
  return <div className="choice-answers" role="group" aria-label="Chọn một đáp án"><p>Chỉ được chọn một lần.</p>{choices.map((choice,i)=><button type="button" className="button secondary" key={choice.id} disabled={disabled} onClick={()=>onAnswer(choice.id)}><b>{'ABCD'[i]}</b><span>{choice.label}</span></button>)}</div>;
}
