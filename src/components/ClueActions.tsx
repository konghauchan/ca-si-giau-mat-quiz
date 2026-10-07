'use client';
import { ArrowRight, Check, Users, Zap } from 'lucide-react';

export function ClueActions({ disabled, hasVoted, votes, requiredVotes, lastClue, answerSeconds, pending = '', onBuzz, onVote }: {
  disabled: boolean; hasVoted: boolean; votes: number; requiredVotes: number; lastClue: boolean; answerSeconds: number;
  pending?: string; onBuzz: () => void; onVote: () => void;
}) {
  return <div className="clue-choice-area">
    <div className="clue-action-grid">
      <button type="button" className="button clue-action-card clue-action-buzz" aria-label="TÔI BIẾT!" disabled={disabled} onClick={onBuzz}>
        <span className="clue-action-icon"><Zap size={26}/></span>
        <span className="clue-action-copy"><strong>{pending === 'buzz' ? 'Đang mở ô trả lời…' : 'TÔI BIẾT!'}</strong><small>Bấm để trả lời ngay · {answerSeconds} giây</small></span>
        <ArrowRight size={20}/>
      </button>
      <button type="button" className={`button clue-action-card clue-action-vote ${hasVoted ? 'has-voted' : ''}`} aria-label={lastClue ? 'Bình chọn xem đáp án' : 'Bình chọn gợi ý tiếp'} disabled={disabled || hasVoted} onClick={onVote}>
        <span className="clue-action-icon">{hasVoted ? <Check size={26}/> : <Users size={26}/>}</span>
        <span className="clue-action-copy"><strong>{pending === 'nextClue' ? 'Đang ghi nhận…' : hasVoted ? 'Đã bình chọn' : lastClue ? 'Xem đáp án' : 'Gợi ý tiếp'}</strong><small>{votes}/{requiredVotes} phiếu · {hasVoted ? 'Chờ các bạn đồng ý' : 'Bình chọn để mở sớm'}</small></span>
      </button>
    </div>
    <p className="clue-action-help">Người bấm “Tôi biết” trước được trả lời ngay, chỉ một lần. Sai hoặc hết giờ sẽ mất quyền ở câu này.</p>
    <p className="clue-vote-help" role="status">{hasVoted ? `Bạn đã bình chọn. Cần thêm ${Math.max(0, requiredVotes - votes)} phiếu để ${lastClue ? 'xem đáp án' : 'mở gợi ý tiếp'}. Bạn vẫn có thể bấm “Tôi biết”.` : `Cần ${requiredVotes} phiếu từ những người còn quyền trả lời. Hết thời gian sẽ tự ${lastClue ? 'hiện đáp án' : 'mở gợi ý tiếp'}.`}</p>
  </div>;
}
