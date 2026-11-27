"""Native event actors only; one goal contributes both a goal and a SOG."""
def event_facts(event):
 if event['period_type']=='SHOOTOUT':return []
 typ=event['event_type'];actors=[(str(event[f'event_player_{n}_id']),event[f'event_player_{n}_type']) for n in [1,2,3] if event[f'event_player_{n}_id'] is not None];facts=[]
 if typ in ['SHOT','GOAL']:
  role='Scorer' if typ=='GOAL' else 'Shooter';scorers=[p for p,r in actors if r==role]
  if len(scorers)!=1:raise ValueError('MISSING_OR_AMBIGUOUS_SHOT_ACTOR')
  facts.append((scorers[0],'sog'))
 if typ=='GOAL':
  facts.append((scorers[0],'goals'));assists=[p for p,r in actors if r=='Assist']
  if len(assists)!=len(set(assists)) or scorers[0] in assists:raise ValueError('DUPLICATE_OR_SELF_ASSIST')
  facts.extend((p,'assists') for p in assists)
 if typ=='SHOT':
  goalie=event['event_goalie_id']
  if goalie is None:raise ValueError('MISSING_SAVED_SHOT_GOALIE')
  if any(p!=str(goalie) for p,r in actors if r=='Goalie'):raise ValueError('SAVED_SHOT_GOALIE_CONFLICT')
  facts.append((str(goalie),'saves'))
 if typ in ['HIT','BLOCKED_SHOT']:
  role,field=('Hitter','hits') if typ=='HIT' else ('Blocker','blockedShots');ids=[p for p,r in actors if r==role]
  if len(ids)!=1:raise ValueError('MISSING_OR_AMBIGUOUS_'+role.upper())
  facts.append((ids[0],field))
 return facts
