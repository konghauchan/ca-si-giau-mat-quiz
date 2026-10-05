import crypto from 'node:crypto';
import { del, put } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { z } from 'zod';
import { one, run } from '@/lib/db';
import { compressCover } from '@/lib/cover';
import { removeUnusedCover } from '@/lib/coverStorage';
import { assertSameOrigin, requireUser } from '@/lib/auth';

export const runtime = 'nodejs';

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

async function ownedQuiz(request: NextRequest) {
  const id = z.string().uuid().parse(request.nextUrl.searchParams.get('id'));
  const user = await requireUser(request);
  const quiz = await one('SELECT id,cover_url FROM quizzes WHERE id=? AND owner_user_id=? AND deleted_at IS NULL', id, user.id);
  if (!quiz) throw new Error('Bạn không có quyền sửa ảnh bìa của bộ câu hỏi này.');
  return { id, oldUrl: quiz.cover_url ? String(quiz.cover_url) : null };
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const { id, oldUrl } = await ownedQuiz(request);
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Chưa kết nối kho ảnh Vercel Blob cho dự án.');
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size < 1 || file.size > MAX_INPUT_BYTES) {
      throw new Error('Ảnh gửi lên quá lớn. Hãy chọn lại để hệ thống nén trước khi tải lên.');
    }
    const output = await compressCover(Buffer.from(await file.arrayBuffer()));
    const blob = await put(`quiz-covers/${id}-${crypto.randomUUID()}.webp`, output, { access: 'public', contentType: 'image/webp' });
    try {
      await run('UPDATE quizzes SET cover_url=?,updated_at=? WHERE id=?', blob.url, Date.now(), id);
    } catch (error) {
      await del(blob.url).catch(() => undefined);
      throw error;
    }
    await removeUnusedCover(oldUrl);
    const metadata = await sharp(output).metadata();
    return NextResponse.json({ coverUrl: blob.url, size: output.length, width: metadata.width, height: metadata.height });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const { id, oldUrl } = await ownedQuiz(request);
    await run('UPDATE quizzes SET cover_url=NULL,updated_at=? WHERE id=?', Date.now(), id);
    await removeUnusedCover(oldUrl);
    return NextResponse.json({ coverUrl: null });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
