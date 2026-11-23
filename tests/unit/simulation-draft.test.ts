import { expect, it } from "vitest";
import { configSchema, defaultSlots, fitsSlot, slotRule } from "@/simulation/config";
import { runDraft } from "@/simulation/draft";
import { assignLineup } from "@/simulation/matching";

it("uses the requested nine-starter formats and keeps flex eligibility sport-specific", () => {
  for (const sport of ["NFL", "NBA", "MLB", "NHL"] as const) {
    const config = configSchema.parse({ sport });
    expect(config.slots).toEqual(defaultSlots[sport]);
    expect(config.teams).toBe(12);
    expect(config.slots).toHaveLength(9);
  }
  expect(defaultSlots.NFL.filter((slot) => slot === "QB")).toHaveLength(1);
  expect(fitsSlot("NFL", "FLEX", new Set(["QB"]))).toBe(false);
  expect(fitsSlot("NFL", "FLEX", new Set(["FB"]))).toBe(false);
  expect(fitsSlot("NFL", "SUPERFLEX", new Set(["QB"]))).toBe(true);
  expect(fitsSlot("MLB", "UTIL", new Set(["SP"]))).toBe(false);
  expect(fitsSlot("NHL", "UTIL", new Set(["G"]))).toBe(false);
  expect(() => configSchema.parse({ sport: "MLB", slots: ["QB"] })).toThrow();
  expect(() => configSchema.parse({ sport: "NFL", teams: 17 })).toThrow();
});

it.each([4, 8, 12, 16])("supports %s teams with configurable starters and a legal snake draft", (teams) => {
  const slots = [...defaultSlots.MLB, "RP", "SP", "DH"];
  const config = configSchema.parse({ sport: "MLB", teams, slots, bench: 2, seed: 58 });
  const candidates = slots.flatMap((slot, index) => {
    const position = slotRule("MLB", slot).positions[0];
    return Array.from({ length: teams + 3 }, (_, player) => ({
      id: `${index}:${player}`, value: 500 - player, legal: slots.flatMap((seat, i) =>
        fitsSlot("MLB", seat, new Set([position])) ? [i] : []),
    }));
  });
  const result = runDraft(candidates, config);
  expect(result.unfilledStarterSeats).toBe(0);
  expect(result.picks).toHaveLength(teams * (slots.length + 2));
  expect(new Set(result.picks.map(({ playerId }) => playerId)).size).toBe(result.picks.length);
  expect(result.picks.filter(({ round }) => round === 2).map(({ team }) => team)).toEqual(
    Array.from({ length: teams }, (_, index) => teams - index - 1),
  );
  for (const pick of result.picks) {
    if (pick.seat != null) expect(candidates.find(({ id }) => id === pick.playerId)?.legal).toContain(pick.seat);
  }
  expect(runDraft([...candidates].reverse(), config)).toEqual(result);
});

it("preserves scarce starters when flex players outrank dedicated players", () => {
  const config = configSchema.parse({ sport: "NFL", teams: 4, slots: ["QB", "SUPERFLEX"], bench: 0 });
  const candidates = [
    ...Array.from({ length: 4 }, (_, index) => ({ id: `flex-${index}`, legal: [0, 1], value: 1000 - index })),
    ...Array.from({ length: 4 }, (_, index) => ({ id: `wide-${index}`, legal: [1], value: 100 - index })),
  ];
  const result = runDraft(candidates, config);
  expect(result.unfilledStarterSeats).toBe(0);
  expect(result.picks.filter(({ seat }) => seat === 0).every(({ playerId }) => playerId.startsWith("flex"))).toBe(true);
  const tied = candidates.map((candidate) => ({ ...candidate, value: 0 }));
  expect(runDraft(tied, { ...config, seed: 13 })).not.toEqual(runDraft(tied, { ...config, seed: 14 }));
});

it("optimizes legal projected value without starting the same flexible player twice", () => {
  const result = assignLineup([
    [{ playerId: "flex", projection: 10, selection: "G" }, { playerId: "guard", projection: 8, selection: "G" }],
    [{ playerId: "flex", projection: 10, selection: "UTIL" }, { playerId: "bench", projection: 1, selection: "UTIL" }],
    [],
  ]);
  expect(result.map((pick) => pick?.playerId)).toEqual(["guard", "flex", undefined]);
});
