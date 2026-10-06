import { z } from 'zod';
import { PLAY_MODES } from '@/lib/playModes';
import { CLUE_CATEGORIES } from '@/lib/clueRules';

const clue = z.object({
  id: z.string().min(1).max(80),
  text: z.string().min(1).max(500),
  score: z.number().int().min(1).max(10000),
  category: z.enum(CLUE_CATEGORIES)
});

export const questionSchema = z.object({
  // Older music quizzes store an empty clues_json array. Six clues are required
  // for clue rounds; old music questions may keep an empty array.
  clues: z.array(clue).max(6).optional(),
  playMode: z.enum(PLAY_MODES).optional(),
  prompt: z.string().min(1).max(300),
  gameRound: z.number().int().min(1).max(60),
  topicKey: z.string().min(1).max(80),
  listenSeconds: z.number().int().min(1).max(60),
  answerSeconds: z.number().int().min(5).max(60).default(12),
  bidSeconds: z.number().int().min(5).max(90).default(30),
  mediaType: z.enum(['youtube', 'uploaded_audio']),
  mediaUrl: z.string(),
  mediaStart: z.number().min(0),
  resultStart: z.number().min(0).max(36000).nullable().optional(),
  resultSeconds: z.number().int().min(1).max(60).nullable().optional(),
  primaryAnswer: z.string().min(1).max(120),
  acceptedAnswers: z.array(z.string().max(120)).max(20),
  artist: z.string().max(120),
  hint: z.string().max(200),
  revealMin: z.number().int().min(1).max(30),
  revealMax: z.number().int().min(1).max(30),
  revealStep: z.number().int().min(1).max(30)
});

export const topicSchema = z.object({
  key: z.string().min(1).max(80),
  gameRound: z.number().int().min(1).max(60),
  title: z.string().min(1).max(80),
  songCount: z.number().int().min(1).max(60)
});

export const quizSchema = z.object({
  id: z.string().uuid().optional(),
  coverSourceId: z.string().uuid().optional(),
  gameType: z.enum(['MUSIC_BID', 'SONG_CLUE', 'MUSIC_DUEL', 'FILM_DUEL']).default('MUSIC_BID'),
  title: z.string().min(1).max(100),
  description: z.string().max(500),
  visibility: z.enum(['private', 'unlisted', 'public']),
  topics: z.array(topicSchema).min(1).max(60),
  questions: z.array(questionSchema).min(1).max(60)
}).superRefine((quiz, ctx) => {
  for (const [index,q] of quiz.questions.entries()) {
    if (quiz.gameType === 'FILM_DUEL' && q.mediaType !== 'youtube') ctx.addIssue({code:'custom',path:['questions',index,'mediaType'],message:'Đọ Phim chỉ dùng video YouTube.'});
    if ((quiz.gameType === 'MUSIC_DUEL' || quiz.gameType === 'FILM_DUEL') && q.playMode === 'CLUE' && q.clues?.length !== 6) ctx.addIssue({code:'custom',path:['questions',index,'clues'],message:'Bài này cần đủ 6 gợi ý.'});
    if ((quiz.gameType === 'MUSIC_DUEL' || quiz.gameType === 'FILM_DUEL') && !q.playMode) ctx.addIssue({code:'custom',path:['questions',index,'playMode'],message:'Chọn luật cho vòng chơi.'});
    const topicIndex = quiz.topics.findIndex(t=>t.key===q.topicKey && t.gameRound===q.gameRound);
    if(topicIndex<0) ctx.addIssue({code:'custom',path:['questions',index,'topicKey'],message:'Bài hát chưa thuộc chủ đề hợp lệ.'});
  }
  const rounds = [...new Set(quiz.topics.map(t => t.gameRound))].sort((a,b) => a-b);
  for (const [index, round] of rounds.entries()) {
    if (round !== index + 1) ctx.addIssue({code:'custom', path:['topics', quiz.topics.findIndex(t => t.gameRound === round), 'gameRound'], message:'Các vòng phải liên tiếp từ vòng 1.'});
    const questions = quiz.questions.filter(q => q.gameRound === round);
    const mode = questions[0]?.playMode;
    for (const [i, q] of quiz.questions.entries()) if (q.gameRound === round && q.playMode !== mode) ctx.addIssue({code:'custom',path:['questions',i,'playMode'],message:'Các bài trong một vòng phải cùng luật chơi.'});
  }
});
