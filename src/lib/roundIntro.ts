import type { AnswerMode } from './multiplayer';

export type IntroMode = 'OPEN' | 'BID' | 'CLUE';
export const ROUND_INTRO_MS = 18000;
export function answerAction(answerMode: AnswerMode, film = false, language = 'vi-VN'): string {
  if (language === 'en-US') {
    if (answerMode === 'SEARCH') return 'Search by song title or artist. Selecting a song submits it immediately.';
    return answerMode === 'CHOICE' ? 'Choose one of the four answers.' : `Type the ${film ? 'film' : 'song'} title and press Submit.`;
  }
  if (answerMode === 'SEARCH') return 'Tìm tên bài hoặc ca sĩ. Chọn bài là gửi ngay.';
  return answerMode === 'CHOICE' ? 'Chọn một trong bốn đáp án.' : `Gõ tên ${film ? 'phim' : 'bài hát'} rồi bấm Gửi đáp án.`;
}
export function roundRules(mode: IntroMode, film = false, answerMode: AnswerMode = 'TEXT') {
  const media = film ? 'Xem' : 'Nghe';
  const answer = { title: answerMode === 'SEARCH' ? 'Tìm và chọn bài' : answerMode === 'CHOICE' ? 'Chọn đáp án' : 'Gõ đáp án', description: answerAction(answerMode, film) };
  const content = mode === 'OPEN'
    ? { title: `Cùng ${media.toLowerCase()}, cùng đoán`, steps: [
      { title: `${media} cùng nhau`, description: 'Tất cả nhận cùng một đoạn.' },
      answer,
      { title: 'Đúng sớm, điểm cao', description: 'Điểm giảm theo thời gian.' },
    ], notes: answerMode === 'SEARCH' ? ['Chọn sai: tìm và chọn lại trước khi hết giờ'] : answerMode === 'CHOICE' ? ['Chốt một lần · Công bố đúng sai khi hết giờ'] : film ? ['Sai: được thử lại trước khi hết giờ'] : ['Sai: được thử lại trước khi hết giờ', 'Hé chữ giữa lượt · Điểm còn lại −30%'] }
    : mode === 'BID'
    ? { title: 'Đấu giá thời gian', steps: [
      { title: 'Đọc gợi ý · Đặt giây', description: `Chọn thời gian cần ${media.toLowerCase()}.` },
      { title: 'Cùng bắt đầu', description: `Mỗi người ${media.toLowerCase()} đúng số giây đã đặt.` },
      answer,
    ], notes: ['Chỉ chốt 1 lần · Ít giây, trả lời nhanh → nhiều điểm', 'Thời gian trả lời tính riêng sau đoạn nghe/xem', ...(answerMode === 'CHOICE' ? ['Công bố đúng sai khi hết giờ'] : [])] }
    : { title: 'Đoán qua 6 gợi ý', steps: [
      { title: 'Xem gợi ý', description: 'Mở thêm gợi ý → điểm giảm.' },
      { title: 'Bấm “Tôi biết!”', description: 'Bấm trước, được trả lời ngay.' },
      answer,
    ], notes: ['Chỉ chốt 1 lần · Đúng → nhận điểm đã khóa', 'Sai / hết giờ → dừng câu này'] };
  return { ...content, rules: [...content.steps.map(step => `${step.title}. ${step.description}`), ...content.notes] };
}
export function roundIntroText(mode: IntroMode, round: number, film = false, language = 'vi-VN', answerMode: AnswerMode = 'TEXT'): string {
  const action = answerAction(answerMode, film, language);
  if (language === 'en-US') {
    const media = film ? 'watch' : 'listen';
    const rules = mode === 'OPEN' ? `Everyone ${film ? 'watches' : 'listens'} together. ${action} ${answerMode === 'CHOICE' ? 'You get one selection. Results appear when time is up.' : 'If wrong, try again before time is up.'} Faster correct answers earn more points.` : mode === 'BID' ? `Read the hint and bid your ${film ? 'viewing' : 'listening'} time. Everyone starts together; ${media} for your own bid duration. ${action} You get one answer. Fewer seconds and faster answers earn more points.${answerMode === 'CHOICE' ? ' Results appear when time is up.' : ''}` : `Six clues open one by one. Press I know first to answer. ${action} You get one answer. A wrong answer or timeout eliminates you from this question.`;
    return `${round > 0 ? `Round ${round}. ` : ''}${rules}`;
  }
  const rules = mode === 'OPEN'
    ? `Cùng ${film ? 'xem' : 'nghe'}, cùng đoán. ${action} ${answerMode === 'CHOICE' ? 'Chỉ chọn một lần. Hết giờ mới công bố đúng sai.' : 'Sai có thể thử lại trước khi hết giờ.'} Đúng càng sớm, điểm càng cao.`
    : mode === 'BID'
    ? `Đấu giá thời gian. Đọc gợi ý và đặt số giây cần ${film ? 'xem' : 'nghe'}. Mọi người cùng bắt đầu, mỗi người ${film ? 'xem' : 'nghe'} đúng số giây đã đặt. ${action} Chỉ chốt một lần. Ít giây, trả lời nhanh được nhiều điểm.${answerMode === 'CHOICE' ? ' Hết giờ mới công bố đúng sai.' : ''}`
    : `Đoán qua sáu gợi ý. Bấm Tôi biết trước để giành quyền. ${action} Chỉ chốt một lần. Sai hoặc hết giờ thì dừng câu này. Càng ít gợi ý, điểm càng cao.`;
  return `${round > 0 ? `Vòng ${round}. ` : ''}${rules}`;
}
