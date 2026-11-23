import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ubpV9, ubpV9Rules } from "@/scoring/ubp-v9";

const spec = readFileSync(
  new URL("../../fantasy_evolution_codex_v9_website_md/08_V9_SCORING_PRESET.md", import.meta.url),
  "utf8",
);

describe("experimental UBP V9 preset", () => {
  it("matches every specified action in integer tenths", () => {
    const expected = new Map<string, number>();
    let sport = "";
    for (const line of spec.split("\n")) {
      const heading = line.match(/^## (NFL|MLB|NBA|NHL)$/);
      if (heading) sport = heading[1];
      const row = line.match(/^\| `(\w+)` \| ([+-]\d+\.\d) \|$/);
      if (row && sport) expected.set(`${sport}:${row[1]}`, Math.round(Number(row[2]) * 10));
    }
    const entries = ubpV9Rules.map(({ sport, statKey, coefficientTenths }) => [
      `${sport}:${statKey}`, coefficientTenths,
    ] as const);

    expect(expected.size).toBe(56);
    expect(entries).toHaveLength(expected.size);
    expect(new Map(entries)).toEqual(expected);
    expect(expected.has("NFL:passing_first_downs")).toBe(false);
    expect(ubpV9.experimental).toBe(true);
  });
});
