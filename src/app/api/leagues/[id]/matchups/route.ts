import { getAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { enforceRateLimit, RateLimitError } from "@/server/rate-limit";
import { resolveLeagueSport } from "@/server/league";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuth().api.getSession({ headers: request.headers }); if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });
  try { await enforceRateLimit(session.user.id, "matchups-api", 180, 60_000); } catch (error) { if (error instanceof RateLimitError) return Response.json({ error: error.message }, { status: 429 }); throw error; }
  const { id } = await params; if (!await getDatabase().leagueMember.findUnique({ where: { leagueId_userId: { leagueId: id, userId: session.user.id } } })) return Response.json({ error: "League unavailable." }, { status: 404 });
  const sport = await resolveLeagueSport(id, new URL(request.url).searchParams.get("sport"));
  const rows = await getDatabase().matchup.findMany({ where: { leagueId: id, sport: sport.sport }, include: { period: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } }, orderBy: [{ period: { number: "asc" } }, { id: "asc" }] });
  return Response.json(rows.map((row) => ({ ...row, homeTenths: row.homeTenths.toString(), awayTenths: row.awayTenths.toString() })), { headers: { "Cache-Control": "private, no-store" } });
}
