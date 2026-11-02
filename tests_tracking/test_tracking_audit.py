import importlib.util,json,gzip,hashlib,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('tracking_audit',Path(__file__).resolve().parents[1]/'maintenance_nba/tracking_audit.py');audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
class AuditTests(unittest.TestCase):
 def row(self,**patch):return dict({'player_id':1628369,'game_id':'0022600001','game_date':'2026-10-25','season_type':'Regular Season','ast':11,'potential_ast':51,'reb':8,'rebound_chances':14},**patch)
 def test_preserves_unusual_value_and_labels_review(self):
  r=audit.review([self.row()],1628369,'2026-11-01');self.assertEqual(r['games'][0]['potential_ast'],51);self.assertIn('UNUSUAL_POTENTIAL_REVIEW_SOURCE',r['games'][0]['flags'])
 def test_old_year_is_reported_but_not_in_l20(self):
  r=audit.review([self.row(game_date='2025-04-01')],1628369,'2026-11-01');self.assertEqual(r['games'],[]);self.assertEqual(len(r['flaggedGames']),1)
 def test_missing_is_distinct_from_confirmed_zero(self):
  self.assertIsNone(audit.numeric(None));self.assertIsNone(audit.numeric(False));self.assertIsNone(audit.numeric(''));self.assertEqual(audit.numeric(0),0)
 def test_actual_cannot_exceed_opportunity_silently(self):
  r=audit.review([self.row(potential_ast=7)],1628369,'2026-11-01');self.assertIn('POTENTIAL_BELOW_AST',r['games'][0]['flags'])
 def test_future_and_other_player_do_not_enter(self):
  r=audit.review([self.row(game_date='2026-11-01'),self.row(player_id=2)],1628369,'2026-11-01');self.assertEqual(r['games'],[]);self.assertEqual(r['issues'][0]['code'],'PLAYER_MISMATCH')
 def test_hash_checked_and_only_local_report_read(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp);folder=p/'maintenance-state/archive';folder.mkdir(parents=True);data=gzip.compress(json.dumps([self.row()]).encode());(folder/'part.gz').write_bytes(data);meta={'id':'a'*64,'parts':{'facts/1628369':{'path':'part.gz','sha256':hashlib.sha256(data).hexdigest(),'rows':1}}};(folder/'manifest.json').write_text(json.dumps(meta));self.assertEqual(audit.inspect_archive(p,1628369,'2026-11-01')['games'][0]['ast'],11);(folder/'part.gz').write_bytes(b'bad');self.assertRaises(ValueError,audit.inspect_archive,p,1628369,'2026-11-01')
if __name__=='__main__':unittest.main()
