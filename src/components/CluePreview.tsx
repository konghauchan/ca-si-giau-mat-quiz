'use client';
import { useEffect, useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { ClueActions } from './ClueActions';
import { ClueBoard } from './ClueBoard';
import { NarrationControl } from './NarrationControl';
import { answerMatches } from '@/lib/core';
import { answerClue, catchUpClue, claimBuzzer, clueInitial, requiredVotes, voteClue, type Clue, type ClueState } from '@/lib/clueRules';

const players = ['you', 'alex', 'blake', 'casey'];
const initial = () => ({ ...clueInitial(Date.now()), phase: 'CLUE_ACTIVE' as const, endsAt: Date.now() + 15000 });
export function CluePreview({ clues, title, artist, onClose, film = false, acceptedAnswers = [], answerSeconds = 8, clueSeconds = 15 }: {
  clues: Clue[]; title: string; artist: string; film?: boolean; onClose: () => void; acceptedAnswers?: string[]; answerSeconds?: number; clueSeconds?: number;
}) {
  const [state, setState] = useState<ClueState>(() => ({ ...initial(), endsAt: Date.now() + clueSeconds * 1000 }));
  const [answer, setAnswer] = useState('');
  const [clock, setClock] = useState(Date.now());
  const question = { clues, answerSeconds, clueSeconds };
  useEffect(() => {
    const timer = setInterval(() => { const now = Date.now(); setClock(now); setState(current => catchUpClue(current, [{ clues, answerSeconds, clueSeconds }], players, now)); }, 200);
    return () => clearInterval(timer);
  }, [clues, answerSeconds, clueSeconds]);
  const eliminated = state.eliminated.includes('you');
  const eligible = players.filter(id => !state.eliminated.includes(id));
  const result = state.phase === 'CLUE_RESULT' || state.phase === 'GAME_FINISHED';
  function reset() { setAnswer(''); setState({ ...initial(), endsAt: Date.now() + clueSeconds * 1000 }); }
  function act(action: 'buzz' | 'vote' | 'answer') {
    setState(current => {
      const now = Date.now();
      const next = catchUpClue(current, [question], players, now);
      if (action === 'answer') return next.phase === 'CLUE_ANSWERING' && next.holder === 'you'
        ? answerClue(next, 'you', answerMatches(answer, [title, ...acceptedAnswers]), answer.trim(), now) : next;
      if (next.phase !== 'CLUE_ACTIVE' || next.eliminated.includes('you')) return next;
      return action === 'buzz' ? claimBuzzer(next, question, 'you', now) : voteClue(next, question, 'you', players, now);
    });
    if (action === 'buzz') setAnswer('');
  }
  function simulateVotes() {
    setState(current => {
      let next = catchUpClue(current, [question], players, Date.now());
      const index = current.clueIndex;
      for (const id of eligible.filter(id => id !== 'you')) {
        if (next.phase !== 'CLUE_ACTIVE' || next.clueIndex !== index) break;
        next = voteClue(next, question, id, players, Date.now());
      }
      return next;
    });
  }
  return <div className="clue-preview-modal" role="dialog" aria-modal="true" aria-label="Xem như người chơi"><section className="panel">
    <div className="phase-banner"><span className="kicker">CHƠI THỬ · MÔ PHỎNG 4 NGƯỜI</span><button type="button" className="button ghost" onClick={onClose} aria-label="Đóng xem trước"><X/></button></div>
    <NarrationControl kind={result||state.phase==='CLUE_ACTIVE'?'preview':undefined} previewText={result?`Đáp án là: ${title}. ${artist}`:`Gợi ý ${state.clueIndex+1}: ${clues[state.clueIndex].text}`}/>
    {result ? <div className="clue-preview-result" role="status">
      {state.outcome === 'correct' ? <><Check size={40}/><h2>Chính xác!</h2><p>Bạn nhận <strong>+{state.lockedScore} điểm</strong></p></> : <><h2>Đáp án của câu này</h2><p>Chưa có người trả lời đúng.</p></>}
      <div className="result-answer">{title || 'Chưa nhập đáp án'}</div><p>{artist}</p><button type="button" className="button secondary" onClick={reset}><RotateCcw size={18}/>Chơi thử lại</button>
    </div> : <>
      <div className="clue-value"><span>{film ? 'BỘ PHIM BÍ ẨN' : 'BÀI HÁT BÍ ẨN'}</span><strong>{state.phase === 'CLUE_ANSWERING' ? state.lockedScore : clues[state.clueIndex].score} điểm</strong></div>
      <div className="clue-preview-status"><span>Gợi ý {state.clueIndex + 1}/{clues.length}</span><strong>{Math.max(0, Math.ceil((Number(state.endsAt) - clock) / 1000))}s</strong></div>
      <ClueBoard items={clues.slice(0, state.clueIndex + 1)} index={state.clueIndex} scores={clues.map(c => c.score)}/>
      {state.phase === 'CLUE_ACTIVE' && <>
        {eliminated ? <div className="notice error" role="status">Bạn đã mất quyền trả lời ở câu này. Những người còn lại tiếp tục chơi.</div> : <ClueActions disabled={false} hasVoted={state.votes.includes('you')} votes={state.votes.length} requiredVotes={requiredVotes(eligible.length)} lastClue={state.clueIndex === clues.length - 1} answerSeconds={answerSeconds} onBuzz={() => act('buzz')} onVote={() => act('vote')}/>}
        {(state.votes.includes('you') || eliminated) && <div className="clue-preview-simulation"><p>Trong phòng thật, hệ thống chờ phiếu của các bạn. Ở bản chơi thử, bạn có thể mô phỏng số phiếu còn thiếu.</p><button type="button" className="button secondary" onClick={simulateVotes}>Mô phỏng các bạn đồng ý</button></div>}
      </>}
      {state.phase === 'CLUE_ANSWERING' && <form className="clue-answer-form" onSubmit={event => { event.preventDefault(); if (answer.trim()) act('answer'); }}>
        <h2>Đến lượt bạn trả lời!</h2><p>Đã khóa {state.lockedScore} điểm. Ba người còn lại chờ bạn trả lời.</p>
        <div className="field"><label htmlFor="preview-clue-answer">{film ? 'Nhập tên phim' : 'Nhập tên bài hát'}</label><input id="preview-clue-answer" autoFocus value={answer} onChange={event => setAnswer(event.target.value)} maxLength={120} autoComplete="off"/></div>
        <button className="button primary big full" disabled={!answer.trim()}>Chốt đáp án · chỉ một lần</button>
      </form>}
      {state.phase === 'CLUE_FEEDBACK' && <div className="answer-feedback wrong" role="status"><X size={28}/><div><strong>{state.outcome === 'timeout' ? 'Bạn đã hết thời gian' : 'Trả lời chưa đúng'}</strong><span>Bạn mất quyền ở câu này. Những người còn lại tiếp tục chơi.</span></div></div>}
    </>}
    <p className="clue-preview-note">Đây là phòng mô phỏng. Đáp án và điểm không được lưu.</p>
  </section></div>;
}
