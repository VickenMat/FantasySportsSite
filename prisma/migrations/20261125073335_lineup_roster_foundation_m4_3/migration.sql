-- CreateEnum
CREATE TYPE "PlayerAvailabilityDesignation" AS ENUM ('ACTIVE', 'QUESTIONABLE', 'DOUBTFUL', 'OUT', 'INJURED_RESERVE', 'SUSPENDED', 'RETIRED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RosterComplianceState" AS ENUM ('COMPLIANT', 'PENDING_DATA', 'IR_INELIGIBLE', 'OVER_CAPACITY');

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "universalBenchSlots" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "universalIrSlots" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "RosterEntry" ADD COLUMN     "slotIndex" INTEGER NOT NULL DEFAULT 1;

-- Existing roster rows retain their identity and acquire deterministic positions
-- within repeated slot names. No ownership or historical timestamps are changed.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "rosterId", "slot"
    ORDER BY "acquiredAt", "id"
  )::integer AS "position"
  FROM "RosterEntry"
)
UPDATE "RosterEntry" AS entry
SET "slotIndex" = ranked."position"
FROM ranked
WHERE ranked."id" = entry."id";

ALTER TABLE "RosterEntry"
  ADD CONSTRAINT "RosterEntry_slotIndex_positive" CHECK ("slotIndex" > 0);

-- CreateTable
CREATE TABLE "RosterAssignmentEvent" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "rosterEntryId" UUID NOT NULL,
    "actorUserId" UUID,
    "fromSlot" TEXT,
    "fromSlotIndex" INTEGER,
    "toSlot" TEXT NOT NULL,
    "toSlotIndex" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterAssignmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterComplianceSnapshot" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "state" "RosterComplianceState" NOT NULL,
    "reasons" TEXT[],
    "sourceHash" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterComplianceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerAvailabilityEvidence" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "gameId" UUID,
    "designation" "PlayerAvailabilityDesignation" NOT NULL,
    "irEligible" BOOLEAN NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
    "knownAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "sourceRecord" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerAvailabilityEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameLineupSnapshot" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "sportCompetitionId" UUID NOT NULL,
    "scoringPeriodId" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "rosterEntryId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "slot" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "isStarter" BOOLEAN NOT NULL,
    "lockedAt" TIMESTAMPTZ(3) NOT NULL,
    "eligibility" JSONB NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameLineupSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RosterAssignmentEvent_idempotencyKey_key" ON "RosterAssignmentEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RosterAssignmentEvent_rosterEntryId_effectiveAt_createdAt_idx" ON "RosterAssignmentEvent"("rosterEntryId", "effectiveAt", "createdAt");

-- CreateIndex
CREATE INDEX "RosterAssignmentEvent_teamId_effectiveAt_idx" ON "RosterAssignmentEvent"("teamId", "effectiveAt");

-- CreateIndex
CREATE INDEX "RosterComplianceSnapshot_leagueId_teamId_evaluatedAt_idx" ON "RosterComplianceSnapshot"("leagueId", "teamId", "evaluatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RosterComplianceSnapshot_teamId_sourceHash_key" ON "RosterComplianceSnapshot"("teamId", "sourceHash");

-- CreateIndex
CREATE INDEX "PlayerAvailabilityEvidence_playerId_effectiveAt_knownAt_idx" ON "PlayerAvailabilityEvidence"("playerId", "effectiveAt", "knownAt");

-- CreateIndex
CREATE INDEX "PlayerAvailabilityEvidence_gameId_knownAt_idx" ON "PlayerAvailabilityEvidence"("gameId", "knownAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerAvailabilityEvidence_provider_externalId_key" ON "PlayerAvailabilityEvidence"("provider", "externalId");

-- CreateIndex
CREATE INDEX "GameLineupSnapshot_scoringPeriodId_teamId_isStarter_idx" ON "GameLineupSnapshot"("scoringPeriodId", "teamId", "isStarter");

-- CreateIndex
CREATE INDEX "GameLineupSnapshot_gameId_playerId_idx" ON "GameLineupSnapshot"("gameId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "GameLineupSnapshot_sportCompetitionId_gameId_teamId_playerI_key" ON "GameLineupSnapshot"("sportCompetitionId", "gameId", "teamId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "GameLineupSnapshot_sportCompetitionId_gameId_teamId_slot_sl_key" ON "GameLineupSnapshot"("sportCompetitionId", "gameId", "teamId", "slot", "slotIndex");

-- Active slot occupancy is protected in PostgreSQL in addition to the serializable
-- application transaction. Universal positions are shared by all sport rosters.
CREATE UNIQUE INDEX "RosterEntry_active_sport_slot_key"
ON "RosterEntry"("rosterId", "slot", "slotIndex")
WHERE "releasedAt" IS NULL AND "slot" NOT IN ('UNIVERSAL_BENCH', 'UNIVERSAL_IR');

CREATE UNIQUE INDEX "RosterEntry_active_universal_slot_key"
ON "RosterEntry"("teamId", "slot", "slotIndex")
WHERE "releasedAt" IS NULL AND "slot" IN ('UNIVERSAL_BENCH', 'UNIVERSAL_IR');

-- AddForeignKey
ALTER TABLE "RosterAssignmentEvent" ADD CONSTRAINT "RosterAssignmentEvent_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterAssignmentEvent" ADD CONSTRAINT "RosterAssignmentEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterAssignmentEvent" ADD CONSTRAINT "RosterAssignmentEvent_rosterEntryId_fkey" FOREIGN KEY ("rosterEntryId") REFERENCES "RosterEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterAssignmentEvent" ADD CONSTRAINT "RosterAssignmentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterComplianceSnapshot" ADD CONSTRAINT "RosterComplianceSnapshot_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterComplianceSnapshot" ADD CONSTRAINT "RosterComplianceSnapshot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerAvailabilityEvidence" ADD CONSTRAINT "PlayerAvailabilityEvidence_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerAvailabilityEvidence" ADD CONSTRAINT "PlayerAvailabilityEvidence_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameLineupSnapshot" ADD CONSTRAINT "GameLineupSnapshot_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameLineupSnapshot" ADD CONSTRAINT "GameLineupSnapshot_sportCompetitionId_fkey" FOREIGN KEY ("sportCompetitionId") REFERENCES "SportCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameLineupSnapshot" ADD CONSTRAINT "GameLineupSnapshot_scoringPeriodId_fkey" FOREIGN KEY ("scoringPeriodId") REFERENCES "ScoringPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameLineupSnapshot" ADD CONSTRAINT "GameLineupSnapshot_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameLineupSnapshot" ADD CONSTRAINT "GameLineupSnapshot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameLineupSnapshot" ADD CONSTRAINT "GameLineupSnapshot_rosterEntryId_fkey" FOREIGN KEY ("rosterEntryId") REFERENCES "RosterEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameLineupSnapshot" ADD CONSTRAINT "GameLineupSnapshot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Assignment, source evidence, compliance evaluations, and game-start snapshots
-- are historical facts. Corrections append new rows instead of rewriting them.
CREATE TRIGGER "RosterAssignmentEvent_append_only"
  BEFORE UPDATE OR DELETE ON "RosterAssignmentEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only();

CREATE TRIGGER "RosterComplianceSnapshot_append_only"
  BEFORE UPDATE OR DELETE ON "RosterComplianceSnapshot"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only();

CREATE TRIGGER "PlayerAvailabilityEvidence_append_only"
  BEFORE UPDATE OR DELETE ON "PlayerAvailabilityEvidence"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only();

CREATE TRIGGER "GameLineupSnapshot_append_only"
  BEFORE UPDATE OR DELETE ON "GameLineupSnapshot"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only();

-- Seed the immutable movement timeline for every pre-M4.3 roster row. This is a
-- faithful record of the state known at migration time, not fabricated game data.
INSERT INTO "RosterAssignmentEvent" (
  "id", "leagueId", "teamId", "rosterEntryId", "fromSlot", "fromSlotIndex",
  "toSlot", "toSlotIndex", "effectiveAt", "reason", "idempotencyKey"
)
SELECT gen_random_uuid(), "leagueId", "teamId", "id", NULL, NULL,
       "slot", "slotIndex", "acquiredAt", 'M4.3 migration baseline',
       'baseline:' || "id"::text
FROM "RosterEntry";
