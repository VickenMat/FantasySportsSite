-- CreateEnum
CREATE TYPE "SeasonCoverage" AS ENUM ('UNVERIFIED', 'COMPLETE', 'PARTIAL', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "GamePhase" AS ENUM ('REGULAR', 'POSTSEASON', 'PRESEASON', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "GameSide" AS ENUM ('HOME', 'AWAY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "GameStatRole" AS ENUM ('FOOTBALL', 'HITTER', 'PITCHER', 'BASKETBALL', 'SKATER', 'GOALIE');

-- CreateEnum
CREATE TYPE "PositionEvidenceKind" AS ENUM ('LISTED', 'FIELDING');

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Season" (
    "id" UUID NOT NULL,
    "sport" "Sport" NOT NULL,
    "startYear" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "coverage" "SeasonCoverage" NOT NULL DEFAULT 'UNVERIFIED',
    "coverageReason" TEXT,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerExternalId" (
    "id" UUID NOT NULL,
    "sport" "Sport" NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "playerId" UUID NOT NULL,

    CONSTRAINT "PlayerExternalId_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProTeam" (
    "id" UUID NOT NULL,
    "sport" "Sport" NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "code" TEXT,
    "displayName" TEXT NOT NULL,

    CONSTRAINT "ProTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" UUID NOT NULL,
    "sport" "Sport" NOT NULL,
    "seasonId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "phase" "GamePhase" NOT NULL,
    "gameDate" DATE,
    "startsAt" TIMESTAMPTZ(3),
    "week" INTEGER,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameTeam" (
    "gameId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "side" "GameSide" NOT NULL DEFAULT 'UNKNOWN',

    CONSTRAINT "GameTeam_pkey" PRIMARY KEY ("gameId","teamId")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" UUID NOT NULL,
    "sport" "Sport" NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerPositionEvidence" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "gameId" UUID,
    "kind" "PositionEvidenceKind" NOT NULL,
    "started" BOOLEAN,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
    "knownAt" TIMESTAMPTZ(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,

    CONSTRAINT "PlayerPositionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL,
    "sport" "Sport" NOT NULL,
    "provider" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "importerVersion" TEXT NOT NULL,
    "correctionReason" TEXT,
    "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerGameStat" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "importBatchId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "role" "GameStatRole" NOT NULL,
    "revision" INTEGER NOT NULL,
    "priorRevisionId" UUID,
    "contentHash" TEXT NOT NULL,
    "sourceLine" INTEGER NOT NULL,
    "observedPositions" TEXT[],
    "normalized" JSONB NOT NULL,
    "raw" JSONB NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceKnownAt" TIMESTAMPTZ(3),

    CONSTRAINT "PlayerGameStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreLedger" (
    "id" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "presetId" UUID NOT NULL,
    "role" "GameStatRole" NOT NULL,

    CONSTRAINT "ScoreLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreLedgerEntry" (
    "id" UUID NOT NULL,
    "ledgerId" UUID NOT NULL,
    "statId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "previousEntryId" UUID,
    "reason" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "ruleHash" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "totalTenths" BIGINT NOT NULL,
    "lineItems" JSONB NOT NULL,
    "missingStats" TEXT[],
    "teEligible" BOOLEAN,
    "teEligibilityOverride" BOOLEAN,
    "calculatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Season_sport_startYear_key" ON "Season"("sport", "startYear");

-- CreateIndex
CREATE INDEX "PlayerExternalId_playerId_idx" ON "PlayerExternalId"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerExternalId_sport_provider_externalId_key" ON "PlayerExternalId"("sport", "provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ProTeam_sport_provider_externalId_key" ON "ProTeam"("sport", "provider", "externalId");

-- CreateIndex
CREATE INDEX "Game_seasonId_gameDate_idx" ON "Game"("seasonId", "gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "Game_sport_provider_externalId_key" ON "Game"("sport", "provider", "externalId");

-- CreateIndex
CREATE INDEX "GameTeam_teamId_gameId_idx" ON "GameTeam"("teamId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "Position_sport_code_key" ON "Position"("sport", "code");

-- CreateIndex
CREATE INDEX "PlayerPositionEvidence_playerId_seasonId_knownAt_idx" ON "PlayerPositionEvidence"("playerId", "seasonId", "knownAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerPositionEvidence_provider_externalId_key" ON "PlayerPositionEvidence"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_sport_provider_contentHash_importerVersion_key" ON "ImportBatch"("sport", "provider", "contentHash", "importerVersion");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameStat_priorRevisionId_key" ON "PlayerGameStat"("priorRevisionId");

-- CreateIndex
CREATE INDEX "PlayerGameStat_playerId_gameId_idx" ON "PlayerGameStat"("playerId", "gameId");

-- CreateIndex
CREATE INDEX "PlayerGameStat_importBatchId_idx" ON "PlayerGameStat"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameStat_gameId_playerId_provider_role_revision_key" ON "PlayerGameStat"("gameId", "playerId", "provider", "role", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameStat_gameId_playerId_provider_role_contentHash_key" ON "PlayerGameStat"("gameId", "playerId", "provider", "role", "contentHash");

-- CreateIndex
CREATE INDEX "ScoreLedger_playerId_gameId_idx" ON "ScoreLedger"("playerId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreLedger_gameId_playerId_presetId_key" ON "ScoreLedger"("gameId", "playerId", "presetId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreLedgerEntry_previousEntryId_key" ON "ScoreLedgerEntry"("previousEntryId");

-- CreateIndex
CREATE INDEX "ScoreLedgerEntry_statId_idx" ON "ScoreLedgerEntry"("statId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreLedgerEntry_ledgerId_sequence_key" ON "ScoreLedgerEntry"("ledgerId", "sequence");

-- CreateIndex
CREATE INDEX "Player_isDemo_sport_displayName_idx" ON "Player"("isDemo", "sport", "displayName");

-- AddForeignKey
ALTER TABLE "PlayerExternalId" ADD CONSTRAINT "PlayerExternalId_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTeam" ADD CONSTRAINT "GameTeam_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTeam" ADD CONSTRAINT "GameTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ProTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPositionEvidence" ADD CONSTRAINT "PlayerPositionEvidence_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPositionEvidence" ADD CONSTRAINT "PlayerPositionEvidence_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPositionEvidence" ADD CONSTRAINT "PlayerPositionEvidence_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPositionEvidence" ADD CONSTRAINT "PlayerPositionEvidence_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGameStat" ADD CONSTRAINT "PlayerGameStat_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGameStat" ADD CONSTRAINT "PlayerGameStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGameStat" ADD CONSTRAINT "PlayerGameStat_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ProTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGameStat" ADD CONSTRAINT "PlayerGameStat_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGameStat" ADD CONSTRAINT "PlayerGameStat_priorRevisionId_fkey" FOREIGN KEY ("priorRevisionId") REFERENCES "PlayerGameStat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreLedger" ADD CONSTRAINT "ScoreLedger_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreLedger" ADD CONSTRAINT "ScoreLedger_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreLedger" ADD CONSTRAINT "ScoreLedger_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "ScoringPreset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreLedgerEntry" ADD CONSTRAINT "ScoreLedgerEntry_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "ScoreLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreLedgerEntry" ADD CONSTRAINT "ScoreLedgerEntry_statId_fkey" FOREIGN KEY ("statId") REFERENCES "PlayerGameStat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreLedgerEntry" ADD CONSTRAINT "ScoreLedgerEntry_previousEntryId_fkey" FOREIGN KEY ("previousEntryId") REFERENCES "ScoreLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve the eight demo players seeded by M0.
UPDATE "Player" SET "isDemo" = true WHERE "id"::text IN (
  '3712b6d3-9fb8-45a1-9717-7fb0a4946601', '3712b6d3-9fb8-45a1-9717-7fb0a4946602',
  '3712b6d3-9fb8-45a1-9717-7fb0a4946603', '3712b6d3-9fb8-45a1-9717-7fb0a4946604',
  '3712b6d3-9fb8-45a1-9717-7fb0a4946605', '3712b6d3-9fb8-45a1-9717-7fb0a4946606',
  '3712b6d3-9fb8-45a1-9717-7fb0a4946607', '3712b6d3-9fb8-45a1-9717-7fb0a4946608'
);

CREATE UNIQUE INDEX "GameTeam_one_known_side_per_game"
  ON "GameTeam" ("gameId", "side") WHERE "side" <> 'UNKNOWN';

ALTER TABLE "PlayerGameStat" ADD CONSTRAINT "PlayerGameStat_participating_team"
  FOREIGN KEY ("gameId", "teamId") REFERENCES "GameTeam" ("gameId", "teamId");

ALTER TABLE "PlayerGameStat" ADD CONSTRAINT "PlayerGameStat_revision_chain"
  CHECK (("revision" = 1 AND "priorRevisionId" IS NULL) OR ("revision" > 1 AND "priorRevisionId" IS NOT NULL));

ALTER TABLE "ScoreLedgerEntry" ADD CONSTRAINT "ScoreLedgerEntry_sequence_chain"
  CHECK (("sequence" = 1 AND "previousEntryId" IS NULL) OR ("sequence" > 1 AND "previousEntryId" IS NOT NULL));

ALTER TABLE "PlayerPositionEvidence" ADD CONSTRAINT "PlayerPositionEvidence_kind_fields"
  CHECK (("kind" = 'LISTED' AND "gameId" IS NULL AND "started" IS NULL)
    OR ("kind" = 'FIELDING' AND "gameId" IS NOT NULL AND "started" IS NOT NULL AND "knownAt" >= "effectiveAt"));

CREATE FUNCTION fantasy_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "PlayerGameStat_append_only"
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "PlayerGameStat"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only();

CREATE TRIGGER "ScoreLedgerEntry_append_only"
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "ScoreLedgerEntry"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only();

CREATE TRIGGER "ScoreLedger_append_only"
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "ScoreLedger"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only();

CREATE TRIGGER "PlayerPositionEvidence_append_only"
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "PlayerPositionEvidence"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only();
