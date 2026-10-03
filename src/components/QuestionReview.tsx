'use client';
import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { ClipPlayer } from './ClipPlayer';
import { AudioClipPlayer } from './AudioClipPlayer';
import { answerMatches, youtubeId } from '@/lib/core';
import { parseStartTime } from '@/lib/time';

type ReviewQuestion = {
  prompt: string; gameRound: 1 | 2; listenSeconds: number; answerSeconds: number;
  mediaType: 'youtube' | 'uploaded_audio'; mediaUrl: string; mediaStart: string;
  resultStart: string | null; resultSeconds: number | null;
  primaryAnswer: string; acceptedAnswers: string[]; artist: string; hint: string; revealMin: number; revealMax: number; revealStep: number;
};
type Stage = 'bid' | 'listen' | 'answer' | 'result';

export function QuestionReview({ question, topicName, onClose }: { question: ReviewQuestion; topicName: string; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>(question.gameRound === 2 ? 'bid' : 'listen');
  const [bid, setBid] = useState(question.revealMin);
  const [answer, setAnswer] = useState('');
  const [locked, setLocked] = useState(false); const [attempts, setAttempts] = useState(0); const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null); const [lastAnswer, setLastAnswer] = useState('');
  const start = parseStartTime(question.mediaStart);
  const resultStart = question.resultStart === null ? null : parseStartTime(question.resultStart);
  const mediaReady = question.mediaType === 'youtube' ? !!youtubeId(question.mediaUrl) : question.mediaUrl.startsWith('asset:');
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [onClose]);
  const stages: Array<{ value: Stage; title: string }> = question.gameRound === 2
    ? [{ value: 'bid', title: 'Gợi ý & đấu giá' }, { value: 'listen', title: 'Nghe nhạc' }, { value: 'answer', title: 'Trả lời' }, { value: 'result', title: 'Kết quả' }]
    : [{ value: 'listen', title: 'Nghe nhạc' }, { value: 'answer', title: 'Trả lời' }, { value: 'result', title: 'Kết quả' }];
  return <div className="review-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`review-dialog game-room ${stage === 'result' && question.mediaType === 'youtube' && mediaReady ? 'review-result-only' : ''}`} role="dialog" aria-modal="true" aria-label="Xem trước câu hỏi theo giao diện người chơi">
      <div className="review-topbar"><div><span className="kicker">XEM THỬ GIAO DIỆN NGƯỜI CHƠI</span><h2>Vòng {question.gameRound} · {topicName}</h2></div><button type="button" className="button secondary" onClick={onClose} aria-label="Đóng xem thử"><X size={18} /> Đóng</button></div>
      <div className="review-stages" role="tablist" aria-label="Các bước của câu hỏi">{stages.map(item => <button type="button" role="tab" aria-selected={stage === item.value} className={stage === item.value ? 'active' : ''} key={item.value} onClick={() => setStage(item.value)}>{item.title}</button>)}</div>
      <div className="game-topic-label"><span>VÒNG {question.gameRound} · CHỦ ĐỀ</span><strong>{topicName}</strong><small>Bản xem thử</small></div>
      <div className="review-body room-layout"><div className="room-main">
        {stage === 'bid' && <div className="panel"><div className="phase-banner"><div><span className="phase-pill">ĐẤU GIÁ BÍ MẬT</span><h2>{question.prompt || 'Đây là bài hát nào?'}</h2></div><span className="timer">30s</span></div><div className="hint-card"><span>GỢI Ý TRƯỚC KHI ĐẤU GIÁ</span><strong>{question.hint || 'Gợi ý sẽ xuất hiện tại đây.'}</strong></div><p className="subtitle">Bạn cần nghe bao nhiêu giây để đoán?</p><div className="bid-options">{Array.from({ length: Math.max(0, Math.min(30, Math.floor((question.revealMax - question.revealMin) / Math.max(1, question.revealStep)) + 1)) }, (_, index) => question.revealMin + index * question.revealStep).map(amount => <button type="button" key={amount} className={`bid-option ${bid === amount ? 'active' : ''}`} onClick={() => setBid(amount)}>{amount}s</button>)}</div><button type="button" className="button primary big full" onClick={() => setStage('listen')}>Chốt {bid} giây <Check size={18} /></button></div>}
        {stage === 'listen' && <div className="panel"><div className="phase-banner"><div><span className="phase-pill">VÒNG {question.gameRound} · {question.gameRound === 1 ? `CÙNG NGHE ${question.listenSeconds} GIÂY` : `NGHE ${bid} GIÂY`}</span><h2>{question.prompt || 'Đây là bài hát nào?'}</h2></div><span className="timer">{question.gameRound === 1 ? question.listenSeconds : bid}s</span></div><p className="subtitle">{question.gameRound === 1 ? 'Tất cả người chơi cùng nghe và đoán.' : 'Bạn đang nghe nhạc theo thời gian đã chọn.'}</p>{mediaReady && start !== null ? question.mediaType === 'youtube' ? <ClipPlayer key={`listen-${question.mediaUrl}-${start}-${bid}`} url={question.mediaUrl} start={start} duration={question.gameRound === 1 ? question.listenSeconds : bid} /> : <AudioClipPlayer key={`listen-${question.mediaUrl}-${start}`} asset={question.mediaUrl} start={start} duration={question.gameRound === 1 ? question.listenSeconds : bid} preview /> : <div className="notice info">Nhập đường dẫn YouTube và thời điểm bắt đầu hợp lệ để nghe thử.</div>}<button type="button" className="button secondary" onClick={() => setStage('answer')}>Xem bước trả lời</button></div>}
        {stage === 'answer' && <div className="panel"><div className="phase-banner"><div><span className="phase-pill">VÒNG {question.gameRound} · TRẢ LỜI</span><h2>Tên bài hát là gì?</h2></div><span className="timer">{question.answerSeconds}s</span></div><p className="muted">Có thể thử nhiều đáp án trong thời gian trả lời. Đúng sẽ chốt lượt.</p>{feedback && <div className={`answer-feedback ${feedback}`} role="status"><strong>{feedback === 'correct' ? 'Trả lời đúng!' : `Chưa đúng · lần thử ${attempts}`}</strong></div>}{locked ? <div className="notice success">Đã trả lời đúng: <b>{lastAnswer}</b>.</div> : <form onSubmit={event => { event.preventDefault(); const guess = answer.trim(); if (!guess) return; const correct = answerMatches(guess, [question.primaryAnswer, ...question.acceptedAnswers]); setAttempts(value => value + 1); setFeedback(correct ? 'correct' : 'wrong'); setLastAnswer(guess); setLocked(correct); setAnswer(''); }}><div className="field"><label>Đáp án của bạn</label><input value={answer} maxLength={120} onChange={event => setAnswer(event.target.value)} placeholder="Nhập tên bài hát khác" /></div><button type="submit" className="button primary big full" disabled={!answer.trim()}>Gửi đáp án</button></form>}</div>}
        {stage === 'result' && (question.mediaType === 'youtube' && mediaReady ? <div className="panel result-video-only"><ClipPlayer key={`result-${question.mediaUrl}-${resultStart}-${question.resultSeconds}`} url={question.mediaUrl} start={resultStart ?? start ?? 0} duration={question.resultSeconds ?? 4} reveal /></div> : <div className="panel"><div className="phase-banner"><span className="phase-pill">KẾT QUẢ VÒNG {question.gameRound}</span></div><h2>Đáp án là</h2><div className="result-answer">{question.primaryAnswer || 'Tên bài hát'}</div>{question.artist && <p className="subtitle">Nghệ sĩ: {question.artist}</p>}<div className="divider" /><p className="countline">Bảng điểm sẽ tự hiện sau đoạn kết quả.</p></div>)}
      </div><aside className="panel game-sidebar"><span className="kicker">GIAO DIỆN NGƯỜI CHƠI</span><h3>Bạn đang xem câu hỏi</h3><p className="muted">Đây là bản mô phỏng. Điểm số, đồng hồ và người chơi thật sẽ xuất hiện khi vào phòng.</p><div className="divider" /><div className="game-sidebar-status"><span>TRẠNG THÁI</span><strong>{stages.find(item => item.value === stage)?.title}</strong><small>Vòng {question.gameRound} · {topicName}</small></div></aside></div>
    </div>
  </div>;
}
