import { z } from "zod";
import { getDatabase } from "@/lib/db";

export function listMemberLeagues(userId: string) {
  return getDatabase().leagueMember.findMany({
    where: { userId },
    orderBy: [{ league: { name: "asc" } }, { leagueId: "asc" }],
    select: {
      role: true,
      league: {
        select: {
          id: true, name: true, format: true, isDemo: true, maxTeams: true,
          sports: { orderBy: { sport: "asc" }, select: { sport: true } },
        },
      },
    },
  });
}

export async function getMemberLeague(userId: string, leagueId: string) {
  if (!z.uuid().safeParse(leagueId).success) return null;

  const membership = await getDatabase().leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
    select: {
      role: true,
      league: {
        include: {
          sports: { orderBy: { sport: "asc" } },
          preset: { include: { rules: { orderBy: [{ sport: "asc" }, { statKey: "asc" }] } } },
          _count: { select: { members: true } },
        },
      },
    },
  });
  return membership;
}

export function listDemoPlayers() {
  return getDatabase().player.findMany({
    orderBy: [{ sport: "asc" }, { displayName: "asc" }],
    select: { id: true, displayName: true, sport: true },
  });
}
