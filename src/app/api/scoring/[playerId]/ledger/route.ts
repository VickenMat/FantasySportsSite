import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getLeagueScoreHistory } from "@/server/score-ledger";

const querySchema = z.object({
  playerId: z.uuid(),
  leagueId: z.uuid(),
  gameId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, context: { params: Promise<{ playerId: string }> }) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401, headers });

  const query = querySchema.safeParse({ ...Object.fromEntries(new URL(request.url).searchParams), ...await context.params });
  if (!query.success) return Response.json({ error: "Invalid score ledger query." }, { status: 400, headers });

  const { limit, offset, ...input } = query.data;
  const history = await getLeagueScoreHistory({ ...input, userId: session.user.id, take: limit, skip: offset });
  if (!history) return Response.json({ error: "League unavailable." }, { status: 404, headers });
  return Response.json(history, { headers });
}
