import { expect,it } from 'vitest';
import { observedTransitions } from '@/ingestion/open-data/state-observations';
it('preserves first-seen and transition observation intervals without claiming actual starts or completion',()=>{
 const first=observedTransitions({},[{gameId:'1',status:'LIVE'}],'2026-11-26T12:00:00Z','a');
 expect(first.transitions[0]).toMatchObject({from:null,observedAfter:null,actualEventTimeProven:false});
 const unchanged=observedTransitions(first.current,[{gameId:'1',status:'LIVE'}],'2026-11-26T12:10:00Z','a');expect(unchanged.transitions).toEqual([]);
 const final=observedTransitions(unchanged.current,[{gameId:'1',status:'OFF'}],'2026-11-26T12:20:00Z','b');
 expect(final.transitions[0]).toMatchObject({from:'LIVE',to:'OFF',observedAfter:'2026-11-26T12:10:00Z',observedBy:'2026-11-26T12:20:00Z',actualEventTimeProven:false});
 expect(()=>observedTransitions(final.current,[{gameId:'1',status:'OFF'}],'2026-11-26T12:15:00Z','b')).toThrow(/regressed/);
});
