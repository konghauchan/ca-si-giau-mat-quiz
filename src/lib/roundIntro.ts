export type IntroMode = 'OPEN' | 'BID' | 'CLUE';
export const ROUND_INTRO_MS = 18000;
export function roundRules(mode: IntroMode, film = false): { title: string; rules: string[] } {
  const media = film ? 'xem phim' : 'nghe nhạc';
  if (mode === 'OPEN') return { title: film ? 'Cùng xem, cùng đoán' : 'Cùng nghe, cùng đoán', rules: [`Tất cả cùng ${media} rồi nhập đáp án.`, 'Trả lời sai được thử lại khi còn thời gian.', 'Trả lời đúng càng sớm, điểm càng cao.'] };
  if (mode === 'BID') return { title: 'Đấu giá thời gian', rules: [`Đọc gợi ý và chọn số giây cần ${media}.`, 'Chọn ít giây nhất được trả lời trước; mỗi người chỉ gửi một đáp án.', 'Nếu sai, lượt chuyển sang nhóm tiếp theo. Người trùng mức chọn cùng thi tốc độ.'] };
  return { title: 'Đoán qua 6 gợi ý', rules: ['Gợi ý lần lượt mở từ khó đến dễ, điểm giảm dần.', 'Bấm “Tôi biết!” trước để giành quyền trả lời ngay.', 'Mỗi lượt một đáp án. Sai hoặc hết giờ sẽ bị loại khỏi câu này.'] };
}
export function roundIntroText(mode: IntroMode, round: number, film = false, language = 'vi-VN'): string {
  if (language === 'en-US') {
    const rules = mode === 'OPEN' ? 'Everyone watches or listens together. Wrong guesses may be retried before time runs out. Faster correct answers earn more points.' : mode === 'BID' ? 'Read the hint and bid the time you need. Lowest bids answer first. You get one answer. If wrong, the next group plays.' : 'Six clues open one by one. Press I know first to answer immediately. You get one answer. A wrong answer or timeout eliminates you from this question.';
    return `Round ${round}. ${rules}`;
  }
  const info = roundRules(mode, film);
  return `Vòng ${round}. ${info.title}. ${info.rules.join(' ')}`;
}
