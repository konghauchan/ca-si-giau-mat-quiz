import { createHash } from 'node:crypto';
import type { Client } from '@libsql/client';
import type { FilmWork } from './filmCatalog.ts';
export const FILM_LIBRARY_SCHEMA = `
CREATE TABLE IF NOT EXISTS film_library_releases(id TEXT PRIMARY KEY,manifest TEXT NOT NULL,film_count INTEGER NOT NULL,completed_at INTEGER);
CREATE TABLE IF NOT EXISTS film_library_entries(version TEXT NOT NULL REFERENCES film_library_releases(id),id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(version,id));
CREATE TABLE IF NOT EXISTS film_library_active(id TEXT PRIMARY KEY CHECK(id='active'),version TEXT NOT NULL REFERENCES film_library_releases(id));`;
export function prepareFilmLibrary(dataset: {source?:unknown;films:FilmWork[]}) {
  const films = [...dataset.films].sort((a,b)=>a.id.localeCompare(b.id));
  if(!films.length||films.length>50000||new Set(films.map(f=>f.id)).size!==films.length)throw new Error('Danh mục phim rỗng, quá lớn hoặc trùng mã.');
  for(const film of films) {
    if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(film.id)||!film.title?.trim()||film.title.length>120||!['MOVIE','SERIES'].includes(film.kind)||typeof film.originalTitle!=='string'||![film.aliases,film.directors,film.cast,film.countries].every(v=>Array.isArray(v)&&v.every(s=>typeof s==='string'))||film.year!==null&&(!Number.isInteger(film.year)||film.year<1800||film.year>2100)||!Number.isFinite(film.rank)||film.source?.provider!=='Wikidata'||!/^Q\d+$/.test(film.source.id))throw new Error('Phim không hợp lệ: '+film.id);
  }
  const version = createHash('sha256').update(JSON.stringify(films)).digest('hex');
  return {films,version,manifest:JSON.stringify({source:dataset.source,count:films.length,checksum:version})};
}
export async function readFilmLibrary(client:Client,version:string):Promise<FilmWork[]> {
  const films:FilmWork[]=[];let after='';
  for(;;){const page=await client.execute({sql:'SELECT id,payload FROM film_library_entries WHERE version=? AND id>? ORDER BY id LIMIT 1000',args:[version,after]});for(const row of page.rows)films.push(JSON.parse(String(row.payload)));if(page.rows.length<1000)return films;after=String(page.rows.at(-1)!.id);}
}
export async function importFilmLibrary(client:Client,prepared:ReturnType<typeof prepareFilmLibrary>) {
  await client.executeMultiple(FILM_LIBRARY_SCHEMA);
  const before=(await client.execute("SELECT version FROM film_library_active WHERE id='active'")).rows[0]?.version??null;
  if(before===prepared.version){
    if(prepareFilmLibrary({films:await readFilmLibrary(client,prepared.version)}).version!==prepared.version)throw new Error('Checksum phim không khớp.');
    return {version:prepared.version,count:prepared.films.length,alreadyImported:true};
  }
  const old=before?await readFilmLibrary(client,String(before)):[];
  const incoming=new Set(prepared.films.map(f=>f.id));
  if(old.some(f=>!incoming.has(f.id)))throw new Error('Snapshot mới thiếu phim cũ. Hãy gộp dữ liệu trước khi nhập.');
  await client.execute({sql:'INSERT OR IGNORE INTO film_library_releases(id,manifest,film_count) VALUES(?,?,?)',args:[prepared.version,prepared.manifest,prepared.films.length]});
  for(let i=0;i<prepared.films.length;i+=100)await client.batch(prepared.films.slice(i,i+100).map(f=>({sql:'INSERT OR REPLACE INTO film_library_entries(version,id,payload) VALUES(?,?,?)',args:[prepared.version,f.id,JSON.stringify(f)]})),'write');
  const saved=prepareFilmLibrary({films:await readFilmLibrary(client,prepared.version)});
  if(saved.version!==prepared.version)throw new Error('Checksum phim không khớp; chưa kích hoạt.');
  const result=await client.batch([
    {sql:"INSERT INTO film_library_active(id,version) SELECT 'active',? WHERE (? IS NULL AND NOT EXISTS(SELECT 1 FROM film_library_active)) OR EXISTS(SELECT 1 FROM film_library_active WHERE version=?) ON CONFLICT(id) DO UPDATE SET version=excluded.version RETURNING version",args:[prepared.version,before,before]},
    {sql:"UPDATE film_library_releases SET completed_at=? WHERE id=? AND EXISTS(SELECT 1 FROM film_library_active WHERE version=?)",args:[Date.now(),prepared.version,prepared.version]},
  ],'write');
  if(!result[0].rows.length)throw new Error('Danh mục phim đang hoạt động vừa thay đổi. Hãy gộp lại trước khi nhập.');
  return {version:prepared.version,count:saved.films.length,alreadyImported:false};
}
