import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { createLeague } from "@/server/league";
import { generateSchedule } from "@/server/matchups";
import { createDraft } from "@/server/draft";
import { processDueWaivers } from "@/server/waivers";

const schema = z.object({
  baseUrl: z.string().url().default("http://127.0.0.1:3000"),
  levels: z.string().regex(/^\d+(?:,\d+)*$/).default("100,500,1000").transform((value) => value.split(",").map(Number)),
  output: z.string().min(1).default("reports/load-m3-6.json"),
  timeoutMs: z.number().int().min(1_000).max(120_000).default(30_000),
});

type Sample = { status: number; milliseconds: number; error?: string };
function percentile(values: number[], ratio: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))].toFixed(2));
}

function summarize(name: string, samples: Sample[], elapsed: number, peakConnections: number) {
  const timings = samples.map(({ milliseconds }) => milliseconds);
  const errors = samples.filter(({ status }) => status < 200 || status >= 400).length;
  return {
    name, requests: samples.length, elapsedMs: Number(elapsed.toFixed(2)), throughputPerSecond: Number((samples.length * 1000 / elapsed).toFixed(2)),
    errorCount: errors, errorRatePercent: Number((errors * 100 / Math.max(1, samples.length)).toFixed(2)),
    latencyMs: { p50: percentile(timings, .5), p95: percentile(timings, .95), p99: percentile(timings, .99), max: timings.length ? Number(Math.max(...timings).toFixed(2)) : null },
    statuses: Object.fromEntries([...new Set(samples.map(({ status }) => status))].sort().map((status) => [status, samples.filter((sample) => sample.status === status).length])),
    peakPostgresConnections: peakConnections,
  };
}

async function connectionCount() {
  const [row] = await getDatabase().$queryRawUnsafe<{ count: bigint }[]>("SELECT count(*)::bigint AS count FROM pg_stat_activity WHERE datname = current_database() AND backend_type = 'client backend'");
  return Number(row.count);
}

async function runScenario(name: string, requests: (() => Promise<Response>)[]) {
  let sampling = true; let peakConnections = await connectionCount();
  const sampler = (async () => { while (sampling) { peakConnections = Math.max(peakConnections, await connectionCount()); await new Promise((done) => setTimeout(done, 25)); } })();
  const started = performance.now();
  const samples = await Promise.all(requests.map(async (request): Promise<Sample> => {
    const at = performance.now();
    try { const response = await request(); await response.arrayBuffer(); return { status: response.status, milliseconds: performance.now() - at }; }
    catch (error) { return { status: 0, milliseconds: performance.now() - at, error: error instanceof Error ? error.message : "request failed" }; }
  }));
  const elapsed = performance.now() - started; sampling = false; await sampler;
  return summarize(name, samples, elapsed, peakConnections);
}

async function main() {
  const { values } = parseArgs({ options: { "base-url": { type: "string" }, levels: { type: "string" }, output: { type: "string" }, "timeout-ms": { type: "string" } } });
  const config = schema.parse({ baseUrl: values["base-url"], levels: values.levels, output: values.output, timeoutMs: values["timeout-ms"] ? Number(values["timeout-ms"]) : undefined });
  const maximum = Math.max(...config.levels); if (maximum > 1_000) throw new Error("This harness is capped at 1,000 isolated users per run.");
  const database = getDatabase(); const runId = randomUUID(); const password = `Load-${randomUUID()}!`; const passwordHash = await hashPassword(password);
  const users = Array.from({ length: maximum }, (_, index) => ({ id: randomUUID(), name: `Load User ${index + 1}`, email: `load-${runId}-${index + 1}@example.test` }));
  let leagueId: string | null = null;
  let mutationLeagueId: string | null = null;
  const mutationPlayerIds = Array.from({ length: 20 }, () => randomUUID());
  try {
    await database.user.createMany({ data: users });
    await database.account.createMany({ data: users.map((user) => ({ id: randomUUID(), accountId: user.id, providerId: "credential", userId: user.id, password: passwordHash })) });
    const league = await createLeague(users[0].id, { name: `Load ${runId}`, sport: "NFL", seasonYear: 2025, maxTeams: 4, format: "REDRAFT", startingFaab: 100, benchSlots: 5, historical: false, fillWithComputers: true });
    leagueId = league.id;
    await database.leagueMember.createMany({ data: users.slice(1).map((user) => ({ leagueId: league.id, userId: user.id })) });
    await generateSchedule(users[0].id, league.id, 3);
    const warmupRequests = Number(process.env.DATABASE_POOL_MAX ?? 10);
    await Promise.all(Array.from({ length: warmupRequests }, () => fetch(`${config.baseUrl}/health`, { signal: AbortSignal.timeout(config.timeoutMs) })));
    const controller = () => AbortSignal.timeout(config.timeoutMs);
    const results = [];
    let lastCookies = new Map<string, string>();
    for (const level of config.levels) {
      const selected = users.slice(0, level);
      const cookies = new Map<string, string>();
      const auth = await runScenario(`authentication-${level}`, selected.map((user, index) => async () => {
        const response = await fetch(`${config.baseUrl}/api/auth/sign-in/email`, {
          method: "POST", headers: { "content-type": "application/json", origin: config.baseUrl, "x-forwarded-for": `198.51.${Math.floor(index / 250)}.${index % 250 + 1}` },
          body: JSON.stringify({ email: user.email, password, rememberMe: true }), signal: controller(),
        });
        const cookie = response.headers.get("set-cookie")?.split(";")[0]; if (cookie) cookies.set(user.id, cookie);
        return response;
      }));
      results.push(auth);
      lastCookies = cookies;
      const get = (path: string, user: typeof users[number]) => () => fetch(`${config.baseUrl}${path}`, { headers: { cookie: cookies.get(user.id) ?? "" }, redirect: "manual", signal: controller() });
      results.push(await runScenario(`dashboard-${level}`, selected.map((user) => get("/dashboard", user))));
      results.push(await runScenario(`player-search-${level}`, selected.map((user) => get(`/api/leagues/${league.id}/players?sport=NFL&q=a&page=1`, user))));
      results.push(await runScenario(`matchups-${level}`, selected.map((user) => get(`/api/leagues/${league.id}/matchups?sport=NFL`, user))));
      results.push(await runScenario(`standings-${level}`, selected.map((user) => get(`/api/leagues/${league.id}/standings?sport=NFL`, user))));
    }
    await database.player.createMany({ data: mutationPlayerIds.map((id, index) => ({ id, sport: "NFL", displayName: `Load Mutation Player ${index + 1}` })) });
    const mutationLeague = await createLeague(users[0].id, { name: `Load Mutation ${runId}`, sport: "NFL", seasonYear: 2025, maxTeams: 16, format: "REDRAFT", startingFaab: 100, benchSlots: 5, historical: false, fillWithComputers: true });
    mutationLeagueId = mutationLeague.id;
    const bots = await database.fantasyTeam.findMany({ where: { leagueId: mutationLeague.id, isComputer: true }, orderBy: { draftSlot: "asc" } });
    for (let index = 1; index < 16; index++) {
      const membership = await database.leagueMember.create({ data: { leagueId: mutationLeague.id, userId: users[index].id } });
      await database.fantasyTeam.update({ where: { id: bots[index - 1].id }, data: { managerId: users[index].id, membershipId: membership.id, isComputer: false } });
    }
    const draft = await createDraft(users[0].id, mutationLeague.id);
    const mutationPlayers = await database.player.findMany({ where: { id: { in: mutationPlayerIds } }, orderBy: { displayName: "asc" } });
    if (mutationPlayers.length < 3) throw new Error("Mutation load fixture has too few players.");
    const post = (user: typeof users[number], body: unknown) => () => fetch(`${config.baseUrl}/api/leagues/${mutationLeague.id}/gameplay`, {
      method: "POST", headers: { cookie: lastCookies.get(user.id) ?? "", "content-type": "application/json", origin: config.baseUrl }, body: JSON.stringify(body), signal: AbortSignal.timeout(config.timeoutMs),
    });
    const managers = users.slice(0, 16);
    results.push(await runScenario("concurrent-draft-conflict-16", managers.map((user) => post(user, { action: "draft", draftId: draft.id, playerId: mutationPlayers[0].id }))));
    results.push(await runScenario("concurrent-roster-acquisition-16", managers.map((user) => post(user, { action: "add", playerId: mutationPlayers[1].id }))));
    results.push(await runScenario("concurrent-waiver-submission-16", managers.map((user, index) => post(user, { action: "waiver", addPlayerId: mutationPlayers[2].id, bid: index + 1 }))));
    const waiverStarted = performance.now(); const processedClaims = await processDueWaivers(mutationLeague.id, new Date(Date.now() + 1000));
    results.push(summarize("waiver-processing-16", [{ status: processedClaims === 16 ? 200 : 500, milliseconds: performance.now() - waiverStarted }], performance.now() - waiverStarted, await connectionCount()));
    const output = resolve(config.output); await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify({
      reportVersion: "m3-6-load-1", generatedAt: new Date().toISOString(), environment: { baseUrl: config.baseUrl, node: process.version, databasePoolMax: Number(process.env.DATABASE_POOL_MAX ?? 10), warmupRequests },
      levels: config.levels, results,
      scope: {
        measured: ["authentication", "dashboard", "player search", "matchup retrieval", "standings retrieval"],
        mutationConcurrency: "Draft conflicts, roster ownership conflicts, waiver submissions, and waiver processing are measured with 16 managers, the maximum supported league size. This run does not represent 1,000 managers in one league.",
      },
    }, null, 2)}\n`);
    console.info(JSON.stringify({ output, scenarios: results.length, maximumUsers: maximum }));
  } finally {
    if (leagueId) await database.league.deleteMany({ where: { id: leagueId } });
    if (mutationLeagueId) await database.league.deleteMany({ where: { id: mutationLeagueId } });
    await database.player.deleteMany({ where: { id: { in: mutationPlayerIds } } });
    await database.user.deleteMany({ where: { id: { in: users.map(({ id }) => id) } } });
    await database.$disconnect();
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Load test failed."); process.exitCode = 1; });
