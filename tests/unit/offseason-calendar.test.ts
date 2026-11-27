import {it,expect} from 'vitest';
import {calendarIsOffseason} from '@/server/sport-offseason';
const dates={status:'VERIFIED_DATES',exact:null,verifiedDateScope:{regularSeasonStartsOn:'2027-03-24',sourceZone:'America/New_York'}};
it('uses an accepted opening date conservatively before opening day without manufacturing timestamps',()=>{
 expect(calendarIsOffseason(dates,new Date('2027-03-23T23:00:00-04:00'))).toBe(true);
 expect(calendarIsOffseason(dates,new Date('2027-03-24T00:01:00-04:00'))).toBe(false);
 expect(calendarIsOffseason(dates,new Date('2027-10-30T00:00:00Z'))).toBe(false);
});
it('does not treat a passed regular-season end as proven postseason completion',()=>{
 const exact={status:'AVAILABLE',verifiedDateScope:null,exact:{regularSeasonStartsAt:new Date('2027-03-24T18:00:00Z'),postseasonEndsAt:null}};
 expect(calendarIsOffseason(exact,new Date('2027-10-30T00:00:00Z'))).toBe(false);
 expect(calendarIsOffseason({...exact,exact:{...exact.exact,postseasonEndsAt:new Date('2027-11-02T22:00:00Z')}},new Date('2027-11-02T22:00:00Z'))).toBe(true);
});
it('fails closed for conflicting or missing boundaries and respects the conservative unknown-zone date exclusion',()=>{
 expect(calendarIsOffseason({...dates,status:'CONFLICT'},new Date('2027-03-01T00:00:00Z'))).toBe(false);
 expect(calendarIsOffseason({status:'PENDING_DATA',exact:null,verifiedDateScope:null},new Date('2027-03-01T00:00:00Z'))).toBe(false);
 expect(calendarIsOffseason({...dates,verifiedDateScope:{...dates.verifiedDateScope,sourceZone:null}},new Date('2027-03-23T11:00:00Z'))).toBe(false);
});
