"""Pure columnar-to-decision snapshot bridge; never synthesizes information time."""
from datetime import datetime
import json
def compile_explicit_outcome(row,fact,frozen_gate=None,resolution=None):
 if fact is None:return None,'UNKNOWN_INFORMATION'
 if tuple(str(fact[k]) for k in ['playerId','gameId','role'])!=tuple(str(row[k]) for k in ['sourcePlayerId','sourceGameId','role']):raise ValueError('Explicit native knowledge tuple differs')
 if fact.get('participation') not in ['PLAYED','DID_NOT_PLAY'] or not fact.get('knownAt') or not fact.get('playedAt') or not fact.get('sourceReferences'):raise ValueError('Explicit participation, knowledge, ordering time and provenance required')
 known=datetime.fromisoformat(fact['knownAt'].replace('Z','+00:00'));played=datetime.fromisoformat(fact['playedAt'].replace('Z','+00:00'))
 if known.tzinfo is None or played.tzinfo is None or known<played:raise ValueError('Invalid historical information chronology')
 if fact['participation']!=row['participation']:raise ValueError('Decision knowledge cannot redefine source participation')
 stats=resolution['resolvedStats'] if resolution else json.loads(row.get('enrichedStatsJson',row['statsJson']));mask=resolution['missingStats'] if resolution else row.get('enrichedMissingMask',row['missingMask'])
 if fact['participation']=='PLAYED' and(not row['selectedRole'] or mask or frozen_gate is not None and not frozen_gate['retrospectiveScoringEligible'] and not resolution):return None,'INCOMPLETE_OR_NONSELECTED'
 return {'playerId':row['sourcePlayerId'],'gameId':row['sourceGameId'],'seasonYear':row['seasonStartYear'],'role':row['role'],'participation':fact['participation'],'playedAt':fact['playedAt'],'knownAt':fact['knownAt'],'stats':stats,'teEligible':('TE' in row['positions']) if row['sport']=='NFL' else False},None
