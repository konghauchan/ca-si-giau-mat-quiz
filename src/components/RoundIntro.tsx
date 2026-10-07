import { roundRules, type IntroMode } from '@/lib/roundIntro';
import { Headphones, Film, Sparkles } from 'lucide-react';
export function RoundIntro({ round, mode, film = false, children }: { round: number; mode: IntroMode; film?: boolean; children?: React.ReactNode }) {
  const info = roundRules(mode, film);
  return <section className="panel round-intro" aria-label={`Giới thiệu vòng ${round}`}><div className="round-intro-icon">{mode === 'CLUE' ? <Sparkles size={38}/> : film ? <Film size={38}/> : <Headphones size={38}/>}</div><span className="phase-pill">SẮP BẮT ĐẦU · VÒNG {round}</span><h2>{info.title}</h2><ol>{info.rules.map(rule=><li key={rule}>{rule}</li>)}</ol><p className="muted">Vòng chơi tự bắt đầu sau phần giới thiệu.</p>{children}</section>;
}
