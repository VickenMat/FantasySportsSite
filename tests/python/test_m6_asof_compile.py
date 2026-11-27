import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from m6_asof_compile import compile_explicit_outcome
class ExplicitKnowledgeBridge(unittest.TestCase):
 def row(self,**kw):return {'sport':'NFL','sourcePlayerId':'synthetic-player','sourceGameId':'synthetic-game','seasonStartYear':2021,'role':'FOOTBALL','participation':'PLAYED','selectedRole':True,'statsJson':'{"receptions":1}','missingMask':[],'positions':['TE'],**kw}
 def fact(self,**kw):return {'playerId':'synthetic-player','gameId':'synthetic-game','role':'FOOTBALL','participation':'PLAYED','playedAt':'2021-01-01T12:00:00Z','knownAt':'2021-01-03T00:00:00Z','sourceReferences':['Explicit synthetic knowledge fixture'],**kw}
 def test_positive_explicit_native_bridge(self):
  row,reason=compile_explicit_outcome(self.row(),self.fact());self.assertIsNone(reason);self.assertTrue(row['teEligible']);self.assertEqual(row['knownAt'],'2021-01-03T00:00:00Z')
 def test_missing_time_is_never_synthesized(self):
  self.assertEqual(compile_explicit_outcome(self.row(),None),(None,'UNKNOWN_INFORMATION'))
  with self.assertRaises(ValueError):compile_explicit_outcome(self.row(),self.fact(knownAt=None))
 def test_bad_identity_or_future_information_rejected(self):
  with self.assertRaises(ValueError):compile_explicit_outcome(self.row(),self.fact(playerId='other'))
  with self.assertRaises(ValueError):compile_explicit_outcome(self.row(),self.fact(knownAt='2020-12-31T00:00:00Z'))
 def test_missing_scoring_and_conflict_gates_remain_closed(self):
  self.assertEqual(compile_explicit_outcome(self.row(missingMask=['receptions']),self.fact()),(None,'INCOMPLETE_OR_NONSELECTED'))
  self.assertEqual(compile_explicit_outcome(self.row(),self.fact(),{'retrospectiveScoringEligible':False}),(None,'INCOMPLETE_OR_NONSELECTED'))
 def test_explicit_dnp_preserves_unknown_fields(self):
  row,reason=compile_explicit_outcome(self.row(participation='DID_NOT_PLAY',selectedRole=False,statsJson='{"receptions":null}',missingMask=['receptions']),self.fact(participation='DID_NOT_PLAY'));self.assertIsNone(reason);self.assertIsNone(row['stats']['receptions']);self.assertEqual(row['participation'],'DID_NOT_PLAY')
if __name__=='__main__':unittest.main()
