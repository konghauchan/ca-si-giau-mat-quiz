import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteQuiz, getQuiz, listQuizzes, saveQuiz, setQuizVisibility } from '@/lib/game';
export const runtime = 'nodejs';

const question = z.object({
  prompt: z.string().min(1).max(300), gameRound: z.union([z.literal(1), z.literal(2)]), topicKey: z.string().min(1).max(80), listenSeconds: z.number().int().min(1).max(10), answerSeconds: z.number().int().min(5).max(60).default(12), mediaType: z.enum(['youtube', 'uploaded_audio']), mediaUrl: z.string().min(1), mediaStart: z.number().min(0), resultStart: z.number().min(0).max(36000).nullable().optional(), resultSeconds: z.number().int().min(1).max(60).nullable().optional(),
  primaryAnswer: z.string().min(1).max(120), acceptedAnswers: z.array(z.string().max(120)).max(20),
  artist: z.string().max(120), hint: z.string().max(200), revealMin: z.number().int().min(1).max(30),
  revealMax: z.number().int().min(1).max(30), revealStep: z.number().int().min(1).max(30)
});
const topic = z.object({ key: z.string().min(1).max(80), gameRound: z.union([z.literal(1), z.literal(2)]), title: z.string().min(1).max(80), songCount: z.number().int().min(1).max(30) });
const quiz = z.object({ id: z.string().uuid().optional(), ownerToken: z.string().optional(), coverSourceId: z.string().uuid().optional(), coverSourceToken: z.string().optional(), title: z.string().min(1).max(100), description: z.string().max(500), visibility: z.enum(['private', 'unlisted', 'public']), topics: z.array(topic).min(2).max(30), questions: z.array(question).min(2).max(30) });
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id'); const auth = req.headers.get('x-quiz-token') || undefined;
    return NextResponse.json(id ? await getQuiz(id, auth) : await listQuizzes(auth));
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export async function POST(req: NextRequest) {
  try { return NextResponse.json(await saveQuiz(quiz.parse(await req.json()))); }
  catch (e) { return NextResponse.json({ error: e instanceof z.ZodError ? 'Thông tin bộ câu hỏi không hợp lệ. Hãy kiểm tra các trường bắt buộc và thời gian đã chọn.' : (e as Error).message }, { status: 400 }); }
}
export async function PATCH(req: NextRequest) {
  try {
    const data = z.object({ id: z.string().uuid(), visibility: z.enum(['private', 'unlisted', 'public']) }).parse(await req.json());
    return NextResponse.json(await setQuizVisibility(data.id, req.headers.get('x-quiz-token') || undefined, data.visibility));
  } catch (e) { return NextResponse.json({ error: e instanceof z.ZodError ? 'Chế độ chia sẻ không hợp lệ.' : (e as Error).message }, { status: 400 }); }
}
export async function DELETE(req: NextRequest) {
  try {
    const id = z.string().uuid().parse(req.nextUrl.searchParams.get('id'));
    return NextResponse.json(await deleteQuiz(id, req.headers.get('x-quiz-token') || undefined));
  } catch (e) {
    return NextResponse.json({ error: e instanceof z.ZodError ? 'Mã bộ câu hỏi không hợp lệ.' : (e as Error).message }, { status: 400 });
  }
}
