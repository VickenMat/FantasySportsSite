import sys,unittest,datetime
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from m62_terminal import nba_terminal_rows,mlb_complete,completion_utc
class TerminalEvidence(unittest.TestCase):
 def nba(self,**changes):
  return dict(type_text='End Game',wallclock='2024-02-09T02:46:27Z',clock_display_value='0:00',period_number=4,home_score=95,away_score=118,**changes)
 def test_final_clock_requires_matching_final_score(self):
  r=self.nba();self.assertEqual(nba_terminal_rows([r],dict(home_score=95,away_score=118)),[r]);r['home_score']=91;self.assertEqual(nba_terminal_rows([r],dict(home_score=95,away_score=118)),[])
 def test_no_clock_is_not_scheduled_start(self):
  r=self.nba();r['wallclock']=None;self.assertEqual(nba_terminal_rows([r],r),[])
 def test_tied_period_is_not_final(self):
  r=self.nba();r.update(type_text='End Period',home_score=118);self.assertEqual(nba_terminal_rows([r],r),[])
 def test_shortened_or_suspended_mlb_requires_separate_evidence(self):
  r=dict(at_bat_index='0',inning='8',outs='3',home_score='4',away_score='2',half_inning='top',batter_id='1',pitcher_id='2');g=dict(home_score=4,away_score=2);self.assertFalse(mlb_complete([r],g));r['inning']='9';self.assertTrue(mlb_complete([r],g));r['at_bat_index']='1';self.assertFalse(mlb_complete([r],g))
 def test_resume_uses_explicit_last_pa_time(self):
  scheduled=datetime.datetime(2023,6,1,22,tzinfo=datetime.timezone.utc)
  self.assertEqual(completion_utc('2023-06-03T22:05:00-04:00',scheduled).date().isoformat(),'2023-06-04')
  self.assertIsNone(completion_utc(None,scheduled))
  self.assertIsNone(completion_utc('2023-06-03T22:05:00',scheduled))
  self.assertIsNone(completion_utc('2023-05-30T22:05:00Z',scheduled))
