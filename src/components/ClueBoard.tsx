import type { Clue } from '@/lib/clueRules';

/** Only revealed clue text is passed to this board; unopened tiles contain no answers. */
export function ClueBoard({items,index,scores}:{items:Clue[];index:number;scores:number[]}) {
  return <div className="clue-board" aria-label="Bảng gợi ý">
    <aside className="clue-ladder" aria-label="Điểm theo gợi ý">
      <span>ĐIỂM</span>
      {scores.map((score,i)=><div key={i} className={i===index?'active':i<index?'passed':''} aria-current={i===index?'step':undefined}><small>{i+1}</small><strong>{score.toLocaleString('vi-VN')}</strong></div>)}
    </aside>
    <div className="clue-tiles" aria-live="polite">
      {scores.map((_,i)=>{const clue=items[i];return <article key={i} className={`clue-tile ${clue?'revealed':'sealed'} ${clue&&i===index?'current':''}`} aria-label={`Gợi ý ${i+1}${clue?'':', chưa mở'}`}>
        <span className="clue-tile-number">GỢI Ý {i+1}</span>
        {clue?<p>{clue.text||'Nội dung gợi ý sẽ xuất hiện ở đây.'}</p>:<span className="clue-question" aria-hidden="true">?</span>}
      </article>;})}
    </div>
  </div>;
}
