import type { GameStatRole, Sport } from "@/generated/prisma/enums";

export const engineVersion = "ubp-box-score-1";

export const sportByRole: Record<GameStatRole, Sport> = {
  FOOTBALL: "NFL",
  HITTER: "MLB",
  PITCHER: "MLB",
  BASKETBALL: "NBA",
  SKATER: "NHL",
  GOALIE: "NHL",
};

const roleApplicability: Record<GameStatRole, string> = {
  FOOTBALL: "all",
  HITTER: "hitter",
  PITCHER: "pitcher",
  BASKETBALL: "all",
  SKATER: "skater",
  GOALIE: "goalie",
};

export const signedStats = new Set(["passing_yards", "rushing_yards", "receiving_yards"]);
export const maxStatCount = 1_000_000;

export type StatValues = Record<string, number | null>;

export type ScoringRuleInput = {
  sport: Sport;
  statKey: string;
  applicability: string;
  coefficientTenths: number;
};

export function applicableRules(rules: readonly ScoringRuleInput[], role: GameStatRole) {
  return rules.filter(({ sport, applicability }) =>
    sport === sportByRole[role] &&
    (applicability === roleApplicability[role] || (role === "FOOTBALL" && applicability === "tightEnd")),
  );
}

export function chooseRole(roles: readonly GameStatRole[], selected?: GameStatRole): GameStatRole {
  const available = [...new Set(roles)];
  if (selected) {
    if (!available.includes(selected)) throw new Error("The selected scoring role has no box score.");
    return selected;
  }
  if (available.length !== 1) throw new Error(
    available.length === 0 ? "No box score is available." : "Choose a scoring role explicitly for this athlete and game.",
  );
  return available[0];
}

export function calculateScore(
  rules: readonly ScoringRuleInput[],
  input: { role: GameStatRole; stats: StatValues; teEligible?: boolean | null },
) {
  const lineItems: { statKey: string; count: number; per: number; coefficientTenths: number; pointsTenths: number }[] = [];
  const missingStats: string[] = [];
  let totalTenths = 0;
  const applicable = applicableRules(rules, input.role).sort((a, b) =>
    a.statKey < b.statKey ? -1 : a.statKey > b.statKey ? 1 : 0,
  );
  if (!applicable.length) throw new Error("The scoring version has no rules for the selected role.");

  for (const { statKey, coefficientTenths, applicability } of applicable) {
    if (!Number.isSafeInteger(coefficientTenths)) throw new Error(`Invalid coefficient for ${statKey}.`);
    const isTightEndBonus = applicability === "tightEnd";
    const isInnings = statKey === "pitching_innings";
    const sourceKey = isTightEndBonus ? "receptions" : isInnings ? "pitching_outs" : statKey;
    const count = isTightEndBonus && input.teEligible === false ? 0 : input.stats[sourceKey];
    if (count == null || (isTightEndBonus && input.teEligible == null && count !== 0)) {
      missingStats.push(statKey);
      continue;
    }
    if (!Number.isInteger(count) || Math.abs(count) > maxStatCount || (count < 0 && !signedStats.has(sourceKey))) {
      throw new Error(`Invalid stat count for ${sourceKey}.`);
    }

    // A third of a point tenth can occur for future inning weights. Retain thirds
    // internally until the final one-decimal presentation boundary.
    const pointsThirdsOfTenths = count * coefficientTenths * (isInnings ? 1 : 3);
    if (!Number.isSafeInteger(pointsThirdsOfTenths)) throw new Error("Scoring contribution exceeds safe precision.");
    const pointsTenths = pointsThirdsOfTenths / 3;
    totalTenths += pointsThirdsOfTenths;
    lineItems.push({ statKey, count, per: isInnings ? 3 : 1, coefficientTenths, pointsTenths });
  }
  if (!Number.isSafeInteger(totalTenths)) throw new Error("Score exceeds safe precision.");

  // Round half away from zero only at the final boundary.
  const rounded = Math.sign(totalTenths) * Math.floor((Math.abs(totalTenths) + 1) / 3);
  return { totalTenths: rounded || 0, lineItems, missingStats };
}

export function formatScore(totalTenths: number | bigint) {
  const value = BigInt(totalTenths);
  const magnitude = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${magnitude / 10n}.${magnitude % 10n}`;
}
