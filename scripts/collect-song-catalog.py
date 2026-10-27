"""Resumable, single-worker MusicBrainz metadata import. Never downloads audio.

python scripts/collect-song-catalog.py --target 20000
Requests are serialized (>=1.2 seconds apart), cached and retried with backoff.
Only validated Song works with explicit lyric language AND a linked recording's
actual artist credit are published. A recording count is a coverage proxy, NOT
a streaming chart or an assertion that every imported song is a hit.
"""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import time
import threading
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
MB = 'https://musicbrainz.org/ws/2/'
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)
VARIANT = re.compile(r'\b(live|remix|instrumental|karaoke|medley)\b', re.I)
PLACEHOLDERS = {'[unknown]', '[no artist]', '[anonymous]', 'various artists', 'unknown artist'}


def usable_credit(names):
    return bool(names) and len(names) <= 12 and all(name.strip() and len(name) <= 120 and '\ufffd' not in name and name.casefold() not in PLACEHOLDERS for name in names)


def atomic_json(path, value, line_items=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    if line_items:
        rendered = '{\n  "source": ' + json.dumps(value['source'], ensure_ascii=False) + ',\n  "songs": [\n'
        rendered += ',\n'.join('    ' + json.dumps(song, ensure_ascii=False, separators=(',', ':')) for song in value['songs'])
        rendered += '\n  ]\n}\n'
    else:
        rendered = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    temporary.write_text(rendered, encoding='utf-8')
    os.replace(temporary, path)


class Provider:
    def __init__(self, cache, delay=1.2):
        self.cache, self.delay, self.next_at = cache, max(1.2, delay), 0
        self.requests = 0
        self.schedule_lock = threading.Lock()

    def get(self, entity, **params):
        params['fmt'] = 'json'
        url = MB + entity + '/?' + urllib.parse.urlencode(params)
        return self.get_url(url, entity + 's')

    def get_url(self, url, field, nested=None):
        path = self.cache / (hashlib.sha256(url.encode()).hexdigest() + '.json')
        if path.exists():
            return json.loads(path.read_text(encoding='utf-8'))
        for attempt in range(7):
            # One global start gate, including when the artist importer uses
            # bounded concurrent I/O. Never burst requests to MusicBrainz.
            with self.schedule_lock:
                time.sleep(max(0, self.next_at - time.monotonic()))
                self.next_at = time.monotonic() + self.delay
                self.requests += 1
            try:
                request = urllib.request.Request(url, headers={
                    'User-Agent': 'DoNhacCatalog/1.0 (https://github.com/konghauchan/ca-si-giau-mat-quiz)',
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip',
                })
                with urllib.request.urlopen(request, timeout=60) as response:
                    value = json.load(gzip.GzipFile(fileobj=response) if response.headers.get('Content-Encoding') == 'gzip' else response)
                container = value.get(nested, {}) if nested else value
                if not isinstance(container.get(field), list):
                    raise ValueError('Invalid provider response for ' + field)
                atomic_json(path, value)
                return value
            except (urllib.error.URLError, TimeoutError, ValueError, OSError) as error:
                if isinstance(error, urllib.error.HTTPError) and error.code not in (408, 429, 500, 502, 503, 504):
                    raise
                with self.schedule_lock:
                    self.next_at = max(self.next_at, time.monotonic() + min(120, 3 * 2 ** attempt))
                print(json.dumps({'retry': attempt + 1, 'field': field, 'error': str(error)}, ensure_ascii=True), flush=True)
                if attempt == 6:
                    raise


def compact_work(work, scope, preferred_recordings=None):
    languages = work.get('languages') or [work.get('language')]
    if ('vie' if scope == 'VI' else 'eng') not in languages or (scope == 'US_UK' and 'vie' in languages):
        return None
    title = (work.get('title') or '').strip()
    if not UUID.fullmatch(work.get('id') or '') or work.get('type') != 'Song' or not title or len(title) > 120 or '\ufffd' in title:
        return None
    recordings = [r['recording'] for r in work.get('relations', []) if r.get('type') == 'performance' and UUID.fullmatch(r.get('recording', {}).get('id', ''))]
    priority = preferred_recordings or {}
    recordings.sort(key=lambda recording: (priority.get(recording['id'], float('inf')), bool(VARIANT.search(recording.get('title', '')))))
    recordings = list({recording['id']: recording for recording in recordings}.values())
    if not recordings:
        return None
    authors = list(dict.fromkeys(r['artist']['name'] for r in work.get('relations', []) if r.get('type') in ('composer', 'lyricist') and r.get('artist', {}).get('name')))
    return {'id': work['id'], 'title': title, 'scope': scope,
            'detail': ('Tác giả: ' + ', '.join(authors[:3]))[:240] if authors else 'Tác phẩm âm nhạc',
            'recordingIds': [r['id'] for r in recordings[:3]], 'recordingCount': len(recordings),
            'languages': languages}


def attach_credit(work, credits):
    for recording_id in work['recordingIds']:
        recording = credits.get(recording_id, {})
        names = list(dict.fromkeys((c.get('name') or c.get('artist', {}).get('name') or '').strip() for c in recording.get('artist-credit', [])))
        names = [name for name in names if name]
        if usable_credit(names):
            return {**{k: work[k] for k in ('id', 'title', 'scope', 'detail')}, 'performers': names,
                    'source': {'provider': 'MusicBrainz', 'workId': work['id'], 'recordingId': recording_id,
                               'languages': work['languages'], 'recordingCount': work['recordingCount']}}
    return None


def collect(args):
    state_dir = ROOT / args.state_dir
    provider = Provider(state_dir / 'responses', args.delay)
    seed = json.loads((ROOT / 'src/lib/musicCatalogSeed.json').read_text(encoding='utf-8'))
    state_path = state_dir / 'checkpoint.json'
    state = json.loads(state_path.read_text(encoding='utf-8')) if state_path.exists() else {'completed': [], 'songs': {}, 'skipped': 0}
    rejected = [key for key, song in state['songs'].items() if '\ufffd' in song['title'] or not usable_credit(song.get('performers', []))]
    if rejected:
        for key in rejected:
            del state['songs'][key]
        # Revisit cached pages to resolve alternate recording credits. All good
        # works are retained; cache hits generate no new provider request.
        state['completed'] = []
        print(json.dumps({'revalidateCachedPages': True, 'rejectedCreditsOrEncoding': len(rejected)}), flush=True)
    # Keep already curated performer/alias labels and every existing Work ID.
    curated = {song['id']: song for song in seed['songs']}
    for song in seed['songs']:
        if song.get('performers'):
            state['songs'].setdefault(song['id'], song)
    # Vietnamese language is an explicit provider field, never artist nationality.
    # English works are visited by descending recording-count band.
    bands = [('VI', 'lang:vie AND type:song', 100)]
    bounds = [(1000, '*', 25), (500, 999, 50), (200, 499, 100), (100, 199, 100),
              (50, 99, 100), (30, 49, 100), (20, 29, 100), (10, 19, 100), (5, 9, 100)]
    bands += [('US_UK', f'lang:eng AND NOT lang:vie AND type:song AND recording_count:[{lo} TO {hi}]', size) for lo, hi, size in bounds]

    def save():
        atomic_json(state_path, state)
        songs = sorted(state['songs'].values(), key=lambda song: (song['id'] not in curated, -song.get('source', {}).get('listenCount', 0), song['scope'] != 'VI', -song.get('source', {}).get('recordingCount', 0), song['id']))[:args.target]
        counts = {scope: sum(song['scope'] == scope for song in songs) for scope in ('VI', 'US_UK')}
        result = {'source': {'provider': 'MusicBrainz', 'url': 'https://musicbrainz.org/', 'license': 'CC0-1.0',
                             'retrievedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                             'rankingSource': {'provider': 'ListenBrainz', 'url': 'https://listenbrainz.org/data/', 'license': 'CC0-1.0', 'range': 'all_time', 'sampleLimit': 1000},
                             'selection': 'Explicit lyric language; linked recording artist credit. Prioritize ListenBrainz community all-time top 1000, then descending recording-count bands. Not global streaming charts.',
                             'target': args.target, 'count': len(songs), 'counts': counts, 'complete': len(songs) == args.target}, 'songs': songs}
        atomic_json(ROOT / args.output, result, line_items=True)
        print(json.dumps({'published': len(songs), **counts, 'skipped': state['skipped'], 'requestsThisRun': provider.requests}, ensure_ascii=True), flush=True)

    # A small real community listening chart adds modern hits which may have
    # fewer cover recordings than standards. It is not a worldwide chart.
    if not state.get('priorityCompleted'):
        ranked = provider.get_url('https://api.listenbrainz.org/1/stats/sitewide/recordings?count=1000&offset=0&range=all_time', 'recordings', 'payload')['payload']
        entries = {r['recording_mbid']: r for r in ranked['recordings'] if UUID.fullmatch(r.get('recording_mbid') or '')}
        ids = list(entries)
        priority = {rid: index for index, rid in enumerate(ids)}
        credits = {}
        for start in range(0, len(ids), 100):
            subset = ids[start:start + 100]
            data = provider.get('recording', query=' OR '.join('rid:' + rid for rid in subset), limit=100)
            credits.update({r['id']: r for r in data['recordings'] if r.get('id') in entries})
        for start in range(0, len(ids), 50):
            subset = ids[start:start + 50]
            query = '(' + ' OR '.join('rid:' + rid for rid in subset) + ') AND type:song AND (lang:eng OR lang:vie)'
            data = provider.get('work', query=query, limit=100)
            for original in data['works']:
                for scope in ('VI', 'US_UK'):
                    work = compact_work(original, scope, priority)
                    song = attach_credit(work, credits) if work else None
                    if song:
                        ranked_recording = entries[song['source']['recordingId']]
                        song['source'].update({'listenCount': ranked_recording['listen_count'], 'listenBrainzUpdatedAt': ranked['last_updated']})
                        if song['id'] in curated:
                            song = {**song, **curated[song['id']]}
                        state['songs'][song['id']] = song
            save()
        state['priorityCompleted'] = True
        save()

    queue = [(scope, query, size, '') for scope, query, size in bands]
    while queue and len(state['songs']) < args.target:
        scope, base_query, size, prefix = queue.pop(0)
        query = base_query + (' AND wid:' + prefix + '*' if prefix else '')
        first = provider.get('work', query=query, limit=size, offset=0)
        total = int(first.get('count', 0))
        if total > 500:
            queue[0:0] = [(scope, base_query, size, prefix + digit) for digit in '0123456789abcdef']
            continue
        offset = 0
        while offset < total and len(state['songs']) < args.target:
            key = query + ':' + str(offset)
            if key in state['completed']:
                offset += size
                total = state.get('totals', {}).get(query, offset + 1)
                continue
            data = provider.get('work', query=query, limit=size, offset=offset)
            total = int(data.get('count', 0))
            candidates = [compact_work(work, scope) for work in data['works']]
            candidates = [work for work in candidates if work and work['id'] not in state['songs']]
            # Resolve first choices in batches; only request alternates for missing credits.
            credits = {}
            for depth in range(3):
                missing = [work for work in candidates if not attach_credit(work, credits)]
                ids = list(dict.fromkeys(work['recordingIds'][depth] for work in missing if len(work['recordingIds']) > depth))
                for start in range(0, len(ids), 100):
                    subset = ids[start:start + 100]
                    recs = provider.get('recording', query=' OR '.join('rid:' + rid for rid in subset), limit=100)
                    for recording in recs['recordings']:
                        if recording.get('id') in subset:
                            credits[recording['id']] = recording
                for work in missing:
                    song = attach_credit(work, credits)
                    if song:
                        if song['id'] in curated:
                            song = {**song, **curated[song['id']]}
                        state['songs'][song['id']] = song
            state['skipped'] += len(data['works']) - len(candidates) + sum(work['id'] not in state['songs'] for work in candidates)
            state['completed'].append(key)
            state.setdefault('totals', {})[query] = total
            save()
            if not data['works']:
                break
            offset += size
    save()
    if len(state['songs']) < args.target:
        raise SystemExit('Insufficient verified songs. Checkpoint saved; do not label this import complete.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', type=int, default=20000)
    parser.add_argument('--state-dir', default='data/catalog-import')
    parser.add_argument('--output', default='src/lib/musicCatalogPopular.json')
    parser.add_argument('--delay', type=float, default=1.2)
    options = parser.parse_args()
    if not 1 <= options.target <= 30000:
        parser.error('target must be between 1 and 30000')
    collect(options)
