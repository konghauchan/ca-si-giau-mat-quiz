import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin, requireUser } from '@/lib/auth';
import { one, run, tx } from '@/lib/db';

export const runtime = 'nodejs';
const input = z.object({ claims: z.array(z.object({ id: z.string().uuid(), ownerToken: z.string().min(1).max(128) })).max(50) });

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const { claims } = input.parse(await request.json());
    const claimed = await tx(async () => {
      const ids: string[] = [];
      for (const claim of claims) {
        const quiz = await one('SELECT owner_user_id FROM quizzes WHERE id=? AND owner_token=? AND deleted_at IS NULL', claim.id, claim.ownerToken);
        if (!quiz || (quiz.owner_user_id && quiz.owner_user_id !== user.id)) continue;
        if (!quiz.owner_user_id) await run('UPDATE quizzes SET owner_user_id=? WHERE id=? AND owner_user_id IS NULL', user.id, claim.id);
        ids.push(claim.id);
      }
      return ids;
    });
    return NextResponse.json({ claimed });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? 'Danh sách bộ câu hỏi cũ không hợp lệ.' : (error as Error).message }, { status: 400 });
  }
}
