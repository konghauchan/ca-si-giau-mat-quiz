import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {musicSearchAccess,MusicAccessError} from '@/lib/musicSearchAccess';
import {publicSongCatalogPage,limitMusicSearch} from '@/lib/musicBrainz';
import {MUSIC_CATALOG_LIMIT,MUSIC_CATALOG_PAGE_SIZE} from '@/lib/musicSearch';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest) {
  try {
    const {scope,identity}=await musicSearchAccess(req,true);
    const offset=z.coerce.number().int().min(0).max(MUSIC_CATALOG_LIMIT).parse(req.nextUrl.searchParams.get('offset')??0);
    const limit=z.coerce.number().int().min(1).max(MUSIC_CATALOG_PAGE_SIZE).parse(req.nextUrl.searchParams.get('limit')??MUSIC_CATALOG_PAGE_SIZE);
    await limitMusicSearch('catalog:'+identity);
    return NextResponse.json(await publicSongCatalogPage(scope,offset,limit),{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof z.ZodError?'Phạm vi nhạc không hợp lệ.':(error as Error).message},{status:error instanceof MusicAccessError?error.status:400,headers:{'Cache-Control':'no-store'}});}
}
