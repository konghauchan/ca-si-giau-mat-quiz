import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {musicSearchAccess,MusicAccessError} from '@/lib/musicSearchAccess';
import {publicSongCatalog,limitMusicSearch} from '@/lib/musicBrainz';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest) {
  try {
    const {scope,identity}=await musicSearchAccess(req,true);
    await limitMusicSearch('catalog:'+identity);
    return NextResponse.json({scope,items:await publicSongCatalog(scope)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof z.ZodError?'Phạm vi nhạc không hợp lệ.':(error as Error).message},{status:error instanceof MusicAccessError?error.status:400,headers:{'Cache-Control':'no-store'}});}
}
