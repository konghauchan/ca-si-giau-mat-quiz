export type IntroMode = 'OPEN' | 'BID' | 'CLUE';
export const ROUND_INTRO_MS = 18000;
export function roundRules(mode: IntroMode, film = false) {
  const media = film ? 'Xem' : 'Nghe';
  const content = mode === 'OPEN'
    ? { title: `Cùng ${media.toLowerCase()}, cùng đoán`, steps: [
      { title: `${media} cùng nhau`, description: 'Tất cả nhận cùng một đoạn.' },
      { title: 'Gõ đáp án', description: 'Sai? Thử tiếp khi còn giờ.' },
      { title: 'Đúng sớm, điểm cao', description: 'Điểm giảm theo thời gian.' },
    ], notes: ['Được thử nhiều đáp án'] }
    : mode === 'BID'
    ? { title: 'Đấu giá thời gian', steps: [
      { title: 'Đọc gợi ý · Đặt giây', description: `Chọn thời gian cần ${media.toLowerCase()}.` },
      { title: 'Ít giây, chơi trước', description: `Nhóm đặt ít nhất được ${media.toLowerCase()} trước.` },
      { title: 'Chốt 1 đáp án', description: 'Sai → chuyển nhóm tiếp theo.' },
    ], notes: ['Mỗi người chỉ trả lời 1 lần', 'Trùng giây → cùng thi tốc độ'] }
    : { title: 'Đoán qua 6 gợi ý', steps: [
      { title: 'Xem gợi ý', description: 'Mở thêm gợi ý → điểm giảm.' },
      { title: 'Bấm “Tôi biết!”', description: 'Bấm trước, được trả lời ngay.' },
      { title: 'Chốt 1 đáp án', description: 'Đúng → nhận điểm đã khóa.' },
    ], notes: ['Sai / hết giờ → dừng câu này'] };
  return { ...content, rules: [...content.steps.map(step => `${step.title}. ${step.description}`), ...content.notes] };
}
export function roundIntroText(mode: IntroMode, round: number, film = false, language = 'vi-VN'): string {
  if (language === 'en-US') {
    const rules = mode === 'OPEN' ? 'Everyone watches or listens together. Wrong guesses may be retried before time runs out. Faster correct answers earn more points.' : mode === 'BID' ? 'Read the hint and bid the time you need. Lowest bids answer first. You get one answer. If wrong, the next group plays.' : 'Six clues open one by one. Press I know first to answer immediately. You get one answer. A wrong answer or timeout eliminates you from this question.';
    return `${round > 0 ? `Round ${round}. ` : ''}${rules}`;
  }
  const info = roundRules(mode, film);
  return `${round > 0 ? `Vòng ${round}. ` : ''}${info.title}. ${info.rules.join(' ')}`;
}
