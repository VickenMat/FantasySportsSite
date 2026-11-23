import { parseArgs } from "node:util";
import { z } from "zod";
import { GameStatRole, Sport } from "@/generated/prisma/enums";
import { historicalProvider as provider } from "@/imports/normalize";
import { getDatabase } from "@/lib/db";
import { recalculateScore, serializeScoreEntry } from "@/server/score-ledger";

const argsSchema = z.object({
  sport: z.enum(Sport).optional(),
  game: z.string().trim().min(1).max(200),
  player: z.string().trim().min(1).max(200),
  preset: z.string().trim().min(1).max(100).optional(),
  role: z.enum(GameStatRole).optional(),
  "te-eligible": z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  reason: z.string().trim().min(1).max(500).default("Manual calculation"),
});

async function main() {
  const { values } = parseArgs({
    options: {
      game: { type: "string" }, player: { type: "string" }, sport: { type: "string" }, preset: { type: "string" },
      role: { type: "string" }, "te-eligible": { type: "string" }, reason: { type: "string" },
    },
  });
  const args = argsSchema.parse(values);
  const database = getDatabase();
  try {
    const { sport } = args;
    const ids = sport
      ? await Promise.all([
          database.game.findUniqueOrThrow({
            where: { sport_provider_externalId: { sport, provider, externalId: args.game } },
            select: { id: true },
          }).then(({ id }) => id),
          database.playerExternalId.findUniqueOrThrow({
            where: { sport_provider_externalId: { sport, provider, externalId: args.player } },
            select: { playerId: true },
          }).then(({ playerId }) => playerId),
        ])
      : z.tuple([z.uuid(), z.uuid()]).parse([args.game, args.player]);
    const { ledger, entry, changed } = await recalculateScore({
      gameId: ids[0], playerId: ids[1], presetVersion: args.preset, role: args.role,
      teEligible: args["te-eligible"], reason: args.reason,
    });
    console.info(JSON.stringify({ ledgerId: ledger?.id, changed, entry: serializeScoreEntry(entry) }, null, 2));
  } finally {
    await database.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Score calculation failed.");
  process.exitCode = 1;
});
