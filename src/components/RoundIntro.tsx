import { roundRules, type IntroMode } from '@/lib/roundIntro';
import { Headphones, Film, Lightbulb, Keyboard, Trophy, Timer, Hand, Check, ArrowRight, Info } from 'lucide-react';
export function RoundIntro({ round, mode, film = false, children }: { round: number; mode: IntroMode; film?: boolean; children?: React.ReactNode }) {
  const info = roundRules(mode, film);
  const icons = mode === 'OPEN' ? [film ? Film : Headphones, Keyboard, Trophy] : mode === 'BID' ? [Lightbulb, Timer, Check] : [Lightbulb, Hand, Check];
  return <section className="panel round-intro" aria-label={`Giới thiệu vòng ${round}`}>
    <span className="phase-pill">VÒNG {round} · CÁCH CHƠI</span><h2>{info.title}</h2>
    <ol className="round-intro-steps">{info.steps.map((step, index) => {
      const Icon = icons[index];
      return <li key={step.title} className="round-intro-step"><div className="round-step-art" aria-hidden="true"><span className="round-step-number">{index + 1}</span><Icon size={44} strokeWidth={1.8}/>{index < 2 && <ArrowRight className="round-step-arrow" size={20}/>}</div><h3>{step.title}</h3><p>{step.description}</p></li>;
    })}</ol>
    <div className="round-intro-notes">{info.notes.map(note=><span key={note}><Info size={15} aria-hidden="true"/>{note}</span>)}</div>
    <div className="round-intro-footer"><span>Tự bắt đầu sau</span>{children || <span>phần giới thiệu</span>}</div>
  </section>;
}
