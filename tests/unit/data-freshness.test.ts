import{expect,it}from"vitest";
import{measuredDelay}from"@/server/professional-data-freshness";
it("keeps unknown timestamps and clock skew distinct from measured zero delay",()=>{
 const at=new Date("2026-11-25T12:00:00Z");
 expect(measuredDelay(at,null)).toBeNull();expect(measuredDelay(null,at)).toBeNull();
 expect(measuredDelay(new Date(+at-1),at)).toBeNull();expect(measuredDelay(at,at)).toBe(0);
 expect(measuredDelay(new Date(+at+15000),at)).toBe(15000);
});
