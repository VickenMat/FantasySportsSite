import { parseArgs } from "node:util";
import { z } from "zod";
import { GameStatRole } from "@/generated/prisma/enums";
import { getDatabase } from "@/lib/db";
import { recalculateScore, serializeScoreEntry } from "@/server/score-ledger";

const argsSchema = z.object({
  game: z.uuid(),
  player: z.uuid(),
  preset: z.string().trim().min(1).max(100).optional(),
  role: z.enum(GameStatRole).optional(),
  "te-eligible": z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  reason: z.string().trim().min(1).max(500).default("Manual calculation"),
});

async function main() {
  const { values } = parseArgs({
    options: {
      game: { type: "string" }, player: { type: "string" }, preset: { type: "string" },
      role: { type: "string" }, "te-eligible": { type: "string" }, reason: { type: "string" },
    },
  });
  const args = argsSchema.parse(values);
  const database = getDatabase();
  try {
    const { ledger, entry, changed } = await recalculateScore({
      gameId: args.game, playerId: args.player, presetVersion: args.preset, role: args.role,
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
