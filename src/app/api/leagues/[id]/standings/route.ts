import { getAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { getH2HChampionshipStandings } from "@/server/championships";
import { getCumulativeStandings } from "@/server/competition-scoring";
import { resolveLeagueSport } from "@/server/league";
import { enforceRateLimit, RateLimitError } from "@/server/rate-limit";
import { standings } from "@/server/matchups";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuth().api.getSession({ headers: request.headers }); if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });
  try { await enforceRateLimit(session.user.id, "standings-api", 180, 60_000); } catch (error) { if (error instanceof RateLimitError) return Response.json({ error: error.message }, { status: 429 }); throw error; }
  const { id } = await params;
  const membership = await getDatabase().leagueMember.findUnique({
    where: { leagueId_userId: { leagueId: id, userId: session.user.id } },
    select: { league: { select: { competitionType: true } } },
  });
  if (!membership) return Response.json({ error: "League unavailable." }, { status: 404 });
  const sport = new URL(request.url).searchParams.get("sport") ?? undefined;
  const headers = { "Cache-Control": "private, no-store" };
  if (membership.league.competitionType === "CUMULATIVE") {
    const selected = sport === "combined" ? undefined : (await resolveLeagueSport(id, sport)).sport;
    const result = await getCumulativeStandings(id, { sport: selected });
    return Response.json(result.rows.map((row) => ({
      ...row, pointsFor: row.pointsFor.toString(), pointsAgainst: "0", wins: 0, losses: 0, ties: 0,
      state: result.state,
    })), { headers });
  }
  if (sport === "combined") {
    const result = await getH2HChampionshipStandings(id);
    return Response.json(result?.championshipResults.map((row) => ({
      ...row, combinedUbpTenths: row.combinedUbpTenths.toString(),
    })) ?? [], { headers });
  }
  return Response.json((await standings(id, sport)).map((row) => ({ ...row, pointsFor: row.pointsFor.toString(), pointsAgainst: row.pointsAgainst.toString() })), { headers });
}
