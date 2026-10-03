'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { PlayerAvatar } from './PlayerAvatar';
import { PLAYER_COLORS } from '@/lib/playerAppearance';

type RankedPlayer = { id: string; nickname: string; avatarId: number; colorIndex: number; score: number; roundDelta?: number; correctRank?: number };

export function RankingBoard({ players, finished }: { players: RankedPlayer[]; finished: boolean }) {
  const [progress, setProgress] = useState(finished ? 1 : 0);
  const previousOrder = useMemo(() => [...players].sort((a, b) =>
    (b.score - (b.roundDelta ?? 0)) - (a.score - (a.roundDelta ?? 0)) || players.indexOf(a) - players.indexOf(b)
  ), [players]);
  useEffect(() => {
    if (finished) { setProgress(1); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setProgress(1); return; }
    let frame = 0;
    const started = performance.now();
    const animate = (now: number) => {
      const elapsed = now - started;
      const amount = Math.max(0, Math.min(1, (elapsed - 250) / 1350));
      setProgress(1 - Math.pow(1 - amount, 3));
      if (amount < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [finished]);

  const positionProgress = Math.max(0, Math.min(1, (progress - .22) / .78));
  const maxScore = Math.max(1, ...players.map(player => player.score));
  return <div className="ranking-board" aria-label="Bảng xếp hạng">
    {players.map((player, finalIndex) => {
      const previousIndex = previousOrder.findIndex(item => item.id === player.id);
      const oldScore = player.score - (player.roundDelta ?? 0);
      const shownScore = Math.round(oldScore + (player.score - oldScore) * progress);
      const rank = progress >= .8 ? finalIndex + 1 : previousIndex + 1;
      const position = previousIndex + (finalIndex - previousIndex) * positionProgress;
      const barWidth = Math.max(3, shownScore / maxScore * 100);
      return <div className={`ranking-card ${finalIndex === 0 ? 'leader' : ''}`} key={player.id} style={{ transform: `translateY(${position * 70}px)`, '--player-color': PLAYER_COLORS[player.colorIndex] ?? PLAYER_COLORS[0] } as CSSProperties}>
        <span className="ranking-place" aria-label={`Hạng ${rank}`}>{rank}</span>
        <PlayerAvatar id={player.avatarId} size={42} />
        <div className="ranking-player"><strong>{player.nickname}</strong><span className="ranking-meter"><i style={{ width: `${barWidth}%` }} /></span></div>
        <div className="ranking-points"><strong>{shownScore.toLocaleString('vi-VN')}</strong><small>điểm</small>{!!player.roundDelta && <em>+{player.roundDelta}</em>}</div>
      </div>;
    })}
  </div>;
}
