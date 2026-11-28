import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import { GameStatRole, SeasonCoverage, Sport } from "@/generated/prisma/enums";
import { calculateScore, sportByRole } from "@/scoring/engine";
import { ubpV9Rules } from "@/scoring/ubp-v9";
import type { SimulationInput } from "./types";

const id = z.string().trim().min(1).max(200);
const year = z.number().int().min(1900).max(2100);
const instant = z.iso.datetime({ offset: true }).transform((value) => Date.parse(value));
const positionCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,12}$/);
const role = z.enum(GameStatRole);
const facts = {
  playerId: id, code: positionCode, seasonYear: year, effectiveAt: instant, knownAt: instant,
};
const positions = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("LISTED"), ...facts }),
  z.object({ kind: z.literal("FIELDING"), ...facts, gameId: id, started: z.boolean() }),
]);

const snapshot = z.object({
  settlementModel:z.literal("ACTUAL_GAME_MEMBERSHIP").optional(),
  terminalEvidence:z.array(z.object({playerId:id,gameId:id,role,status:z.enum(["DID_NOT_PLAY","ROLE_NOT_SCORED","PLAYED_COMPLETE"]),stats:z.record(z.string(),z.number().nullable()).optional(),teEligible:z.boolean().nullable().optional(),reason:z.string().min(1),sourceReferences:z.array(z.string().min(1)).min(1)})).optional(),
  actualMembership:z.array(z.object({playerId:id,gameId:id,team:id,sourceReference:z.string().min(1)})).optional(),
  decisionModel:z.object({participation:z.literal("PRIOR_ONLY"),availabilityEvidence:z.literal("UNKNOWN"),informationModel:z.enum(["TWO_DAY","WEEKLY"]),positionModel:z.enum(["DATED_CARRY","PRIOR_ESTIMATE"])}).optional(),
  sport: z.enum(Sport),
  year,
  label: id,
  coverage: z.enum(SeasonCoverage),
  coverageReason: id,
  expectedFixtures: z.number().int().positive().optional(),
  draftAt: instant,
  fixtures: z.array(z.object({
    id, slate: id, startsAt: instant, knownAt: instant, finalKnownAt: instant.optional(), teams: z.tuple([id, id]),
  })).min(1),
  roster: z.array(z.object({
    playerId: id, team: id.nullable(), positions: z.array(positionCode), active: z.boolean(),
    effectiveAt: instant, knownAt: instant,
  })),
  availability: z.array(z.object({
    playerId: id, gameId: id, role, probability: z.number().min(0).max(1),
    usage: z.enum(["starter", "relief"]).optional(), knownAt: instant,
  })).default([]),
  outcomes: z.array(z.object({
    playerId: id, gameId: id, seasonYear: year, role, playedAt: instant, knownAt: instant,
    participation:z.enum(["PLAYED","DID_NOT_PLAY","UNKNOWN"]).optional(),
    stats: z.record(z.string(), z.number().nullable()), teEligible: z.boolean().nullable().optional(),
    started: z.boolean().optional(),
  })),
  positions: z.array(positions).default([]),
});

function unique(rows: readonly string[], label: string) {
  if (new Set(rows).size !== rows.length) throw new Error(`Duplicate ${label} in simulation snapshot.`);
}

export function parseSnapshot(contents: string): SimulationInput {
  const raw = snapshot.parse(JSON.parse(contents));
  if (raw.year >= 2026 && raw.coverage === "COMPLETE") throw new Error("V9 excludes the 2026 and later seasons from complete-season comparisons.");
  if (raw.coverage === "COMPLETE" && raw.expectedFixtures !== raw.fixtures.length) {
    throw new Error("A complete snapshot must provide the independently verified expected fixture count.");
  }
  const covidDisrupted = (raw.sport === "MLB" && raw.year === 2020) ||
    ((raw.sport === "NBA" || raw.sport === "NHL") && (raw.year === 2019 || raw.year === 2020));
  if (covidDisrupted && raw.coverage !== "QUARANTINED") throw new Error("V9 requires quarantine coverage for this disrupted season.");
  const fixtureById = new Map(raw.fixtures.map((fixture) => [fixture.id, fixture]));
  unique(raw.fixtures.map((fixture) => fixture.id), "fixture");
  unique((raw.terminalEvidence??[]).map(f=>JSON.stringify([f.playerId,f.gameId,f.role])),"terminal evidence");
  const membershipTeams=new Map<string,string>();
  for(const f of raw.actualMembership??[]){
    if(!fixtureById.get(f.gameId)?.teams.includes(f.team))throw Error("Invalid actual game/team membership namespace.");
    const key=JSON.stringify([f.playerId,f.gameId]);
    if(membershipTeams.has(key)&&membershipTeams.get(key)!==f.team)throw Error("Conflicting actual game/team membership.");
    membershipTeams.set(key,f.team);
  }
  for(const f of raw.terminalEvidence??[])if(!fixtureById.has(f.gameId)||sportByRole[f.role]!==raw.sport)throw Error("Invalid canonical terminal evidence game/role.");
  unique(raw.roster.map(({ playerId, knownAt, effectiveAt }) => JSON.stringify([playerId, knownAt, effectiveAt])), "roster fact");
  unique(raw.availability.map(({ gameId, playerId, role, knownAt }) => JSON.stringify([gameId, playerId, role, knownAt])), "availability fact");
  unique(raw.outcomes.map(({ gameId, playerId, role }) => JSON.stringify([gameId, playerId, role])), "box score");

  for (const fixture of raw.fixtures) {
    if (fixture.teams[0] === fixture.teams[1] || fixture.startsAt <= raw.draftAt || fixture.knownAt >= fixture.startsAt || (fixture.finalKnownAt!==undefined&&fixture.finalKnownAt<=fixture.startsAt)) {
      throw new Error(`Invalid pregame timing or teams for fixture ${fixture.id}.`);
    }
  }
  for (const entry of raw.availability) {
    const fixture = fixtureById.get(entry.gameId);
    if (!fixture || entry.knownAt >= fixture.startsAt || sportByRole[entry.role] !== raw.sport) {
      throw new Error(`Invalid availability fact for fixture ${entry.gameId}.`);
    }
  }
  for (const entry of raw.roster) {
    if (entry.active && !entry.team) throw new Error(`An active roster fact needs a professional team for ${entry.playerId}.`);
  }
  const outcomes = raw.outcomes.map(({ stats, teEligible, ...entry }) => {
    const fixture = fixtureById.get(entry.gameId);
    if (sportByRole[entry.role] !== raw.sport || entry.knownAt < entry.playedAt || entry.seasonYear > raw.year ||
      (entry.seasonYear === raw.year && (!fixture || entry.playedAt <= fixture.startsAt)) ||
      (entry.seasonYear < raw.year && entry.playedAt >= raw.draftAt)) {
      throw new Error(`Invalid result publication or role for fixture ${entry.gameId}.`);
    }
    const result = calculateScore(ubpV9Rules, { role: entry.role, stats, teEligible });
    return { ...entry, pointsTenths: result.totalTenths, missingStats: result.missingStats };
  });
  const eligibility = raw.positions.map(({ effectiveAt, knownAt, ...entry }) => {
    if (entry.kind === "FIELDING") {
      const fixture = fixtureById.get(entry.gameId);
      if (raw.sport !== "MLB" || knownAt < effectiveAt || entry.seasonYear > raw.year ||
        (entry.seasonYear === raw.year && (!fixture || effectiveAt <= fixture.startsAt)) ||
        (entry.seasonYear < raw.year && effectiveAt >= raw.draftAt)) {
        throw new Error(`Invalid fielding evidence for ${entry.playerId}.`);
      }
    }
    return { ...entry, effectiveAt: new Date(effectiveAt), knownAt: new Date(knownAt) };
  });

  return {
    ...raw,
    mode: "as-of",
    outcomes,
    positions: eligibility,
    source: {
      hashes: { snapshot: createHash("sha256").update(contents).digest("hex") },
      acceptedRows: outcomes.length, rejectedRows: 0, unscheduledRows: 0, assumptions: [],
    },
  };
}

export async function readSimulationSnapshot(path: string) {
  return parseSnapshot(await readFile(path, "utf8"));
}
