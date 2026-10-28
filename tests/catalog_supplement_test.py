import importlib.util
from collections import defaultdict
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('supplement',Path(__file__).resolve().parents[1]/'scripts/collect-catalog-supplement.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
A='5f000e69-3cfd-4871-8f1b-faa7f0d4bcbc'
W='b2ca2699-1db0-470a-8a11-1a04cf20f945'
R='01616583-be3c-4f90-8102-ebfc4122b371'

class SupplementTest(unittest.TestCase):
    def recording(self,languages=None,kind=None):
        return {'id':R,'artist-credit':[{'name':'Westlife','artist':{'id':A}}],
                'relations':[{'type':'performance','target-type':'work','work':{'id':W,'title':'I Lay My Love on You','type':kind,'languages':languages or []}}]}
    def value(self):
        return {'id':'Q2365099','title':'I Lay My Love on You','artists':{'Q151241'},'languages':set(),'workIds':{W}}
    def test_missing_type_and_language_keep_real_work_id_only_under_new_policy(self):
        artist={'id':A,'name':'Westlife','requested':'Westlife'}
        self.assertEqual(c.artist.recording_songs(self.recording(),artist)[0],[])
        songs,_=c.artist.recording_songs(self.recording(),artist,allow_unknown=True)
        self.assertEqual(songs[0]['id'],W);self.assertEqual(songs[0]['source']['languages'],[])
        self.assertEqual(songs[0]['source']['languageStatus'],'unknown')
        for languages in [['spa'],['vie'],['eng','vie']]:
            self.assertEqual(c.artist.recording_songs(self.recording(languages),artist,allow_unknown=True)[0],[])
        self.assertEqual(c.artist.recording_songs(self.recording(['eng'],'Symphony'),artist,allow_unknown=True)[0],[])
        self.assertEqual(c.artist.recording_songs(self.recording(),{'id':R,'name':'Other','requested':'Other'},allow_unknown=True)[0],[])
    def test_wikidata_preserves_mbid_and_requires_verified_performer(self):
        value=self.value();review=[]
        song=c.convert(value,{'Q151241':{'id':A,'name':'Westlife'}},{},{},review)
        self.assertEqual(song['id'],W);self.assertEqual(song['source']['provider'],'Wikidata')
        self.assertEqual(song['source']['languageStatus'],'unknown')
        self.assertIsNone(c.convert(value,{},{},{},review))
        value['languages']={'Q1321'}
        self.assertIsNone(c.convert(value,{'Q151241':{'id':A,'name':'Westlife'}},{},{},review))
    def test_independent_ids_are_stable_and_never_claim_a_fake_mbid(self):
        value=self.value();value['workIds']=set()
        song=c.convert(value,{'Q151241':{'id':A,'name':'Westlife'}},{},{},[])
        self.assertEqual(song['id'],c.catalog_id('Q2365099'));self.assertIsNone(song['source']['workId'])
        self.assertNotEqual(song['id'],c.catalog_id('Q1'))
    def test_title_match_is_reviewed_but_explicit_different_work_is_never_collapsed(self):
        value=self.value();value['workIds']=set();review=[]
        index={(c.artist.normalized(value['title']),A):{R}}
        self.assertIsNone(c.convert(value,{'Q151241':{'id':A,'name':'Westlife'}},{},index,review))
        self.assertEqual(review[0]['reason'],'existing-title-artist-candidate')
        value['workIds']={W}
        song=c.convert(value,{'Q151241':{'id':A,'name':'Westlife'}},{R:{'scope':'US_UK'}},index,[])
        self.assertEqual(song['id'],W)
    def test_all_language_claims_are_considered(self):
        self.assertTrue(c.accepted_languages(set()));self.assertTrue(c.accepted_languages({'Q1860'}))
        self.assertFalse(c.accepted_languages({'Q9199'}));self.assertFalse(c.accepted_languages({'Q1860','Q9199'}))
        row={'song':{'value':'http://www.wikidata.org/entity/Q1'},'title':{'value':'Title'},'artist':{'value':'http://www.wikidata.org/entity/Q2'},'type':{'value':'http://www.wikidata.org/entity/Q7366'},'lang':{'value':'http://www.wikidata.org/entity/Q1860'}}
        other={**row,'lang':{'value':'http://www.wikidata.org/entity/Q9199'}}
        self.assertFalse(c.accepted_languages(c.aggregate([row,other])['Q1']['languages']))
    def test_newly_recovered_work_is_indexed_before_an_unlinked_source(self):
        index=defaultdict(set)
        c.index_identity({'id':W,'title':'I Lay My Love on You','source':{'artistIds':[A]}},index)
        value=self.value();value['workIds']=set();review=[]
        self.assertIsNone(c.convert(value,{'Q151241':{'id':A,'name':'Westlife'}},{},index,review))
        self.assertEqual(review[0]['candidates'],[W])
    def test_legacy_display_credit_is_a_review_candidate_without_inventing_a_work_link(self):
        index=defaultdict(set)
        c.index_identity({'id':W,'title':'I Lay My Love on You','performers':['Westlife']},index,{'westlife':A})
        value=self.value();value['workIds']=set();review=[]
        self.assertIsNone(c.convert(value,{'Q151241':{'id':A,'name':'Westlife'}},{},index,review))
        self.assertEqual(review[0]['reason'],'existing-title-artist-candidate')

if __name__=='__main__':unittest.main()
