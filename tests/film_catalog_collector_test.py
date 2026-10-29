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


if __name__ == '__main__':
    unittest.main()
