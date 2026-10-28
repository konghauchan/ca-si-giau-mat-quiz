import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { one } from '@/lib/db';
import { publicFilmCatalog } from '@/lib/filmCatalogServer';
import { FILM_CATALOG_LIMIT, FILM_PAGE_SIZE } from '@/lib/filmCatalog';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
  try {
    const roomId=request.nextUrl.searchParams.get('roomId');
    if(roomId){
      z.string().uuid().parse(roomId);
      const player=await one(`SELECT p.id FROM players p JOIN rooms r ON r.id=p.room_id JOIN quizzes v ON v.id=r.quiz_id WHERE r.id=? AND p.token=? AND v.game_type='FILM_DUEL' AND EXISTS(SELECT 1 FROM questions q WHERE q.quiz_id=v.id AND q.answer_mode='SEARCH')`,roomId,request.headers.get('x-game-token')||'');
      if(!player)return NextResponse.json({error:'Phiên người chơi không hợp lệ hoặc phòng không dùng tìm phim.'},{status:403});
    }else if(!await currentUser(request))return NextResponse.json({error:'Hãy đăng nhập để tìm phim khi tạo quiz.'},{status:401});
    const offset=z.coerce.number().int().min(0).max(FILM_CATALOG_LIMIT).parse(request.nextUrl.searchParams.get('offset')??0);
    const limit=z.coerce.number().int().min(1).max(FILM_PAGE_SIZE).parse(request.nextUrl.searchParams.get('limit')??FILM_PAGE_SIZE);
    const {version,items}=await publicFilmCatalog();
    const expected=request.nextUrl.searchParams.get('version');
    if(expected&&expected!==version)return NextResponse.json({error:'Danh mục phim vừa cập nhật. Hãy tải lại.'},{status:409});
    return NextResponse.json({version,items:items.slice(offset,offset+limit),nextOffset:offset+limit<items.length?offset+limit:null,total:items.length},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof z.ZodError?'Trang danh mục phim không hợp lệ.':(error as Error).message},{status:400});}
}
