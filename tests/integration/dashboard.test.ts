import "dotenv/config";
import { randomUUID } from "node:crypto";
import { verifyPassword } from "better-auth/crypto";
import { afterAll, expect, it } from "vitest";
import { getDatabase } from "@/lib/db";
import { ubpV9, ubpV9Rules } from "@/scoring/ubp-v9";
import { getMemberLeague, listDemoPlayers, listMemberLeagues } from "@/server/dashboard";

const database = getDatabase();

afterAll(() => database.$disconnect());

it("stores the four-sport demo, every decimal coefficient and the sample player pool", async () => {
  const league = await database.league.findUniqueOrThrow({
    where: { slug: "founders-dynasty" },
    include: { sports: true, preset: { include: { rules: true } } },
  });
  expect(league).toMatchObject({ isDemo: true, format: "DYNASTY", maxTeams: 12 });
  expect(league.sports.map(({ sport }) => sport).sort()).toEqual(["MLB", "NBA", "NFL", "NHL"]);
  expect(league.preset).toMatchObject(ubpV9);
  const expected = ubpV9Rules.map(({ sport, statKey, applicability, coefficientTenths }) =>
    `${sport}:${statKey}:${applicability}:${(coefficientTenths / 10).toFixed(1)}`,
  );
  const actual = league.preset.rules.map(({ sport, statKey, applicability, coefficient }) =>
    `${sport}:${statKey}:${applicability}:${coefficient.toFixed(1)}`,
  );
  expect(actual.sort()).toEqual(expected.sort());

  const players = await listDemoPlayers();
  expect(players).toHaveLength(8);
  expect(new Set(players.map(({ sport }) => sport))).toEqual(new Set(["MLB", "NBA", "NFL", "NHL"]));
});

it("returns leagues only to members and stores a hashed demo password", async () => {
  const { DEMO_EMAIL, DEMO_PASSWORD } = process.env;
  if (!DEMO_EMAIL || !DEMO_PASSWORD) throw new Error("Seed an account with DEMO_EMAIL and DEMO_PASSWORD.");
  const account = await database.account.findFirstOrThrow({
    where: { providerId: "credential", user: { email: DEMO_EMAIL } },
  });
  const membership = await database.leagueMember.findFirstOrThrow({ where: { userId: account.userId } });
  expect(account.password).not.toBe(DEMO_PASSWORD);
  expect(await verifyPassword({ hash: account.password ?? "", password: DEMO_PASSWORD })).toBe(true);
  expect((await listMemberLeagues(account.userId)).some(({ league }) => league.slug === "founders-dynasty")).toBe(true);
  expect(await getMemberLeague(account.userId, membership.leagueId)).toMatchObject({ role: "COMMISSIONER" });

  const outsider = randomUUID();
  expect(await listMemberLeagues(outsider)).toEqual([]);
  expect(await getMemberLeague(outsider, membership.leagueId)).toBeNull();
  expect(await getMemberLeague(account.userId, "malformed")).toBeNull();
});
