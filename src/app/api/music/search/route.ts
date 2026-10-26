import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {MusicSearchBusy,limitMusicSearch,searchSongs} from '@/lib/musicBrainz';
import {musicSearchAccess,MusicAccessError} from '@/lib/musicSearchAccess';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const querySchema=z.string().trim().min(2).max(80).refine(v=>/[\p{L}\p{N}]/u.test(v));
export async function GET(req:NextRequest) {
  try {
    const query=querySchema.parse(req.nextUrl.searchParams.get('q'));
    const {scope,identity}=await musicSearchAccess(req);
    const refresh=req.nextUrl.searchParams.get('refresh')==='1';
    await limitMusicSearch(identity);
    return NextResponse.json({...await searchSongs(query,scope,refresh),scope},{headers:{'Cache-Control':'no-store'}});
  }catch(error) {
    if(error instanceof MusicAccessError)return NextResponse.json({error:error.message},{status:error.status});
    if(error instanceof MusicSearchBusy)return NextResponse.json({error:error.message,retryAfter:error.retryAfter},{status:429,headers:{'Retry-After':String(error.retryAfter),'Cache-Control':'no-store'}});
    return NextResponse.json({error:error instanceof z.ZodError?'Nhập ít nhất 2 ký tự; chọn phạm vi nhạc hợp lệ.':(error as Error).message},{status:400,headers:{'Cache-Control':'no-store'}});
  }
}
