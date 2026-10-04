export type Phase = 'LOBBY' | 'TOPIC_INTRO' | 'OPEN_MEDIA_PLAYING' | 'OPEN_ANSWERING' | 'BIDDING' | 'BID_REVEAL' | 'TURN_TRANSITION' | 'MEDIA_PLAYING' | 'ANSWERING' | 'ROUND_RESULT' | 'SCOREBOARD' | 'GAME_FINISHED';
export type Bid = { playerId: string; amount: number };
export type BidGroup = { amount: number; playerIds: string[] };

export function groupBids(bids: Bid[]): BidGroup[] {
  const groups = new Map<number, string[]>();
  for (const bid of bids) groups.set(bid.amount, [...(groups.get(bid.amount) ?? []), bid.playerId]);
  return [...groups].sort(([a], [b]) => a - b).map(([amount, playerIds]) => ({ amount, playerIds }));
}

export function nextGroup(groups: BidGroup[], currentAmount: number | null): BidGroup | null {
  return groups.find(group => currentAmount === null || group.amount > currentAmount) ?? null;
}

export function scoreForBid(amount: number, min = 1, max = 10, step = 1): number {
  if (amount < min || amount > max || (amount - min) % step !== 0) throw new Error('Thời gian đấu giá không hợp lệ.');
  return (Math.floor((max - amount) / step) + 1) * 100;
}

export function scoreForCorrectRank(basePoints: number, correctRank: number): number {
  if (!Number.isInteger(correctRank) || correctRank < 1 || correctRank > 4) throw new Error('Thứ tự trả lời đúng không hợp lệ.');
  return Math.round(basePoints * (5 - correctRank) / 4);
}

export function scoreForTimedAnswer(maxPoints: number, startedAt: number, endsAt: number, answeredAt: number): number {
  const duration = Math.max(1, endsAt - startedAt);
  const remaining = Math.max(0, Math.min(duration, endsAt - answeredAt));
  return Math.max(0, Math.round(maxPoints * remaining / duration));
}

export function normalizeAnswer(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function answerMatches(answer: string, accepted: string[]): boolean {
  const normalized = normalizeAnswer(answer);
  return normalized.length > 0 && accepted.some(candidate => normalizeAnswer(candidate) === normalized);
}

export function youtubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    let id: string | null = null;
    if (host === 'youtu.be' || host === 'www.youtu.be') id = parsed.pathname.slice(1).split('/')[0];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
      id = parsed.pathname === '/watch' ? parsed.searchParams.get('v') : parsed.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] ?? null;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
