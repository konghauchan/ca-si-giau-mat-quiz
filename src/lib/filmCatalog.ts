export const normalizeFilmSearch = (value: string) => value.toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/g,'d').replace(/['’`]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export type FilmWork = { id: string; title: string; originalTitle: string; aliases: string[]; kind: 'MOVIE'|'SERIES'; year: number|null; directors: string[]; cast: string[]; countries: string[]; rank: number; source: { provider: 'Wikidata'; id: string } };
export type FilmSuggestion = FilmWork & { token: string };
export type FilmKind = 'ALL'|'MOVIE'|'SERIES';
export const FILM_PAGE_SIZE = 2000;
export const FILM_CATALOG_LIMIT = 50000;
export const filmKindLabel = (kind: FilmWork['kind']) => kind === 'MOVIE' ? 'Phim lẻ' : 'Phim bộ';
type IndexedFilm = { film: FilmSuggestion; titles: string[]; people: string; text: string };
export function indexFilms(films: FilmSuggestion[]): IndexedFilm[] {
  return films.map(film => {
    const titles = [...new Set([film.title, film.originalTitle, ...film.aliases].map(normalizeFilmSearch))];
    const people = normalizeFilmSearch([...film.directors, ...film.cast].join(' '));
    return { film, titles, people, text: [...titles, people, film.year || ''].join(' ') };
  });
}
export function matchFilms(index: IndexedFilm[], query: string, kind: FilmKind = 'ALL', limit = 30): FilmSuggestion[] {
  const term = normalizeFilmSearch(query); if (term.length < 2) return [];
  const words = term.split(' ');
  return index.filter(row => (kind === 'ALL' || row.film.kind === kind) && words.every(word => row.text.includes(word)))
    .map(row => ({ film: row.film, score: row.titles.includes(term) ? 4 : row.titles.some(title => title.startsWith(term)) ? 3 : row.titles.some(title => title.includes(term)) ? 2 : row.people.includes(term) ? 1 : 0 }))
    .sort((a,b) => b.score-a.score || b.film.rank-a.film.rank || a.film.title.localeCompare(b.film.title) || a.film.id.localeCompare(b.film.id))
    .slice(0,limit).map(row => row.film);
}
