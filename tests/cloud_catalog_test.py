import importlib.util
import hashlib
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('cloud_catalog',Path(__file__).resolve().parents[1]/'scripts/cloud-artist-catalog.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
WORK='00000000-0000-4000-8000-000000000001'

class CloudCatalogTest(unittest.TestCase):
    def fixture(self):
        roster={'description':'test','1990s':['Ready artist','Pending artist']}
        song={'id':WORK,'title':'Public song','scope':'US_UK','performers':['Ready artist'],'source':{'workId':WORK,'languages':['eng']}}
        checkpoint={'artists':{'Ready artist':{'complete':True,'offset':2,'recordingsScanned':2,'recordingsTotal':2,'works':[WORK]},'Pending artist':{'complete':False,'works':[]}},'songs':{WORK:song}}
        return roster,checkpoint

    def test_publish_contains_only_completed_catalogs_and_retains_full_target(self):
        roster,cp=self.fixture();value=c.assemble(cp,roster)
        self.assertTrue(value['source']['complete']);self.assertFalse(value['source']['fullRosterComplete'])
        self.assertEqual(value['source']['artistsRequested'],1);self.assertEqual(value['source']['fullRosterTarget'],2)
        self.assertEqual([song['id'] for song in value['songs']],[WORK])
        cp['artists']['Pending artist'].update(complete=True,offset=0,recordingsScanned=0,recordingsTotal=0)
        self.assertTrue(c.assemble(cp,roster)['source']['fullRosterComplete'])

    def test_false_completion_and_wrong_language_are_rejected(self):
        roster,cp=self.fixture();cp['artists']['Ready artist']['offset']=1
        with self.assertRaisesRegex(ValueError,'Incomplete'):c.assemble(cp,roster)
        cp['artists']['Ready artist']['offset']=2;cp['songs'][WORK]['source']['languages']=['vie']
        with self.assertRaisesRegex(ValueError,'Invalid'):c.assemble(cp,roster)

    def test_gzip_snapshot_is_deterministic_and_hash_checked(self):
        value={'public':'metadata'};data=c.encode(value)
        self.assertEqual(data,c.encode(value));self.assertEqual(c.decode(data,hashlib.sha256(data).hexdigest()),value)
        with self.assertRaisesRegex(ValueError,'checksum'):c.decode(data,'wrong')

if __name__=='__main__':unittest.main()
