import importlib.util
import json
import datetime
import gzip
import hashlib
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('film_collector', Path(__file__).resolve().parents[1] / 'scripts/collect-film-catalog.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class FilmCollectorTest(unittest.TestCase):
    def test_targeted_coverage_checks_qids_and_keeps_film_type_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            provider = collector.Provider(Path(directory))
            with patch.object(provider, 'query', return_value=[]) as query:
                provider.coverage(['Q1'], ['Q2'])
                self.assertEqual(query.call_count, 2)
                self.assertIn('wdt:P161', query.call_args_list[0].args[0])
                self.assertIn('wdt:P57', query.call_args_list[0].args[0])
                self.assertIn('(wd:Q11424 "MOVIE")', query.call_args.args[0])
                self.assertIn('(wd:Q5398426 "SERIES")', query.call_args.args[0])
            with patch.object(provider, 'query') as query:
                with self.assertRaises(ValueError):
                    provider.coverage(['Q1} invalid query'], [])
                query.assert_not_called()

    def test_direct_class_resolves_only_unambiguous_roots(self):
        selected = {qid: ('SERIES', 5) for qid in ['Q1', 'Q2', 'Q3']}
        ambiguous = set(selected)
        def row(qid, kind):
            return {'item': {'value': 'http://www.wikidata.org/entity/' + qid}, 'kind': {'value': kind}}
        resolved = collector.resolve_direct_kinds(selected, ambiguous, [row('Q1', 'MOVIE'), row('Q2', 'MOVIE'), row('Q2', 'SERIES')])
        self.assertEqual(resolved, {'Q1': 'MOVIE'})
        self.assertEqual(selected['Q1'], ('MOVIE', 5))
        self.assertEqual(ambiguous, {'Q2', 'Q3'})

    def test_verified_vietnamese_wikipedia_title_can_fill_missing_labels(self):
        film = collector.parse_metadata('Q123', 'MOVIE', 2, [], 'Tên phim tiếng Việt')
        self.assertEqual(film['title'], 'Tên phim tiếng Việt')
        self.assertEqual(film['id'], collector.film_id('Q123'))
        self.assertIsNone(collector.parse_metadata('Q123', 'MOVIE', 2, []))

    def test_resume_uses_only_cache_newer_than_cutoff(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / (hashlib.sha256(b'query').hexdigest() + '.json.gz')
            cache.write_bytes(gzip.compress(json.dumps([{'old': True}]).encode()))
            os.utime(cache, (1, 1))
            cutoff = datetime.datetime.now(datetime.timezone.utc)
            provider = collector.Provider(Path(directory), refresh_since=cutoff)
            response = unittest.mock.MagicMock()
            response.__enter__.return_value.read.return_value = json.dumps({'results': {'bindings': [{'new': True}]}}).encode()
            with patch.object(collector.urllib.request, 'urlopen', return_value=response) as fetch:
                self.assertEqual(provider.query('query'), [{'new': True}])
                self.assertEqual(provider.query('query'), [{'new': True}])
                self.assertEqual(fetch.call_count, 1)

    def test_refresh_replaces_stale_cached_response(self):
        with tempfile.TemporaryDirectory() as directory:
            provider = collector.Provider(Path(directory))
            def response(value):
                result = unittest.mock.MagicMock()
                result.__enter__.return_value.read.return_value = json.dumps({'results': {'bindings': [value]}}).encode()
                return result
            with patch.object(collector.urllib.request, 'urlopen', return_value=response({'old': True})) as fetch:
                self.assertEqual(provider.query('query'), [{'old': True}])
                self.assertEqual(provider.query('query'), [{'old': True}])
                self.assertEqual(fetch.call_count, 1)
            with patch.object(collector.urllib.request, 'urlopen', return_value=response({'new': True})) as fetch:
                fresh = collector.Provider(Path(directory), refresh=True)
                self.assertEqual(fresh.query('query'), [{'new': True}])
                self.assertEqual(fetch.call_count, 1)
            self.assertEqual(collector.Provider(Path(directory)).query('query'), [{'new': True}])

    def test_recent_selection_uses_release_date_and_excludes_future_releases(self):
        with tempfile.TemporaryDirectory() as directory:
            provider = collector.Provider(Path(directory))
            with patch.object(provider, 'query', return_value=[]) as query:
                for kind, date in [('MOVIE', 'P577'), ('SERIES', 'P580')]:
                    provider.recent(kind, '2026-01-01', 2000)
                    text = query.call_args.args[0]
                    self.assertIn('wdt:' + date, text)
                    self.assertIn('2026-01-01T00:00:00Z', text)
                    self.assertIn('?released <= NOW()', text)
                    self.assertIn('LIMIT 2000', text)

    def test_vietnamese_wikipedia_selection_has_no_popularity_or_country_filter(self):
        with tempfile.TemporaryDirectory() as directory:
            provider = collector.Provider(Path(directory))
            with patch.object(provider, 'query', return_value=[]) as query:
                for kind, root in [('MOVIE', 'Q11424'), ('SERIES', 'Q5398426')]:
                    provider.vietnamese_wikipedia(kind, 15000)
                    text = query.call_args.args[0]
                    self.assertIn('https://vi.wikipedia.org/', text)
                    self.assertIn('wd:' + root, text)
                    self.assertIn('schema:name ?title', text)
                    self.assertNotIn('FILTER(?links', text)
                    self.assertNotIn('P495', text)


if __name__ == '__main__':
    unittest.main()
