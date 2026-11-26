import {expect,it} from "vitest";
import {canonicalId,canonicalValue,archiveKey} from "@/ingestion/recovered-archives";
it("normalizes typed source values without conflating unknown and zero or losing NFL identifiers",()=>{
 expect(canonicalValue("True","starter",false,true)).toBe(true);
 expect(canonicalValue("False","starter",false,true)).toBe(false);
 expect(canonicalValue("","starter",false,true)).toBe(null);
 expect(canonicalValue("0","saves",true)).toBe(0);
 expect(canonicalValue("","saves",true)).toBe(null);
 expect(canonicalId("0021600001")).toBe("21600001");
 expect(canonicalId("00-0033873")).toBe("00-0033873");
 expect(archiveKey({season:"2026-27",game_id:"002",player_id:"003",team:"TOR",category:"goalies"},"NHL")).toContain("2026:");
});
