import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from m6_nhl_event_counts import event_facts
class NativeEventCounts(unittest.TestCase):
 def event(self,typ='GOAL',**kw):return {'event_type':typ,'period_type':'REGULAR','event_player_1_id':1,'event_player_1_type':'Scorer' if typ=='GOAL' else 'Shooter','event_player_2_id':2,'event_player_2_type':'Assist' if typ=='GOAL' else 'Goalie','event_player_3_id':3 if typ=='GOAL' else None,'event_player_3_type':'Assist' if typ=='GOAL' else None,'event_goalie_id':2,**kw}
 def test_goal_also_counts_as_sog_and_assists_are_actor_bound(self):self.assertEqual(event_facts(self.event()),[('1','sog'),('1','goals'),('2','assists'),('3','assists')])
 def test_shot_saves_and_sog_conserve(self):self.assertEqual(event_facts(self.event('SHOT')),[('1','sog'),('2','saves')])
 def test_shootout_excluded(self):self.assertEqual(event_facts(self.event(period_type='SHOOTOUT')),[])
 def test_unknown_goalie_cannot_be_known_zero(self):
  with self.assertRaises(ValueError):event_facts(self.event('SHOT',event_goalie_id=None))
 def test_self_assist_rejected(self):
  with self.assertRaises(ValueError):event_facts(self.event(event_player_2_id=1))
if __name__=='__main__':unittest.main()
