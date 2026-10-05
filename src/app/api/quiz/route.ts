import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteQuiz, getQuiz, listQuizzes, saveQuiz, setQuizVisibility } from '@/lib/game';
import { assertSameOrigin, currentUser, requireUser } from '@/lib/auth';
import { quizSchema } from '@/lib/quizSchema';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id'); const user = await currentUser(req);
    return NextResponse.json(id ? await getQuiz(id, user?.id) : await listQuizzes(user?.id), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export async function POST(req: NextRequest) {
  try { assertSameOrigin(req); const user = await requireUser(req); return NextResponse.json(await saveQuiz(quizSchema.parse(await req.json()), user.id)); }
  catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Có trường trong bộ câu hỏi không hợp lệ.', issues: e.issues.map(issue => ({ path: issue.path, message: issue.message })) }, { status: 400 });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
export async function PATCH(req: NextRequest) {
  try {
    assertSameOrigin(req); const user = await requireUser(req);
    const data = z.object({ id: z.string().uuid(), visibility: z.enum(['private', 'unlisted', 'public']) }).parse(await req.json());
    return NextResponse.json(await setQuizVisibility(data.id, user.id, data.visibility));
  } catch (e) { return NextResponse.json({ error: e instanceof z.ZodError ? 'Chế độ chia sẻ không hợp lệ.' : (e as Error).message }, { status: 400 }); }
}
export async function DELETE(req: NextRequest) {
  try {
    assertSameOrigin(req); const user = await requireUser(req);
    const id = z.string().uuid().parse(req.nextUrl.searchParams.get('id'));
    return NextResponse.json(await deleteQuiz(id, user.id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof z.ZodError ? 'Mã bộ câu hỏi không hợp lệ.' : (e as Error).message }, { status: 400 });
  }
}
