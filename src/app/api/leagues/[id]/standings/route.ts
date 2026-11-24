import { getAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { enforceRateLimit, RateLimitError } from "@/server/rate-limit";
import { standings } from "@/server/matchups";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuth().api.getSession({ headers: request.headers }); if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });
  try { await enforceRateLimit(session.user.id, "standings-api", 180, 60_000); } catch (error) { if (error instanceof RateLimitError) return Response.json({ error: error.message }, { status: 429 }); throw error; }
  const { id } = await params; if (!await getDatabase().leagueMember.findUnique({ where: { leagueId_userId: { leagueId: id, userId: session.user.id } } })) return Response.json({ error: "League unavailable." }, { status: 404 });
  return Response.json((await standings(id)).map((row) => ({ ...row, pointsFor: row.pointsFor.toString(), pointsAgainst: row.pointsAgainst.toString() })), { headers: { "Cache-Control": "private, no-store" } });
}
