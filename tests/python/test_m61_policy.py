import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from m6_policy import knowledge_boundary, bench_allocation, position_facts
class ApprovedMethod(unittest.TestCase):
 def test_two_day_and_midnight(self):
  self.assertEqual(knowledge_boundary('2023-01-01'),'2023-01-03T00:00:00Z')
  self.assertEqual(knowledge_boundary('2023-01-01',completion='2023-01-02T00:05:00Z'),'2023-01-04T00:00:00Z')
 def test_weekly_is_distinct_and_after_safe_boundary(self):
  self.assertEqual(knowledge_boundary('2023-01-01',model='WEEKLY'),'2023-01-04T12:00:00Z')
 def test_suspension_and_unknown_day(self):
  self.assertIsNone(knowledge_boundary('2023-01-01',exceptional=True))
  self.assertIsNone(knowledge_boundary(None))
  self.assertEqual(knowledge_boundary('2023-01-01',exceptional=True,resumed_completion_day='2023-02-01'),'2023-02-03T00:00:00Z')
 def test_rotation(self):
  for first in [11,31,51]:
   for sport in ['NFL','MLB','NBA','NHL']:self.assertEqual(sum(bench_allocation(s)[sport]==2 for s in range(first,first+20)),5)
  with self.assertRaises(ValueError):bench_allocation(10)
 def test_nba_estimates_isolated(self):
  row={'sport':'NBA','positionClass':'HISTORICAL_ESTIMATED','positions':['PG','SG']}
  self.assertEqual(position_facts(row),[])
  self.assertEqual(position_facts(row,'PRIOR_ESTIMATE',prior=True),['PG','SG'])
  self.assertEqual(position_facts(row,'PRIOR_ESTIMATE',prior=False),[])
 def test_current_mlb_season_end_is_not_earlier_eligibility(self):
  import json
  row={'sport':'MLB','positionProvenanceJson':json.dumps({'currentSeason':{'status':'RECORDED_THRESHOLD_SUPPORTED','positions':['SP']},'priorSeasonCarry':None})}
  self.assertEqual(position_facts(row),[])
  self.assertEqual(position_facts(row,prior=True),['SP'])

 def test_undated_target_nba_family_is_not_backdated(self):
  self.assertEqual(position_facts({'sport':'NBA','positionClass':'FAMILY_DERIVED','positions':['PG','SG'],'positionProvenanceJson':'{"knownAt":null,"effectiveAt":null}'}),[])
 def test_later_explicit_completion_never_precedes_information(self):
  self.assertEqual(knowledge_boundary('2023-01-01',completion='2023-01-07T23:59:00Z'),'2023-01-09T00:00:00Z')
 def test_invalid_information_model_is_rejected(self):
  with self.assertRaises(ValueError):knowledge_boundary('2023-01-01',model='EARLY')

 def test_weekly_knowledge_does_not_collapse_effective_observation_order(self):
  from m6_policy import retime_fact
  a={'playerId':'p','knownAt':'2023-01-02T00:00:00Z','effectiveAt':'2023-01-02T00:00:00Z'}
  b={'playerId':'p','knownAt':'2023-01-03T00:00:00Z','effectiveAt':'2023-01-03T00:00:00Z'}
  x,y=retime_fact(a,'WEEKLY'),retime_fact(b,'WEEKLY')
  self.assertEqual(x['knownAt'],y['knownAt'])
  self.assertNotEqual(x['effectiveAt'],y['effectiveAt'])
  self.assertEqual(a['knownAt'],'2023-01-02T00:00:00Z')
