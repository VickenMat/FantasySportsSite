import { hashPassword } from "better-auth/crypto";
import { getDatabase } from "@/lib/db";
import { accountNameSchema, emailSchema, passwordSchema } from "@/lib/auth-validation";
import { ubpV9, ubpV9Rules } from "@/scoring/ubp-v9";
import type { Sport } from "@/generated/prisma/enums";

const database = getDatabase();
const demoUserId = "9cad3a58-f74c-476b-8acb-82859f3cffa3";
const sports: Sport[] = ["NFL", "MLB", "NBA", "NHL"];

const players: { id: string; sport: Sport; displayName: string }[] = [
  { id: "3712b6d3-9fb8-45a1-9717-7fb0a4946601", sport: "NFL", displayName: "Lamar Jackson" },
  { id: "3712b6d3-9fb8-45a1-9717-7fb0a4946602", sport: "NFL", displayName: "Justin Jefferson" },
  { id: "3712b6d3-9fb8-45a1-9717-7fb0a4946603", sport: "MLB", displayName: "Shohei Ohtani" },
  { id: "3712b6d3-9fb8-45a1-9717-7fb0a4946604", sport: "MLB", displayName: "Aaron Judge" },
  { id: "3712b6d3-9fb8-45a1-9717-7fb0a4946605", sport: "NBA", displayName: "Nikola Jokić" },
  { id: "3712b6d3-9fb8-45a1-9717-7fb0a4946606", sport: "NBA", displayName: "Shai Gilgeous-Alexander" },
  { id: "3712b6d3-9fb8-45a1-9717-7fb0a4946607", sport: "NHL", displayName: "Connor McDavid" },
  { id: "3712b6d3-9fb8-45a1-9717-7fb0a4946608", sport: "NHL", displayName: "Cale Makar" },
];

async function seed() {
  const demoCredentials = process.env.DEMO_PASSWORD
    ? {
        email: emailSchema.parse(process.env.DEMO_EMAIL),
        password: await hashPassword(passwordSchema.parse(process.env.DEMO_PASSWORD)),
      }
    : null;

  await database.$transaction(async (tx) => {
    const preset = await tx.scoringPreset.upsert({
      where: { version: ubpV9.version },
      update: {},
      create: {
        ...ubpV9,
        rules: {
          create: ubpV9Rules.map(({ coefficientTenths, ...rule }) => ({
            ...rule,
            coefficient: (coefficientTenths / 10).toFixed(1),
          })),
        },
      },
    });

    const league = await tx.league.upsert({
      where: { slug: "founders-dynasty" },
      update: {},
      create: {
        slug: "founders-dynasty",
        name: "Founders Dynasty",
        format: "DYNASTY",
        maxTeams: 12,
        isDemo: true,
        presetId: preset.id,
        sports: { create: sports.map((sport) => ({ sport })) },
      },
    });

    await tx.player.createMany({ data: players, skipDuplicates: true });

    if (demoCredentials) {
      await tx.user.upsert({
        where: { id: demoUserId },
        update: {},
        create: {
          id: demoUserId,
          name: accountNameSchema.parse("Demo Manager"),
          email: demoCredentials.email,
          accounts: {
            create: {
              providerId: "credential",
              accountId: demoUserId,
              password: demoCredentials.password,
            },
          },
        },
      });

      await tx.leagueMember.upsert({
        where: { leagueId_userId: { leagueId: league.id, userId: demoUserId } },
        update: {},
        create: { leagueId: league.id, userId: demoUserId, role: "COMMISSIONER" },
      });
    }
  });

  console.info(demoCredentials ? "Demo league and account seeded." : "Demo league seeded.");
}

seed()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Database seed failed.");
    process.exitCode = 1;
  })
  .finally(() => database.$disconnect());
