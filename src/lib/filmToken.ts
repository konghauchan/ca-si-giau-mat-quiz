import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FilmWork } from './filmCatalog.ts';

export function signFilm(film: Pick<FilmWork,'id'|'title'>, key: string): string {
  const payload = Buffer.from(JSON.stringify({ category: 'FILM', id: film.id, title: film.title })).toString('base64url');
  return payload + '.' + createHmac('sha256',key).update(payload).digest('base64url');
}
export function readFilm(token: string, key: string): Pick<FilmWork,'id'|'title'> {
  const invalid = () => new Error('Hãy chọn lại phim từ danh mục Đọ Phim.');
  if (token.length > 1200) throw invalid();
  const parts = token.split('.'); if (parts.length !== 2) throw invalid();
  const signature = Buffer.from(parts[1],'base64url'), expected = createHmac('sha256',key).update(parts[0]).digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature,expected)) throw invalid();
  try {
    const data = JSON.parse(Buffer.from(parts[0],'base64url').toString());
    if (data.category !== 'FILM' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(data.id) || typeof data.title !== 'string' || !data.title.trim() || data.title.length > 120) throw invalid();
    return { id: data.id, title: data.title };
  } catch { throw invalid(); }
}
