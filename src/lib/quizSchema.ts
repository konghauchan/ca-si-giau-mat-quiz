import { z } from 'zod';
import { CLUE_CATEGORIES } from '@/lib/clueRules';

const clue = z.object({
  id: z.string().min(1).max(80),
  text: z.string().min(1).max(500),
  score: z.number().int().min(1).max(10000),
  category: z.enum(CLUE_CATEGORIES)
});

export const questionSchema = z.object({
  // Older music quizzes store an empty clues_json array. Five clues are required
  // only for SONG_CLUE, which saveQuiz validates separately.
  clues: z.array(clue).max(5).optional(),
  prompt: z.string().min(1).max(300),
  gameRound: z.union([z.literal(1), z.literal(2)]),
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
  gameRound: z.union([z.literal(1), z.literal(2)]),
  title: z.string().min(1).max(80),
  songCount: z.number().int().min(1).max(60)
});

export const quizSchema = z.object({
  id: z.string().uuid().optional(),
  coverSourceId: z.string().uuid().optional(),
  gameType: z.enum(['MUSIC_BID', 'SONG_CLUE']).default('MUSIC_BID'),
  title: z.string().min(1).max(100),
  description: z.string().max(500),
  visibility: z.enum(['private', 'unlisted', 'public']),
  topics: z.array(topicSchema).min(1).max(30),
  questions: z.array(questionSchema).min(1).max(60)
});
