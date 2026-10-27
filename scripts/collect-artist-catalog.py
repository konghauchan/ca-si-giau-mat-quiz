"""Browse every recording page for a curated artist roster, storing public metadata only.

Explicit English Song works + actual recording artist IDs are required. Unknown
languages / unlinked recordings are reported, never assigned invented Work IDs.
Uses a shared 1.2-second request-start gate with bounded concurrent I/O and cache.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import importlib.util
import json
from itertools import zip_longest
from pathlib import Path
import threading
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('bulk_collector', ROOT / 'scripts/collect-song-catalog.py')
bulk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bulk)
RESOLVER_VERSION = 2


def normalized(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', value.casefold()) if c.isalnum())


def roster_entries(roster, only=None):
    groups = [[(era, entry) for entry in group] for era, group in roster.items() if isinstance(group, list)]
    entries = [pair for row in zip_longest(*groups) for pair in row if pair is not None]
    names = [entry if isinstance(entry, str) else entry['name'] for _, entry in entries]
    if len({normalized(name) for name in names}) != len(names):
        raise ValueError('Duplicate artist names in roster')
    priority = {normalized(name): index for index, name in enumerate(roster.get('_meta', {}).get('priority', []))}
    entries.sort(key=lambda pair: priority.get(normalized(pair[1] if isinstance(pair[1], str) else pair[1]['name']), len(priority)))
    if only:
        selected = {normalized(name) for name in only}
        if not selected.issubset({normalized(name) for name in names}):
            raise ValueError('Requested artist is not in roster')
        entries = [pair for pair in entries if normalized(pair[1] if isinstance(pair[1], str) else pair[1]['name']) in selected]
    return entries


def resolve_artist(provider, entry):
    entry = {'name': entry} if isinstance(entry, str) else entry
    name = entry['name']
    escaped = name.replace('\\', '\\\\').replace('"', '\\"')
    pinned = entry.get('mbid')
    if pinned and not bulk.UUID.fullmatch(pinned):
        raise ValueError('Invalid pinned artist MBID: ' + name)
    suffix = ''.join(' AND ' + key + ':' + entry[key] for key in ('country', 'type') if entry.get(key))
    queries = ['arid:' + pinned] if pinned else ['artist:"' + escaped + '"' + suffix, '"' + escaped + '"' + suffix]
    exact = []
    for query in queries:
        candidates = provider.get('artist', query=query, limit=25)['artists']
        exact = [a for a in candidates if bulk.UUID.fullmatch(a.get('id', '')) and a.get('type') in ('Person', 'Group') and
                 ((a['id'] == pinned) if pinned else any(normalized(v) == normalized(name) for v in [a.get('name', '')] + [x.get('name', '') for x in a.get('aliases', [])])) and
                 (not entry.get('country') or a.get('country') == entry['country']) and
                 (not entry.get('type') or a.get('type') == entry['type'])]
        if exact:
            break
    if not exact:
        raise ValueError('No exact artist identity: ' + name)
    score = max(int(a.get('score', 0)) for a in exact)
    winners = [a for a in exact if int(a.get('score', 0)) == score]
    if len(winners) != 1:
        raise ValueError('Ambiguous artist identity, specify country/type/MBID: ' + name)
    return {'id': winners[0]['id'], 'name': winners[0]['name'], 'requested': entry.get('searchName', name),
            'country': winners[0].get('country'), 'type': winners[0]['type'], 'disambiguation': winners[0].get('disambiguation', '')}


def recording_songs(recording, artist):
    credits = [c for c in recording.get('artist-credit', []) if isinstance(c, dict)]
    if not any(c.get('artist', {}).get('id') == artist['id'] for c in credits):
        return [], 'uncredited'
    names = list(dict.fromkeys((c.get('name') or c.get('artist', {}).get('name') or '').strip() for c in credits))
    if not bulk.usable_credit(names) or not bulk.UUID.fullmatch(recording.get('id', '')):
        return [], 'invalid'
    songs = []
    for relation in recording.get('relations', []):
        if relation.get('type') != 'performance' or relation.get('target-type') != 'work':
            continue
        work = relation.get('work', {})
        languages = work.get('languages') or [work.get('language')]
        title = (work.get('title') or '').strip()
        if not bulk.UUID.fullmatch(work.get('id', '')) or work.get('type') != 'Song' or 'eng' not in languages or 'vie' in languages or not title or len(title) > 120 or '\ufffd' in title:
            continue
        songs.append({'id': work['id'], 'title': title, 'scope': 'US_UK', 'detail': 'Tác phẩm âm nhạc',
                      'performers': names, 'artistAliases': list(dict.fromkeys([artist['name'], artist['requested']])),
                      'source': {'provider': 'MusicBrainz', 'workId': work['id'], 'recordingId': recording['id'],
                                 'languages': languages, 'artistIds': [c['artist']['id'] for c in credits if c.get('artist', {}).get('id')],
                                 'performerCredits': [{'artistId': artist['id'], 'name': artist['name'], 'recordingId': recording['id']} ]}})
    return songs, None if songs else 'noEligibleWork'


def merge_song(previous, incoming):
    if not previous:
        return incoming
    # Alternate performers are search aliases with recording-level evidence.
    # Never concatenate two cover credits into a fictional duet display.
    source = dict(previous['source'])
    credits = {c['artistId']: c for c in source.get('performerCredits', [])}
    credits.update({c['artistId']: c for c in incoming['source'].get('performerCredits', [])})
    source['performerCredits'] = list(credits.values())
    return {**previous, 'artistAliases': list(dict.fromkeys(previous.get('artistAliases', []) + incoming.get('artistAliases', []))), 'source': source}


def collect(args):
    roster = json.loads((ROOT / args.roster).read_text(encoding='utf-8'))
    state_dir = ROOT / args.state_dir
    provider = bulk.Provider(state_dir / 'responses')
    checkpoint = state_dir / 'checkpoint.json'
    state = json.loads(checkpoint.read_text(encoding='utf-8')) if checkpoint.exists() else {'artists': {}, 'songs': {}}
    entries = roster_entries(roster, getattr(args, 'only', None))
    state_lock = threading.Lock()
    identities_path = state_dir / 'identities.json'
    identities = json.loads(identities_path.read_text(encoding='utf-8')) if identities_path.exists() else {}

    def identify(pair):
        _, entry = pair
        name = entry if isinstance(entry, str) else entry['name']
        saved = identities.get(name)
        if saved and saved.get('entry') == entry and saved.get('artist') and saved.get('resolverVersion') == RESOLVER_VERSION:
            return
        try:
            report = state['artists'].get(name, {})
            artist = resolve_artist(provider, entry)
            if report.get('artist') and report['artist']['id'] != artist['id']:
                raise ValueError('Artist identity changed; review existing checkpoint: ' + name)
            value = {'entry': entry, 'artist': artist, 'resolverVersion': RESOLVER_VERSION}
        except ValueError as error:
            value = {'entry': entry, 'error': str(error)}
        with state_lock:
            identities[name] = value
            bulk.atomic_json(identities_path, identities)
            print(json.dumps({'identity': name, **value}), flush=True)

    with ThreadPoolExecutor(max_workers=getattr(args, 'workers', 1)) as executor:
        list(executor.map(identify, entries))

    def process_artist(pair):
        era, entry = pair
        name = entry if isinstance(entry, str) else entry['name']
        report = state['artists'].get(name)
        if report and report.get('complete'):
            return
        if report and 'artist' not in report:
            report = None
        try:
            if identities[name].get('error'):
                raise ValueError(identities[name]['error'])
            artist = report['artist'] if report else identities[name]['artist']
        except ValueError as error:
            with state_lock:
                print(json.dumps({'artist': name, 'error': str(error)}), flush=True)
                state['artists'][name] = {'error': str(error), 'complete': False}
                bulk.atomic_json(checkpoint, state)
            return
        report = report or {'artist': artist, 'era': era, 'offset': 0, 'works': [], 'recordingsScanned': 0, 'skipped': {}, 'complete': False}
        work_ids = set(report['works'])
        while not report['complete']:
            data = provider.get('recording', artist=artist['id'], inc='artist-credits+work-rels', limit=100, offset=report['offset'])
            total = int(data['recording-count'])
            recordings = data['recordings']
            if not recordings and report['offset'] < total:
                raise ValueError('Empty recording page before end for ' + name)
            with state_lock:
                for recording in recordings:
                    songs, reason = recording_songs(recording, artist)
                    if reason:
                        report['skipped'][reason] = report['skipped'].get(reason, 0) + 1
                    for song in songs:
                        state['songs'][song['id']] = merge_song(state['songs'].get(song['id']), song)
                        work_ids.add(song['id'])
                report.update({'offset': report['offset'] + len(recordings), 'recordingsTotal': total,
                               'recordingsScanned': report['recordingsScanned'] + len(recordings), 'works': sorted(work_ids),
                               'complete': report['offset'] + len(recordings) >= total})
                state['artists'][name] = report
                bulk.atomic_json(checkpoint, state)
                print(json.dumps({'artist': name, 'scanned': report['recordingsScanned'], 'total': total,
                                  'works': len(work_ids), 'uniqueWorks': len(state['songs']), 'requests': provider.requests}), flush=True)
    with ThreadPoolExecutor(max_workers=getattr(args, 'workers', 1)) as executor:
        list(executor.map(process_artist, entries))
    complete = all(state['artists'].get(entry if isinstance(entry, str) else entry['name'], {}).get('complete') for _, entry in entries)
    requested_names = {entry if isinstance(entry, str) else entry['name'] for _, entry in entries}
    selected_reports = {k: v for k, v in state['artists'].items() if k in requested_names}
    selected_works = {work for report in selected_reports.values() for work in report.get('works', [])}
    songs = sorted((song for wid, song in state['songs'].items() if wid in selected_works), key=lambda s: s['id'])
    source = {'provider': 'MusicBrainz', 'url': 'https://musicbrainz.org/', 'license': 'CC0-1.0',
              'retrievedAt': bulk.time.strftime('%Y-%m-%dT%H:%M:%SZ', bulk.time.gmtime()),
              'selection': roster['description'], 'artistsRequested': len(entries), 'complete': complete,
              'rosterUpdatedAt': roster.get('_meta', {}).get('updatedAt'),
              'selectionSources': roster.get('_meta', {}).get('sources', []),
              'count': len(songs), 'artistReports': selected_reports}
    result = {'source': source, 'songs': songs}
    bulk.atomic_json(ROOT / args.output, result, line_items=True)
    print(json.dumps({'complete': complete, 'artists': len(entries), 'works': len(result['songs']), 'output': str(args.output)}), flush=True)
    if not complete:
        raise SystemExit('Unresolved artist identities or incomplete pages; see checkpoint/report.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--roster', default='scripts/artist-catalog-roster.json')
    parser.add_argument('--state-dir', default='data/artist-catalog')
    parser.add_argument('--output', default='data/artist-catalog/expansion.json')
    parser.add_argument('--workers', type=int, choices=range(1, 5), default=4)
    parser.add_argument('--only', action='append', help='Collect selected roster artists; may be repeated')
    collect(parser.parse_args())
