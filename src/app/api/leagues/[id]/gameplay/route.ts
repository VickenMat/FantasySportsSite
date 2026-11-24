import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { addFreeAgent, dropPlayer } from "@/server/rosters";
import { makePick } from "@/server/draft";
import { submitWaiver } from "@/server/waivers";
import { enforceRateLimit, RateLimitError } from "@/server/rate-limit";
import { getDatabase } from "@/lib/db";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("draft"), draftId: z.uuid(), playerId: z.uuid() }),
  z.object({ action: z.literal("add"), playerId: z.uuid() }),
  z.object({ action: z.literal("drop"), playerId: z.uuid() }),
  z.object({ action: z.literal("waiver"), addPlayerId: z.uuid(), dropPlayerId: z.uuid().nullish(), bid: z.number().int().min(0) }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuth().api.getSession({ headers: request.headers }); if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });
  try { await enforceRateLimit(session.user.id, "gameplay-api", 120, 60_000); } catch (error) { if (error instanceof RateLimitError) return Response.json({ error: error.message }, { status: 429 }); throw error; }
  const parsed = input.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: "Invalid gameplay request." }, { status: 400 });
  const { id } = await params;
  try {
    if (parsed.data.action === "draft") {
      const draft = await getDatabase().draft.findFirst({ where: { id: parsed.data.draftId, leagueId: id }, select: { id: true } });
      if (!draft) return Response.json({ error: "Draft unavailable." }, { status: 404 });
      await makePick({ userId: session.user.id, draftId: parsed.data.draftId, playerId: parsed.data.playerId });
    }
    else if (parsed.data.action === "add") await addFreeAgent(session.user.id, id, parsed.data.playerId);
    else if (parsed.data.action === "drop") await dropPlayer(session.user.id, id, parsed.data.playerId);
    else await submitWaiver(session.user.id, { leagueId: id, addPlayerId: parsed.data.addPlayerId, dropPlayerId: parsed.data.dropPlayerId, bid: parsed.data.bid });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Gameplay request failed." }, { status: 409 });
  }
}
