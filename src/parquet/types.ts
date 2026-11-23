import type { SeasonCoverage, Sport } from "@/generated/prisma/enums";

export type EvidenceClass = "VERIFIED" | "RECONSTRUCTED" | "ESTIMATED" | "UNSUPPORTED";

export type EvidenceCoverage = Record<EvidenceClass, { count: number; percent: number }>;

export type SeasonQuality = {
  sport: Sport;
  season: number;
  label: string;
  rows: number;
  acceptedRows: number;
  quarantinedRows: number;
  duplicateRows: number;
  games: number;
  players: number;
  teams: number;
  minimumDate: string | null;
  maximumDate: string | null;
  coverage: SeasonCoverage;
  coverageReason: string;
  missingStatistics: Record<string, number>;
  quarantineReasons: Record<string, number>;
  evidence: Record<"draft" | "lineup" | "waiver", EvidenceCoverage>;
};

export type ParquetQualityReport = {
  reportVersion: "parquet-quality-1";
  generatedAt: string;
  sport: Sport;
  source: {
    path: string;
    bytes: number;
    sha256: string;
    parquetRows: number;
    rowGroups: number;
    columns: { name: string; type: string }[];
    keyValueMetadata: Record<string, string>;
  };
  processing: { batchSize: number; peakRowsHeld: number };
  totals: { rows: number; acceptedRows: number; quarantinedRows: number; duplicateRows: number };
  seasons: SeasonQuality[];
  quarantine: { row: number; season: number | null; reason: string }[];
  reconciliation: {
    priorValidatedRows: number | null;
    rowCountMatchesPriorArchive: boolean | null;
    postgresActiveStats: number | null;
    note: string;
  };
};
