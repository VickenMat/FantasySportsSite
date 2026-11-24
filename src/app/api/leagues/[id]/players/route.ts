import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { playerPage } from "@/server/draft";
import { enforceRateLimit, RateLimitError } from "@/server/rate-limit";

const query = z.object({ q: z.string().max(80).optional(), position: z.string().max(12).optional(), page: z.coerce.number().int().min(1).default(1) });
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });
  try { await enforceRateLimit(session.user.id, "players-api", 180, 60_000); }
  catch (error) { if (error instanceof RateLimitError) return Response.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }); throw error; }
  const { id } = await params;
  if (!await getDatabase().leagueMember.findUnique({ where: { leagueId_userId: { leagueId: id, userId: session.user.id } } })) return Response.json({ error: "League unavailable." }, { status: 404 });
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Invalid player query." }, { status: 400 });
  return Response.json(await playerPage(id, { search: parsed.data.q, position: parsed.data.position, page: parsed.data.page, pageSize: 50 }), { headers: { "Cache-Control": "private, no-store" } });
}
