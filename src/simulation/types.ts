import type { SeasonCoverage, Sport } from "@/generated/prisma/enums";
import type { PositionEvidence } from "@/positions/eligibility";
import type { ScoringRole } from "./config";

export type Fixture = {
  id: string;
  slate: string;
  startsAt: number;
  knownAt: number;
  finalKnownAt?: number;
  teams: readonly string[];
};

export type RosterSnapshot = {
  playerId: string;
  team: string | null;
  positions: readonly string[];
  active: boolean;
  effectiveAt: number;
  knownAt: number;
};

export type Availability = {
  playerId: string;
  gameId: string;
  role: ScoringRole;
  probability: number;
  usage?: "starter" | "relief";
  knownAt: number;
};

export type Outcome = {
  playerId: string;
  gameId: string;
  seasonYear: number;
  role: ScoringRole;
  playedAt: number;
  knownAt: number;
  pointsTenths: number;
  missingStats: readonly string[];
  participation?: "PLAYED" | "DID_NOT_PLAY" | "UNKNOWN";
  scoringInputs?:{stats:Record<string,number|null>;teEligible?:boolean|null};
  started?: boolean;
  observedTeam?: string;
  observedPositions?: readonly string[];
};

export type SimulationInput = {
  decisionModel?: {participation:"PRIOR_ONLY";availabilityEvidence:"UNKNOWN";informationModel:"TWO_DAY"|"WEEKLY";positionModel:"DATED_CARRY"|"PRIOR_ESTIMATE"};
  sport: Sport;
  year: number;
  label: string;
  coverage: SeasonCoverage;
  coverageReason: string;
  mode: "as-of" | "historical-proxy";
  draftAt: number;
  fixtures: readonly Fixture[];
  outcomes: readonly Outcome[];
  roster: readonly RosterSnapshot[];
  availability: readonly Availability[];
  positions: readonly ({ playerId: string } & PositionEvidence)[];
  source: {
    hashes: Record<string, string>;
    acceptedRows: number;
    rejectedRows: number;
    unscheduledRows: number;
    excludedFixtures?: number;
    assumptions: readonly string[];
  };
};
