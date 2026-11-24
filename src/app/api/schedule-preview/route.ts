import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { enforceRateLimit, RateLimitError } from "@/server/rate-limit";
import { previewLeagueSchedule } from "@/server/scheduling";

const input = z.object({
  sports: z.array(z.enum(["NFL", "NBA", "MLB", "NHL"])).min(1).max(4),
  draftCompleteBy: z.coerce.date(), competitionType: z.enum(["HEAD_TO_HEAD", "CUMULATIVE"]),
});

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });
  try { await enforceRateLimit(session.user.id, "schedule-preview", 30, 60_000); }
  catch (error) { if (error instanceof RateLimitError) return Response.json({ error: error.message }, { status: 429 }); throw error; }
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose at least one sport and a valid expected draft completion time." }, { status: 400 });
  return Response.json({ sports: await previewLeagueSchedule(parsed.data) }, { headers: { "Cache-Control": "private, no-store" } });
}
