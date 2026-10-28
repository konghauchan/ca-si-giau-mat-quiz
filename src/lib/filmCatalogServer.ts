import dataset from './filmCatalogData.json';
import { all, one } from './db';
import { songSigningKey } from './songSelections';
import { signFilm } from './filmToken';
import { prepareFilmLibrary } from './filmLibraryStore';
import type { FilmSuggestion, FilmWork } from './filmCatalog';
let cached: {expires:number;job:Promise<{version:string;items:FilmSuggestion[]}>}|undefined;
export function publicFilmCatalog() {
  if(cached&&cached.expires>Date.now())return cached.job;
  const job=(async()=>{
    const active=await one("SELECT version FROM film_library_active WHERE id='active'");
    let films=dataset.films as FilmWork[],version='';
    if(active){
      const saved:FilmWork[]=[];let after='';
      for(;;){const page=await all('SELECT id,payload FROM film_library_entries WHERE version=? AND id>? ORDER BY id LIMIT 1000',String(active.version),after);saved.push(...page.map(row=>JSON.parse(String(row.payload)) as FilmWork));if(page.length<1000)break;after=String(page.at(-1)!.id);}
      const prepared=prepareFilmLibrary({films:saved});if(prepared.version!==active.version)throw new Error('Danh mục phim trong database chưa đầy đủ.');films=prepared.films;version=prepared.version;
    }else version=prepareFilmLibrary({films}).version;
    const key=await songSigningKey();
    const items=films.map(film=>({...film,token:signFilm(film,key)})).sort((a,b)=>b.rank-a.rank||a.id.localeCompare(b.id));
    return {version,items};
  })();
  cached={expires:Date.now()+60000,job};
  void job.catch(()=>{if(cached?.job===job)cached=undefined;});
  return job;
}
