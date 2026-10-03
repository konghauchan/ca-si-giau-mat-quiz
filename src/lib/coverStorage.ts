import { del } from '@vercel/blob';
import { one } from './db';

export async function removeUnusedCover(url: string | null) {
  if (!url) return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.public.blob.vercel-storage.com') || !parsed.pathname.startsWith('/quiz-covers/')) return;
    const stillUsed = await one('SELECT 1 FROM quizzes WHERE cover_url=? AND deleted_at IS NULL LIMIT 1', url);
    if (!stillUsed) await del(url);
  } catch {
    // An unavailable storage service must not undo a successful quiz update.
  }
}
