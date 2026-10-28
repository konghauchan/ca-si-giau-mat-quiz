import { FILM_CATALOG_LIMIT, FILM_PAGE_SIZE, indexFilms, matchFilms, type FilmKind, type FilmSuggestion } from './filmCatalog.ts';
type Context = { roomId?: string; gameToken?: string };
let index: ReturnType<typeof indexFilms> = [], expiresAt = 0, pending: Promise<void>|undefined;
const listeners = new Set<()=>void>();
export function subscribeFilmCatalog(listener: ()=>void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export const cachedFilmMatches = (query: string, kind: FilmKind = 'ALL') => matchFilms(index,query,kind);
export const cachedFilmById = (id: string) => index.find(row=>row.film.id===id)?.film;
export function primeFilmCatalog(context: Context = {}): Promise<void> {
  if (pending) return pending;
  if (expiresAt > Date.now()) return Promise.resolve();
  const job = (async () => {
    const indexed: ReturnType<typeof indexFilms> = []; let version = '', offset = 0;
    do {
      const params = new URLSearchParams({offset:String(offset),limit:String(FILM_PAGE_SIZE)});
      if (context.roomId) params.set('roomId',context.roomId);
      if (version) params.set('version',version);
      const response = await fetch('/api/films/catalog?'+params,{headers:context.gameToken?{'x-game-token':context.gameToken}:{},cache:'no-store',signal:AbortSignal.timeout(15000)});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Chưa tải được danh mục phim.');
      if (!Array.isArray(data.items) || data.items.length > FILM_PAGE_SIZE || typeof data.version !== 'string' || version && version !== data.version) throw new Error('Danh mục phim vừa thay đổi. Hãy tải lại.');
      version = data.version;
      // Normalize each row once and yield between chunks so typing stays responsive.
      for(let i=0;i<data.items.length;i+=100){indexed.push(...indexFilms((data.items as FilmSuggestion[]).slice(i,i+100)));await new Promise(resolve=>setTimeout(resolve,0));}
      index = [...indexed]; listeners.forEach(listener=>listener());
      if (data.nextOffset === null) break;
      if (!Number.isInteger(data.nextOffset) || data.nextOffset <= offset || data.nextOffset >= FILM_CATALOG_LIMIT) throw new Error('Trang danh mục phim không hợp lệ.');
      offset = data.nextOffset;
    } while (offset < FILM_CATALOG_LIMIT);
    expiresAt = Date.now()+300000;
  })();
  pending = job;
  void job.then(()=>{if(pending===job)pending=undefined;},()=>{if(pending===job)pending=undefined;});
  return job;
}
