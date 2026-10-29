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
import threading
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[1]
NAMESPACE = uuid.UUID('5df7f13b-c6d0-55c6-b913-9653fd8762ac')
UA = 'DoNhacFilmCatalog/1.0 (https://github.com/konghauchan/ca-si-giau-mat-quiz)'

def film_id(qid):
    if not qid.startswith('Q') or not qid[1:].isdigit():
        raise ValueError('Invalid Wikidata identity')
    return str(uuid.uuid5(NAMESPACE, 'wikidata:' + qid))

class Provider:
    def __init__(self, directory, refresh=False, refresh_since=None):
        self.refresh_since = refresh_since
        self.rate_lock = threading.Lock()
        self.refresh = refresh
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)
        self.next_at = 0

    def query(self, query):
        cache = self.directory / (hashlib.sha256(query.encode()).hexdigest() + '.json.gz')
        if cache.exists() and not self.refresh and (self.refresh_since is None or cache.stat().st_mtime >= self.refresh_since.timestamp()):
            return json.loads(gzip.decompress(cache.read_bytes()))
        url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': query, 'format': 'json'})
        for attempt in range(5):
            with self.rate_lock:
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

    def recent(self, kind, since, limit):
        root = 'Q11424' if kind == 'MOVIE' else 'Q5398426'
        date = 'P577' if kind == 'MOVIE' else 'P580'
        return self.query(f'''SELECT DISTINCT ?item ?links WHERE {{
          ?item wdt:{date} ?released; wikibase:sitelinks ?links.
          FILTER(?released >= "{since}T00:00:00Z"^^xsd:dateTime && ?released <= NOW())
          FILTER(?links >= 1)
          ?item wdt:P31/wdt:P279* wd:{root}.
        }} ORDER BY DESC(?links) ?item LIMIT {limit}''')

    def vietnamese_wikipedia(self, kind, limit):
        root = 'Q11424' if kind == 'MOVIE' else 'Q5398426'
        return self.query(f'SELECT DISTINCT ?item ?links ?title WHERE {{ ?article schema:isPartOf <https://vi.wikipedia.org/>; schema:about ?item; schema:name ?title. ?item wdt:P31/wdt:P279* wd:{root}; wikibase:sitelinks ?links. }} ORDER BY DESC(?links) ?item LIMIT {limit}')

    def direct_kinds(self, ids):
        values = ' '.join('wd:' + qid for qid in sorted(ids))
        return self.query(f'''SELECT ?item ?kind WHERE {{ VALUES ?item {{ {values} }}
          {{ ?item wdt:P31 wd:Q11424. BIND("MOVIE" AS ?kind) }}
          UNION {{ ?item wdt:P31 wd:Q5398426. BIND("SERIES" AS ?kind) }}
        }}''')

    def coverage(self, works, people):
        ids = set(works)
        for qid in [*works, *people]:
            film_id(qid)  # Validate QIDs before interpolating SPARQL.
        if people:
            values = ' '.join('wd:' + qid for qid in sorted(people))
            rows = self.query(f'SELECT DISTINCT ?item WHERE {{ VALUES ?person {{ {values} }} {{ ?item wdt:P161 ?person }} UNION {{ ?item wdt:P57 ?person }} }}')
            ids.update(row['item']['value'].rsplit('/', 1)[-1] for row in rows)
        if not ids:
            return []
        values = ' '.join('wd:' + qid for qid in sorted(ids))
        return self.query(f'''SELECT DISTINCT ?item ?kind ?links WHERE {{ VALUES ?item {{ {values} }}
          VALUES (?root ?kind) {{ (wd:Q11424 "MOVIE") (wd:Q5398426 "SERIES") }}
          ?item wdt:P31/wdt:P279* ?root.
          OPTIONAL {{ ?item wikibase:sitelinks ?links }}
        }}''')

    def metadata(self, ids):
        values = ' '.join('wd:' + qid for qid in ids)
        query = f'''SELECT ?item ?field ?value ?label WHERE {{ VALUES ?item {{ {values} }}
          {{ ?item rdfs:label ?value. FILTER(LANG(?value) IN ("vi","en")) BIND("title" AS ?field) }}
          UNION {{ ?item skos:altLabel ?value. FILTER(LANG(?value) IN ("vi","en")) BIND("alias" AS ?field) }}
          UNION {{ VALUES ?field {{ wdt:P577 wdt:P1476 wdt:P57 wdt:P161 wdt:P495 }} ?item ?field ?value.
            OPTIONAL {{ ?value rdfs:label ?label. FILTER(LANG(?label) IN ("vi","en")) }} }}
        }}'''
        return self.query(query)

def parse_metadata(qid, kind, links, rows, vietnamese_title=None):
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
    title = titles.get('vi') or vietnamese_title or titles.get('en') or next(iter(sorted(originals)), '')
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

def resolve_direct_kinds(selected, ambiguous, rows):
    kinds = {qid: set() for qid in ambiguous}
    for row in rows:
        qid = row['item']['value'].rsplit('/', 1)[-1]
        if qid in kinds and row['kind']['value'] in ('MOVIE', 'SERIES'):
            kinds[qid].add(row['kind']['value'])
    resolved = {}
    for qid, values in kinds.items():
        if len(values) == 1:
            kind = next(iter(values))
            selected[qid] = (kind, selected[qid][1])
            ambiguous.remove(qid)
            resolved[qid] = kind
    return resolved


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--movies', type=int, default=5000)
    parser.add_argument('--series', type=int, default=2000)
    parser.add_argument('--vietnam', type=int, default=1500)
    parser.add_argument('--refresh', action='store_true', help='Fetch fresh responses instead of reusing cached metadata')
    parser.add_argument('--recent-since', type=datetime.date.fromisoformat, help='Also select recently released films and series (YYYY-MM-DD)')
    parser.add_argument('--recent-limit', type=int, default=2000, help='Maximum recent entries per kind')
    parser.add_argument('--refresh-since', type=datetime.datetime.fromisoformat, help='Resume using only cache fetched after this timezone-aware timestamp')
    parser.add_argument('--vietnamese-wikipedia-limit', type=int, default=0, help='Also collect films with Vietnamese Wikipedia articles without a popularity threshold')
    parser.add_argument('--only-new', action='store_true', help='Fetch metadata for new IDs only; retain existing metadata and enrich Vietnamese aliases')
    parser.add_argument('--coverage-file', type=Path, help='JSON file of verified work and actor/director Wikidata QIDs')
    args = parser.parse_args()
    if args.refresh_since and args.refresh_since.tzinfo is None:
        parser.error('--refresh-since requires a timezone, e.g. 2026-10-29T00:00:00Z')
    provider = Provider(ROOT / 'data/film-catalog/responses', refresh=args.refresh, refresh_since=args.refresh_since)
    vietnamese_titles = {}
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
    if args.recent_since:
        for kind in ('MOVIE', 'SERIES'):
            rows = provider.recent(kind, args.recent_since.isoformat(), args.recent_limit)
            print(json.dumps({'recent': kind, 'since': args.recent_since.isoformat(), 'count': len(rows)}), flush=True)
            for row in rows:
                qid = row['item']['value'].rsplit('/', 1)[-1]
                if qid in selected and selected[qid][0] != kind:
                    ambiguous.add(qid)
                selected[qid] = (kind, int(row['links']['value']))
    if args.vietnamese_wikipedia_limit:
        for kind in ('MOVIE', 'SERIES'):
            rows = provider.vietnamese_wikipedia(kind, args.vietnamese_wikipedia_limit)
            print(json.dumps({'vietnameseWikipedia': kind, 'count': len(rows)}), flush=True)
            for row in rows:
                qid = row['item']['value'].rsplit('/', 1)[-1]
                vietnamese_titles[qid] = row['title']['value']
                if qid in selected and selected[qid][0] != kind:
                    ambiguous.add(qid)
                selected[qid] = (kind, int(row['links']['value']))
    curated_aliases = {}
    targeted_qids = set()
    if args.coverage_file:
        coverage = json.loads(args.coverage_file.read_text(encoding='utf-8'))
        curated_aliases = {row['id']: row.get('searchAliases', []) for row in coverage.get('works', [])}
        rows = provider.coverage([row['id'] for row in coverage.get('works', [])], [row['id'] for row in coverage.get('people', [])])
        for row in rows:
            qid = row['item']['value'].rsplit('/', 1)[-1]
            kind = row['kind']['value']
            targeted_qids.add(qid)
            if qid in selected and selected[qid][0] != kind:
                ambiguous.add(qid)
            selected[qid] = (kind, int(row.get('links', {}).get('value', 0)))
        print(json.dumps({'targetedCandidates': len(targeted_qids)}), flush=True)
    resolved = resolve_direct_kinds(selected, ambiguous, provider.direct_kinds(ambiguous)) if ambiguous else {}
    output = ROOT / 'src/lib/filmCatalogData.json'
    previous_snapshot = json.loads(output.read_text(encoding='utf-8')) if output.exists() else {}
    previous = previous_snapshot.get('films', [])
    # Refresh existing entries too, even if they fall outside today's selections.
    for film in previous:
        selected.setdefault(film['source']['id'], (film['kind'], film['rank']))
    existing_qids = {film['source']['id'] for film in previous}
    ids = sorted(set(selected) - ambiguous - ((existing_qids - targeted_qids) if args.only_new else set()))
    films = []
    groups = [ids[offset:offset + 80] for offset in range(0, len(ids), 80)]
    # Two in-flight requests, with globally spaced starts, keep the public
    # endpoint load bounded while one request waits for a response.
    with ThreadPoolExecutor(max_workers=2) as pool:
        for index, rows in enumerate(pool.map(provider.metadata, groups)):
            group = groups[index]
            by_id = {qid: [] for qid in group}
            for row in rows:
                by_id[row['item']['value'].rsplit('/', 1)[-1]].append(row)
            for qid in group:
                film = parse_metadata(qid, *selected[qid], by_id[qid], vietnamese_titles.get(qid))
                if film:
                    films.append(film)
            print(json.dumps({'metadata': min((index + 1) * 80, len(ids)), 'total': len(ids)}), flush=True)
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
    refreshed_count = len(films)
    merged = {film['id']: film for film in previous}
    for film in films:
        if film['id'] in merged:
            film['aliases'] = sorted(set(film['aliases']) | set(merged[film['id']]['aliases']))
        merged[film['id']] = film
    alias_updates = 0
    for film in merged.values():
        title = vietnamese_titles.get(film['source']['id'])
        if title and title != film['title'] and title not in film['aliases']:
            film['aliases'] = sorted(set(film['aliases']) | {title})
            alias_updates += 1
    curated_updates = 0
    for film in merged.values():
        extra = curated_aliases.get(film['source']['id'], [])
        if any(not isinstance(value, str) or not value.strip() for value in extra):
            raise ValueError('Invalid project search alias')
        additions = set(extra) - {film['title']} - set(film['aliases'])
        if additions:
            film['aliases'] = sorted(set(film['aliases']) | additions)
            curated_updates += 1
    films = sorted(merged.values(), key=lambda film: film['id'])
    report = {'provider': 'Wikidata', 'license': 'CC0-1.0', 'url': 'https://www.wikidata.org/',
              'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'complete': True,
              'coverage': 'Bounded selections by Wikipedia sitelink count, country-of-origin Vietnam, recent releases, and optional Vietnamese Wikipedia coverage; not an exhaustive filmography. No guessed translations.',
              'selection': {'movies': args.movies, 'series': args.series, 'vietnam': args.vietnam, 'recentSince': args.recent_since.isoformat() if args.recent_since else None, 'recentLimit': args.recent_limit, 'vietnameseWikipediaLimit': args.vietnamese_wikipedia_limit, 'coverageFile': str(args.coverage_file) if args.coverage_file else None}, 'freshFetch': args.refresh or args.refresh_since is not None, 'cacheFreshSince': args.refresh_since.isoformat() if args.refresh_since else None, 'metadataMode': 'new-and-targeted' if args.only_new and targeted_qids else 'new-only' if args.only_new else 'refresh-all', 'previousSnapshotAt': previous_snapshot.get('source', {}).get('retrievedAt'), 'vietnameseAliasUpdates': alias_updates, 'refreshedCount': refreshed_count, 'retainedCount': len(films) - refreshed_count, 'projectAliasUpdates': curated_updates, 'targetedCount': len(targeted_qids), 'ambiguityResolved': resolved, 'ambiguousExcluded': sorted(ambiguous), 'count': len(films),
              'movies': sum(f['kind'] == 'MOVIE' for f in films), 'series': sum(f['kind'] == 'SERIES' for f in films),
              'vietnam': sum('Q881' in f['countries'] for f in films)}
    temporary = output.with_suffix('.json.tmp')
    temporary.write_text(json.dumps({'source': report, 'films': films}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    payload = temporary.read_bytes()
    manifest = ROOT / 'catalog-manifests/films.json'
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest_temp = manifest.with_suffix('.json.tmp')
    manifest_temp.write_text(json.dumps({'source': report, 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(output)
    manifest_temp.replace(manifest)
    print(json.dumps(report), flush=True)

if __name__ == '__main__':
    main()
