import { z } from "zod";
import { GameStatRole, Sport } from "@/generated/prisma/enums";

export const day = 86_400_000;

export const defaultSlots = {
  NFL: ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "SUPERFLEX"],
  NBA: ["PG", "SG", "G", "SF", "PF", "F", "C", "C", "UTIL"],
  MLB: ["SP", "SP", "1B", "3B", "MI", "OF", "OF", "UTIL", "UTIL"],
  NHL: ["F", "F", "F", "F", "D", "D", "G", "UTIL", "UTIL"],
} as const satisfies Record<Sport, readonly string[]>;

type Slot = { positions: readonly string[]; role: keyof typeof GameStatRole };
function slotsFor(role: Slot["role"], definitions: Record<string, string[]>) {
  return Object.fromEntries(Object.entries(definitions).map(([slot, positions]) => [slot, { role, positions }]));
}

const nbaPositions = ["PG", "SG", "SF", "PF", "C"];
const hitters = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "OF", "DH"];
const forwards = ["F", "C", "LW", "RW"];

const slotRules: Record<Sport, Record<string, Slot>> = {
  NFL: slotsFor("FOOTBALL", {
    QB: ["QB"], RB: ["RB"], FB: ["FB"], WR: ["WR"], TE: ["TE"],
    FLEX: ["RB", "WR", "TE"], SUPERFLEX: ["QB", "RB", "WR", "TE"],
  }),
  NBA: slotsFor("BASKETBALL", {
    ...Object.fromEntries(nbaPositions.map((position) => [position, [position]])),
    G: ["PG", "SG"], F: ["SF", "PF"], UTIL: nbaPositions,
  }),
  MLB: {
    ...slotsFor("HITTER", {
      ...Object.fromEntries(hitters.map((position) => [position, [position]])),
      MI: ["2B", "SS"], OF: ["LF", "CF", "RF", "OF"], UTIL: hitters,
    }),
    ...slotsFor("PITCHER", { SP: ["SP"], RP: ["RP"], P: ["SP", "RP", "P"] }),
  },
  NHL: {
    ...slotsFor("SKATER", {
      F: forwards, C: ["C"], LW: ["LW"], RW: ["RW"], D: ["D"], UTIL: [...forwards, "D"],
    }),
    ...slotsFor("GOALIE", { G: ["G"] }),
  },
};

export const configSchema = z.object({
  sport: z.enum(Sport),
  teams: z.number().int().min(2).max(16).default(12),
  seed: z.number().int().min(0).max(0xffffffff).default(11),
  slots: z.array(z.string()).min(1).max(24).optional(),
  bench: z.number().int().min(0).max(20).default(5),
  rankingModel: z.enum(["TRAILING20_SHRINK4", "V5_TRAILING10_PRIOR_FALLBACK", "PRIOR_SEASON_ONLY"]).default("TRAILING20_SHRINK4"),
  strategy: z.enum(["balanced", "upside", "scarcity"]).default("balanced"),
  faab: z.number().int().min(0).max(100_000).default(100),
  waiverWeekday: z.number().int().min(0).max(6).default(3),
  waiverHourUtc: z.number().int().min(0).max(23).default(12),
  includeTrace: z.boolean().default(false),
  strictGameMutationLocks: z.boolean().default(false),
  lineupObjective: z.enum(["FILL_THEN_EXPECTED_POINTS", "EXPECTED_POINTS"]).default("FILL_THEN_EXPECTED_POINTS"),
  lockMode: z.enum(["SLATE", "INDIVIDUAL_GAME", "DAILY_FIRST_START"]).default("SLATE"),
  draftOrder: z.array(z.number().int().nonnegative()).optional(),
}).transform((config, context) => {
  if(config.draftOrder && (config.draftOrder.length!==config.teams || new Set(config.draftOrder).size!==config.teams || config.draftOrder.some(team=>team>=config.teams))) context.addIssue({code:"custom",message:"Draft order must be a franchise permutation."});
  const slots = (config.slots ?? defaultSlots[config.sport]).map((slot) => slot.trim().toUpperCase());
  for (const slot of slots) {
    if (!Object.hasOwn(slotRules[config.sport], slot)) {
      context.addIssue({ code: "custom", message: `Unsupported ${config.sport} starter slot ${slot}.` });
    }
  }
  return { ...config, slots };
});

export type SimulationConfig = z.output<typeof configSchema>;
export type ScoringRole = keyof typeof GameStatRole;

export function slotRule(sport: Sport, slot: string) {
  return slotRules[sport][slot];
}

export function fitsSlot(sport: Sport, slot: string, positions: ReadonlySet<string>) {
  return slotRule(sport, slot).positions.some((position) => positions.has(position));
}

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

export function compareId(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
