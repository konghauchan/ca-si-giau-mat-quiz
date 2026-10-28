import { songSigningKey } from './songSelections';
import { readFilm, signFilm } from './filmToken';
export async function verifyFilmSelection(token: string) { return readFilm(token,await songSigningKey()); }
export async function savedFilmToken(id: string, title: string) { return signFilm({id,title},await songSigningKey()); }
