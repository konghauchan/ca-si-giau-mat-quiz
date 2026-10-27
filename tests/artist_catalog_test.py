"""Offline tests for artist identity, full pagination and recording/work evidence."""
import argparse
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import uuid
import unittest
import time
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('artist_collector', Path(__file__).resolve().parents[1] / 'scripts/collect-artist-catalog.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
ARTIST = '00000000-0000-4000-8000-000000000001'
REC = '00000000-0000-4000-8000-000000000002'
WORK = '00000000-0000-4000-8000-000000000003'


class ArtistCatalogTest(unittest.TestCase):
    def test_roster_prioritizes_britney_interleaves_eras_and_rejects_duplicates(self):
        roster={'description':'test','_meta':{'priority':['Britney Spears'],'sources':[{'url':'https://example.test'}]},'1990s':['Old band','Britney Spears'],'2020s':['New artist','Other artist']}
        self.assertEqual([entry for _,entry in c.roster_entries(roster)],['Britney Spears','Old band','New artist','Other artist'])
        self.assertEqual(c.roster_entries(roster,['Britney Spears']),[('1990s','Britney Spears')])
        with self.assertRaisesRegex(ValueError,'not in roster'):
            c.roster_entries(roster,['Missing'])
        with self.assertRaisesRegex(ValueError,'Duplicate'):
            c.roster_entries({'1990s':['R.E.M.'],'2020s':['REM']})

    def test_published_roster_covers_current_eras_and_preserves_prior_131(self):
        root=Path(__file__).resolve().parents[1]
        roster=json.loads((root/'scripts/artist-catalog-roster.json').read_text(encoding='utf8'))
        entries=c.roster_entries(roster)
        self.assertEqual(len(entries),377)
        names={entry if isinstance(entry,str) else entry['name'] for _,entry in entries}
        self.assertTrue({'Britney Spears','Backstreet Boys','Westlife','Billie Eilish','Olivia Rodrigo','Sabrina Carpenter','Olivia Dean','sombr','Sienna Spiro'}.issubset(names))
        self.assertEqual(roster['_meta']['updatedAt'],'2026-10-27')
        self.assertEqual(entries[0][1],'Britney Spears')

    def test_concurrent_io_has_one_global_request_start_gate(self):
        starts = []
        class Response(io.BytesIO):
            headers = {}
        def request(*args, **kwargs):
            starts.append(time.monotonic())
            return Response(b'{"artists":[]}')
        directory = Path(__file__).resolve().parents[1] / 'data' / ('artist-rate-test-' + uuid.uuid4().hex)
        provider = c.bulk.Provider(directory)
        with patch.object(c.bulk.urllib.request, 'urlopen', request), ThreadPoolExecutor(max_workers=3) as pool:
            list(pool.map(lambda n: provider.get('artist', query='test-' + str(n)), range(3)))
        self.assertEqual(len(starts), 3)
        self.assertTrue(all(b - a >= 1.15 for a, b in zip(starts, starts[1:])))

    def recording(self, **changes):
        return {'id': REC, 'artist-credit': [{'name': 'Actual singer', 'artist': {'id': ARTIST, 'name': 'Actual singer'}}],
                'relations': [{'type': 'performance', 'target-type': 'work', 'work': {'id': WORK, 'title': 'Song', 'type': 'Song', 'languages': ['eng']}}], **changes}

    def test_credit_requires_target_artist_id_and_real_english_song_work(self):
        artist = {'id': ARTIST, 'name': 'Actual singer', 'requested': 'Actual Singer'}
        songs, reason = c.recording_songs(self.recording(), artist)
        self.assertIsNone(reason)
        self.assertEqual(songs[0]['id'], WORK)
        self.assertEqual(songs[0]['source']['recordingId'], REC)
        self.assertEqual(songs[0]['source']['performerCredits'][0]['artistId'], ARTIST)
        self.assertEqual(c.recording_songs(self.recording(), {**artist, 'id': WORK})[1], 'uncredited')
        for languages in [[], ['vie'], ['eng', 'vie'], ['spa']]:
            record = self.recording()
            record['relations'][0]['work']['languages'] = languages
            self.assertEqual(c.recording_songs(record, artist)[0], [])

    def test_covers_share_work_without_becoming_fictional_duet(self):
        first = c.recording_songs(self.recording(), {'id': ARTIST, 'name': 'Actual singer', 'requested': 'Actual singer'})[0][0]
        record = self.recording(**{'artist-credit': [{'name': 'Cover singer', 'artist': {'id': WORK}}]})
        second = c.recording_songs(record, {'id': WORK, 'name': 'Cover singer', 'requested': 'Cover singer'})[0][0]
        merged = c.merge_song(first, second)
        self.assertEqual(merged['performers'], ['Actual singer'])
        self.assertIn('Cover singer', merged['artistAliases'])
        self.assertEqual(len(merged['source']['performerCredits']), 2)
        self.assertEqual(len(c.merge_song(merged, second)['source']['performerCredits']), 2)

    def test_exact_identity_required_ambiguous_artist_is_never_guessed(self):
        class Fake:
            def get(self, *a, **kw):
                return {'artists': [{'id': ARTIST, 'name': 'Blue', 'type':'Group','score': 100}, {'id': WORK, 'name': 'Blue','type':'Group', 'score': 100}]}
        with self.assertRaisesRegex(ValueError, 'Ambiguous'):
            c.resolve_artist(Fake(), 'Blue')
        with self.assertRaisesRegex(ValueError, 'No exact'):
            c.resolve_artist(Fake(), 'Wrong name')

    def test_untyped_homonym_cannot_override_a_renamed_artist_alias(self):
        class Fake:
            def get(self,*args,**params):
                wrong={'id':WORK,'name':'Miley Cyrus','score':100,'disambiguation':'7FORM alias'}
                real={'id':ARTIST,'name':'MILEY','type':'Person','country':'US','score':82,'aliases':[{'name':'Miley Cyrus'}]}
                return {'artists':[wrong] if params['query'].startswith('artist:') else [wrong,real]}
        self.assertEqual(c.resolve_artist(Fake(),'Miley Cyrus')['id'],ARTIST)
        self.assertEqual(c.resolve_artist(Fake(),{'name':'Miley Cyrus','mbid':ARTIST,'country':'US','type':'Person'})['id'],ARTIST)

    def test_all_pages_are_visited_and_completed_artist_resumes_without_network(self):
        recording = self.recording()
        calls = []

        class Fake:
            requests = 0
            def __init__(self, *a):
                pass
            def get(self, entity, **params):
                calls.append((entity, params.get('offset')))
                if entity == 'artist':
                    return {'artists': [{'id': ARTIST, 'name': 'Actual singer', 'type':'Person','score': 100}]}
                return {'recording-count': 101, 'recordings': [recording] * (100 if params['offset'] == 0 else 1)}

        test_root = Path(__file__).resolve().parents[1] / 'data'
        test_root.mkdir(exist_ok=True)
        with contextlib.nullcontext(test_root / ('artist-test-' + uuid.uuid4().hex)) as temp:
            directory = Path(temp)
            directory.mkdir()
            assert directory.resolve().is_relative_to(test_root.resolve())
            roster = directory / 'roster.json'
            roster.write_text(json.dumps({'description': 'test', '1990s': ['Actual singer']}))
            args = argparse.Namespace(roster=roster, state_dir=directory / 'state', output=directory / 'out.json')
            args.state_dir.mkdir()
            other_work='00000000-0000-4000-8000-000000000004'
            (args.state_dir/'checkpoint.json').write_text(json.dumps({'artists':{'Other artist':{'complete':True,'works':[other_work]}},'songs':{other_work:{'id':other_work,'title':'Unrelated work','scope':'US_UK'}}}),encoding='utf8')
            with patch.object(c.bulk, 'Provider', Fake), contextlib.redirect_stdout(io.StringIO()):
                c.collect(args)
                c.collect(args)
            self.assertEqual(calls, [('artist', None), ('recording', 0), ('recording', 100)])
            result = json.loads(args.output.read_text(encoding='utf8'))
            self.assertTrue(result['source']['complete'])
            self.assertEqual(result['source']['artistReports']['Actual singer']['recordingsScanned'], 101)
            self.assertEqual(len(result['songs']), 1)


if __name__ == '__main__':
    unittest.main()
