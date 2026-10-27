"""Offline regression tests for the bulk importer; no provider requests."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('collector', Path(__file__).resolve().parents[1] / 'scripts/collect-song-catalog.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)
WORK = '00000000-0000-4000-8000-000000000001'
REC = '00000000-0000-4000-8000-000000000002'


class CatalogImportTest(unittest.TestCase):
    def work(self, **changes):
        return {'id': WORK, 'title': 'Một bài hát', 'type': 'Song', 'language': 'vie',
                'relations': [{'type': 'composer', 'artist': {'name': 'Composer only'}},
                              {'type': 'performance', 'recording': {'id': REC, 'title': 'Một bài hát'}}], **changes}

    def test_explicit_language_required_and_scopes_do_not_leak(self):
        self.assertIsNotNone(collector.compact_work(self.work(), 'VI'))
        self.assertIsNone(collector.compact_work(self.work(), 'US_UK'))
        self.assertIsNone(collector.compact_work(self.work(language=None), 'VI'))
        self.assertIsNone(collector.compact_work(self.work(languages=['eng', 'vie']), 'US_UK'))

    def test_only_valid_song_work_ids_and_real_performance_links(self):
        for change in [{'id': 'fake'}, {'type': 'Symphony'}, {'title': ''}, {'title': 'x' * 121}, {'relations': []}]:
            self.assertIsNone(collector.compact_work(self.work(**change), 'VI'))

    def test_composer_never_becomes_performer_and_missing_credit_is_not_published(self):
        work = collector.compact_work(self.work(), 'VI')
        self.assertIsNone(collector.attach_credit(work, {}))
        song = collector.attach_credit(work, {REC: {'artist-credit': [{'name': 'Actual singer'}]}})
        self.assertEqual(song['performers'], ['Actual singer'])
        self.assertEqual(song['detail'], 'Tác giả: Composer only')
        self.assertEqual(song['source']['recordingId'], REC)
        self.assertEqual(song['source']['languages'], ['vie'])

    def test_unrelated_recording_and_placeholder_credit_are_rejected(self):
        work = collector.compact_work(self.work(), 'VI')
        self.assertIsNone(collector.attach_credit(work, {WORK: {'artist-credit': [{'name': 'Wrong record'}]}}))
        self.assertIsNone(collector.attach_credit(work, {REC: {'artist-credit': [{'name': '[unknown]'}]}}))
        self.assertIsNone(collector.attach_credit(work, {REC: {'artist-credit': [{'name': 'Various Artists'}]}}))
        self.assertIsNone(collector.compact_work(self.work(title='Broken \ufffd'), 'VI'))

    def test_studio_precedes_live_and_duplicate_recording_links_are_not_counted_twice(self):
        live = '00000000-0000-4000-8000-000000000003'
        relations = [{'type': 'performance', 'recording': {'id': live, 'title': 'Live version'}},
                     {'type': 'performance', 'recording': {'id': REC, 'title': 'Studio'}},
                     {'type': 'performance', 'recording': {'id': REC, 'title': 'Studio'}}]
        work = collector.compact_work(self.work(relations=relations), 'VI')
        self.assertEqual(work['recordingIds'], [REC, live])
        self.assertEqual(work['recordingCount'], 2)

    def test_chart_preference_uses_only_a_real_linked_recording(self):
        preferred = '00000000-0000-4000-8000-000000000003'
        relations = [{'type': 'performance', 'recording': {'id': REC, 'title': 'Cover'}},
                     {'type': 'performance', 'recording': {'id': preferred, 'title': 'Original'}}]
        work = collector.compact_work(self.work(relations=relations), 'VI', {preferred: 0})
        self.assertEqual(work['recordingIds'][0], preferred)
        song = collector.attach_credit(work, {preferred: {'artist-credit': [{'name': 'Chart singer'}]}})
        self.assertEqual(song['performers'], ['Chart singer'])


if __name__ == '__main__':
    unittest.main()
