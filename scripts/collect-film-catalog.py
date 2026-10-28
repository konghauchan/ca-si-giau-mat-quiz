"""Build a repeatable CC0 film/TV metadata snapshot. No posters, plots or video.
Wikidata sitelinks are a coverage proxy, not a box-office/popularity ranking.
"""
import argparse
import datetime
import gzip
import hashlib
import json
from pathlib import Path
import time
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
NAMESPACE = uuid.UUID('5df7f13b-c6d0-55c6-b913-9653fd8762ac')
UA = 'DoNhacFilmCatalog/1.0 (https://github.com/konghauchan/ca-si-giau-mat-quiz)'

def film_id(qid):
    if not qid.startswith('Q') or not qid[1:].isdigit():
        raise ValueError('Invalid Wikidata identity')
    return str(uuid.uuid5(NAMESPACE, 'wikidata:' + qid))

class Provider:
    def __init__(self, directory):
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)
        self.next_at = 0

    def query(self, query):
        cache = self.directory / (hashlib.sha256(query.encode()).hexdigest() + '.json.gz')
        if cache.exists():
            return json.loads(gzip.decompress(cache.read_bytes()))
        url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': query, 'format': 'json'})
        for attempt in range(5):
            time.sleep(max(0, self.next_at - time.monotonic()))
            self.next_at = time.monotonic() + 2
            try:
                req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/sparql-results+json'})
                with urllib.request.urlopen(req, timeout=65) as response:
                    data = response.read(32 * 1024 * 1024 + 1)
                if len(data) > 32 * 1024 * 1024:
                    raise ValueError('Oversized response')
                rows = json.loads(data)['results']['bindings']
                cache.write_bytes(gzip.compress(json.dumps(rows, ensure_ascii=False).encode()))
                return rows
            except (OSError, TimeoutError):
                if attempt == 4:
                    raise
                time.sleep(3 * (attempt + 1))

    def select(self, kind, limit, vietnam=False):
        root = 'Q11424' if kind == 'MOVIE' else 'Q5398426'
        origin = '?item wdt:P495 wd:Q881.' if vietnam else ''
        query = f'''SELECT DISTINCT ?item ?links WHERE {{
          ?item wdt:P31/wdt:P279* wd:{root}; wikibase:sitelinks ?links.
          {origin}
          FILTER(?links >= {1 if vietnam else 15})
        }} ORDER BY DESC(?links) ?item LIMIT {limit}'''
        return self.query(query)

    def metadata(self, ids):
        values = ' '.join('wd:' + qid for qid in ids)
        query = f'''SELECT ?item ?field ?value ?label WHERE {{ VALUES ?item {{ {values} }}
          {{ ?item rdfs:label ?value. FILTER(LANG(?value) IN ("vi","en")) BIND("title" AS ?field) }}
          UNION {{ ?item skos:altLabel ?value. FILTER(LANG(?value) IN ("vi","en")) BIND("alias" AS ?field) }}
          UNION {{ VALUES ?field {{ wdt:P577 wdt:P1476 wdt:P57 wdt:P161 wdt:P495 }} ?item ?field ?value.
            OPTIONAL {{ ?value rdfs:label ?label. FILTER(LANG(?label) IN ("vi","en")) }} }}
        }}'''
        return self.query(query)

def parse_metadata(qid, kind, links, rows):
    titles = {}
    aliases, originals, dates, directors, cast, countries = set(), set(), set(), {}, {}, set()
    for row in rows:
        field, value = row['field']['value'].rsplit('/', 1)[-1], row['value']['value']
        if field == 'title':
            titles[row['value'].get('xml:lang', '')] = value
        elif field == 'alias':
            aliases.add(value)
        elif field == 'P1476':
            originals.add(value)
        elif field in ('P577', 'P580'):
            if value[:4].isdigit():
                year = int(value[:4])
                if 1800 <= year <= 2100:
                    dates.add(year)
        elif field == 'P495':
            countries.add(value.rsplit('/', 1)[-1])
        elif field in ('P57', 'P161') and 'label' in row:
            target = directors if field == 'P57' else cast
            identity = value.rsplit('/', 1)[-1]
            target.setdefault(identity, set()).add(row['label']['value'])
    title = titles.get('vi') or titles.get('en') or next(iter(sorted(originals)), '')
    if not title.strip() or len(title) > 120:
        return None
    aliases.update(titles.values())
    aliases.update(originals)
    aliases.discard(title)
    # Prefer the English/international display title; all native and translated
    # title claims remain searchable aliases. P1476 may contain several languages.
    return {'id': film_id(qid), 'title': title, 'originalTitle': titles.get('en') or next(iter(sorted(originals)), title),
            'aliases': sorted(aliases), 'kind': kind, 'year': min(dates) if dates else None,
            'directors': sorted({n for names in directors.values() for n in names})[:12],
            'cast': sorted({n for names in cast.values() for n in names})[:100],
            'countries': sorted(countries), 'rank': links, 'source': {'provider': 'Wikidata', 'id': qid}}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--movies', type=int, default=5000)
    parser.add_argument('--series', type=int, default=2000)
    parser.add_argument('--vietnam', type=int, default=1500)
    args = parser.parse_args()
    provider = Provider(ROOT / 'data/film-catalog/responses')
    selected = {}
    ambiguous = set()
    for kind, limit, vietnam in [('MOVIE', args.movies, False), ('SERIES', args.series, False), ('MOVIE', args.vietnam, True), ('SERIES', args.vietnam, True)]:
        rows = provider.select(kind, limit, vietnam)
        print(json.dumps({'selection': kind, 'vietnam': vietnam, 'count': len(rows)}), flush=True)
        for row in rows:
            qid = row['item']['value'].rsplit('/', 1)[-1]
            if qid in selected and selected[qid][0] != kind:
                ambiguous.add(qid)
            selected[qid] = (kind, int(row['links']['value']))
    ids = sorted(set(selected) - ambiguous)
    films = []
    for offset in range(0, len(ids), 80):
        group = ids[offset:offset + 80]
        rows = provider.metadata(group)
        by_id = {qid: [] for qid in group}
        for row in rows:
            by_id[row['item']['value'].rsplit('/', 1)[-1]].append(row)
        for qid in group:
            film = parse_metadata(qid, *selected[qid], by_id[qid])
            if film:
                films.append(film)
        print(json.dumps({'metadata': min(offset + 80, len(ids)), 'total': len(ids)}), flush=True)
    # TV series often records its first broadcast as start time (P580), not P577.
    by_film = {film['source']['id']: film for film in films if film['kind'] == 'SERIES'}
    series_ids = sorted(by_film)
    for offset in range(0, len(series_ids), 200):
        values = ' '.join('wd:' + qid for qid in series_ids[offset:offset + 200])
        rows = provider.query(f'SELECT ?item ?date WHERE {{ VALUES ?item {{ {values} }} ?item wdt:P580 ?date. }}')
        for row in rows:
            date = row['date']['value']
            if date[:4].isdigit() and 1800 <= int(date[:4]) <= 2100:
                film = by_film[row['item']['value'].rsplit('/', 1)[-1]]
                film['year'] = min(film['year'] or 2100, int(date[:4]))
    output = ROOT / 'src/lib/filmCatalogData.json'
    previous = json.loads(output.read_text(encoding='utf-8'))['films'] if output.exists() else []
    merged = {film['id']: film for film in previous}
    merged.update({film['id']: film for film in films})
    films = sorted(merged.values(), key=lambda film: film['id'])
    report = {'provider': 'Wikidata', 'license': 'CC0-1.0', 'url': 'https://www.wikidata.org/',
              'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'complete': True,
              'coverage': 'Bounded selections by Wikipedia sitelink count plus country-of-origin Vietnam; not an exhaustive filmography. No guessed translations.',
              'selection': vars(args), 'ambiguousExcluded': sorted(ambiguous), 'count': len(films),
              'movies': sum(f['kind'] == 'MOVIE' for f in films), 'series': sum(f['kind'] == 'SERIES' for f in films),
              'vietnam': sum('Q881' in f['countries'] for f in films)}
    temporary = output.with_suffix('.json.tmp')
    temporary.write_text(json.dumps({'source': report, 'films': films}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    temporary.replace(output)
    print(json.dumps(report), flush=True)

if __name__ == '__main__':
    main()
