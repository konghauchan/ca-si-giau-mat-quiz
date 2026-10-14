export type IntroMode = 'OPEN' | 'BID' | 'CLUE';
export const ROUND_INTRO_MS = 18000;
export function roundRules(mode: IntroMode, film = false) {
  const media = film ? 'Xem' : 'Nghe';
  const content = mode === 'OPEN'
    ? { title: `Cùng ${media.toLowerCase()}, cùng đoán`, steps: [
      { title: `${media} cùng nhau`, description: 'Tất cả nhận cùng một đoạn.' },
      { title: 'Trả lời đáp án', description: 'Gõ tên hoặc chọn ABCD theo luật vòng.' },
      { title: 'Đúng sớm, điểm cao', description: 'Điểm giảm theo thời gian.' },
    ], notes: film ? ['Gõ: được thử lại · ABCD: chốt một lần'] : ['Gõ: được thử lại · ABCD: chốt một lần', 'Gõ: hé chữ giữa lượt · Điểm còn lại −30%'] }
    : mode === 'BID'
    ? { title: 'Đấu giá thời gian', steps: [
      { title: 'Đọc gợi ý · Đặt giây', description: `Chọn thời gian cần ${media.toLowerCase()}.` },
      { title: 'Cùng bắt đầu', description: `Mỗi người ${media.toLowerCase()} đúng số giây đã đặt.` },
      { title: 'Chốt 1 đáp án', description: 'Ít giây + trả lời nhanh → nhiều điểm.' },
    ], notes: ['Mỗi người chỉ trả lời 1 lần', 'Thời gian trả lời tính riêng sau đoạn nghe/xem'] }
    : { title: 'Đoán qua 6 gợi ý', steps: [
      { title: 'Xem gợi ý', description: 'Mở thêm gợi ý → điểm giảm.' },
      { title: 'Bấm “Tôi biết!”', description: 'Bấm trước, được trả lời ngay.' },
      { title: 'Chốt 1 đáp án', description: 'Đúng → nhận điểm đã khóa.' },
    ], notes: ['Sai / hết giờ → dừng câu này'] };
  return { ...content, rules: [...content.steps.map(step => `${step.title}. ${step.description}`), ...content.notes] };
}
export function roundIntroText(mode: IntroMode, round: number, film = false, language = 'vi-VN'): string {
  if (language === 'en-US') {
    const rules = mode === 'OPEN' ? 'Everyone watches or listens together. Text answers may be retried; multiple choice permits one answer. Faster correct answers earn more points.' : mode === 'BID' ? 'Read the hint and bid the time you need. Everyone starts together and hears their own bid duration. You get one answer with your own time limit. Fewer listening seconds and faster answers earn more points.' : 'Six clues open one by one. Press I know first to answer immediately. You get one answer. A wrong answer or timeout eliminates you from this question.';
    return `${round > 0 ? `Round ${round}. ` : ''}${rules}`;
  }
  const info = roundRules(mode, film);
  return `${round > 0 ? `Vòng ${round}. ` : ''}${info.title}. ${info.rules.join(' ')}`;
}
