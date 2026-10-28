import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SongWork } from './musicSearch.ts';
export function signSong(work: SongWork, key: string) {
  const payload = Buffer.from(JSON.stringify({id:work.id,title:work.title,scope:work.scope})).toString('base64url');
  return `${payload}.${createHmac('sha256',key).update(payload).digest('base64url')}`;
}
export function readSong(token: string, key: string): Pick<SongWork,'id'|'title'|'scope'> {
  const invalid = () => new Error('Hãy chọn lại bài hát từ danh mục Đọ Nhạc.');
  if(token.length>1200) throw invalid();
  const parts=token.split('.');if(parts.length!==2)throw invalid();
  const expected=createHmac('sha256',key).update(parts[0]).digest();const supplied=Buffer.from(parts[1],'base64url');
  if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))throw invalid();
  try {const data=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
    if(!/^[a-f0-9-]{36}$/i.test(data.id)||typeof data.title!=='string'||!data.title.trim()||data.title.length>120||!['VI','US_UK'].includes(data.scope))throw invalid();
    return {id:data.id,title:data.title,scope:data.scope};
  }catch{throw invalid();}
}
