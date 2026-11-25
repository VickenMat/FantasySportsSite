CREATE TYPE "WaiverMethod" AS ENUM ('ROLLING', 'FAAB');
CREATE TYPE "FaabScope" AS ENUM ('SPORT', 'UNIVERSAL');
CREATE TYPE "FaabLedgerType" AS ENUM ('OPENING', 'RESERVATION', 'RESERVATION_RELEASE', 'SETTLEMENT', 'RESET', 'TRADE', 'AWARD');

ALTER TABLE "League"
  ADD COLUMN "waiverMethod" "WaiverMethod" NOT NULL DEFAULT 'FAAB',
  ADD COLUMN "faabScope" "FaabScope" NOT NULL DEFAULT 'SPORT',
  ADD COLUMN "universalStartingFaab" INTEGER NOT NULL DEFAULT 500;

CREATE TABLE "FaabAccount" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "leagueId" UUID NOT NULL,
  "teamId" UUID NOT NULL,
  "scope" "FaabScope" NOT NULL,
  "leagueSportId" UUID,
  "championshipCycleId" UUID,
  "openingBalance" INTEGER NOT NULL,
  "balance" INTEGER NOT NULL,
  "reserved" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FaabAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FaabAccount_nonnegative" CHECK ("openingBalance" >= 0 AND "balance" >= 0 AND "reserved" >= 0 AND "reserved" <= "balance"),
  CONSTRAINT "FaabAccount_scope" CHECK (
    ("scope" = 'SPORT' AND "leagueSportId" IS NOT NULL AND "championshipCycleId" IS NULL) OR
    ("scope" = 'UNIVERSAL' AND "leagueSportId" IS NULL AND "championshipCycleId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "FaabAccount_sport_identity" ON "FaabAccount" ("leagueSportId", "teamId") WHERE "scope" = 'SPORT';
CREATE UNIQUE INDEX "FaabAccount_universal_identity" ON "FaabAccount" ("championshipCycleId", "teamId") WHERE "scope" = 'UNIVERSAL';
CREATE INDEX "FaabAccount_league_team_scope_idx" ON "FaabAccount" ("leagueId", "teamId", "scope");
CREATE INDEX "FaabAccount_leagueSportId_teamId_idx" ON "FaabAccount" ("leagueSportId", "teamId");
CREATE INDEX "FaabAccount_championshipCycleId_teamId_idx" ON "FaabAccount" ("championshipCycleId", "teamId");

CREATE TABLE "FaabLedgerEntry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "accountId" UUID NOT NULL,
  "claimId" UUID,
  "type" "FaabLedgerType" NOT NULL,
  "balanceDelta" INTEGER NOT NULL,
  "reservedDelta" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "reservedAfter" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FaabLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FaabLedgerEntry_nonnegative" CHECK ("balanceAfter" >= 0 AND "reservedAfter" >= 0 AND "reservedAfter" <= "balanceAfter")
);

CREATE UNIQUE INDEX "FaabLedgerEntry_idempotencyKey_key" ON "FaabLedgerEntry" ("idempotencyKey");
CREATE INDEX "FaabLedgerEntry_accountId_createdAt_idx" ON "FaabLedgerEntry" ("accountId", "createdAt");
CREATE INDEX "FaabLedgerEntry_claimId_idx" ON "FaabLedgerEntry" ("claimId");

CREATE TABLE "WaiverPriority" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "leagueId" UUID NOT NULL,
  "leagueSportId" UUID NOT NULL,
  "teamId" UUID NOT NULL,
  "rank" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WaiverPriority_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WaiverPriority_positive_rank" CHECK ("rank" > 0)
);

CREATE UNIQUE INDEX "WaiverPriority_leagueSportId_teamId_key" ON "WaiverPriority" ("leagueSportId", "teamId");
CREATE UNIQUE INDEX "WaiverPriority_leagueSportId_rank_key" ON "WaiverPriority" ("leagueSportId", "rank");
CREATE INDEX "WaiverPriority_leagueId_leagueSportId_rank_idx" ON "WaiverPriority" ("leagueId", "leagueSportId", "rank");

CREATE TABLE "GameCompletionEvidence" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "gameId" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "completedAt" TIMESTAMPTZ(3) NOT NULL,
  "knownAt" TIMESTAMPTZ(3) NOT NULL,
  "sourceRecord" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameCompletionEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GameCompletionEvidence_provider_externalId_key" ON "GameCompletionEvidence" ("provider", "externalId");
CREATE INDEX "GameCompletionEvidence_gameId_completedAt_knownAt_idx" ON "GameCompletionEvidence" ("gameId", "completedAt", "knownAt");

ALTER TABLE "WaiverClaim" ADD COLUMN "faabAccountId" UUID;
CREATE INDEX "WaiverClaim_faabAccountId_status_idx" ON "WaiverClaim" ("faabAccountId", "status");

ALTER TABLE "FaabAccount" ADD CONSTRAINT "FaabAccount_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FaabAccount" ADD CONSTRAINT "FaabAccount_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FaabAccount" ADD CONSTRAINT "FaabAccount_leagueSportId_fkey" FOREIGN KEY ("leagueSportId") REFERENCES "LeagueSport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FaabAccount" ADD CONSTRAINT "FaabAccount_championshipCycleId_fkey" FOREIGN KEY ("championshipCycleId") REFERENCES "ChampionshipCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FaabLedgerEntry" ADD CONSTRAINT "FaabLedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FaabAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FaabLedgerEntry" ADD CONSTRAINT "FaabLedgerEntry_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "WaiverClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WaiverPriority" ADD CONSTRAINT "WaiverPriority_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaiverPriority" ADD CONSTRAINT "WaiverPriority_leagueSportId_fkey" FOREIGN KEY ("leagueSportId") REFERENCES "LeagueSport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaiverPriority" ADD CONSTRAINT "WaiverPriority_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameCompletionEvidence" ADD CONSTRAINT "GameCompletionEvidence_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_faabAccountId_fkey" FOREIGN KEY ("faabAccountId") REFERENCES "FaabAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve legacy balances as explicitly labeled compatibility openings. New
-- mutations use the immutable ledger and keep the old columns as read mirrors.
INSERT INTO "FaabAccount" ("leagueId", "teamId", "scope", "leagueSportId", "openingBalance", "balance", "reserved")
SELECT r."leagueId", r."teamId", 'SPORT', r."leagueSportId", r."faabRemaining", r."faabRemaining",
       LEAST(r."faabRemaining", COALESCE((SELECT SUM(w."bid") FROM "WaiverClaim" w WHERE w."rosterId" = r."id" AND w."status" = 'PENDING'), 0))
FROM "FantasyRoster" r;

UPDATE "WaiverClaim" w SET "faabAccountId" = a."id"
FROM "FaabAccount" a
WHERE a."scope" = 'SPORT' AND a."leagueSportId" = w."leagueSportId" AND a."teamId" = w."teamId";

INSERT INTO "FaabLedgerEntry" ("accountId", "type", "balanceDelta", "reservedDelta", "balanceAfter", "reservedAfter", "reason", "idempotencyKey")
SELECT a."id", 'OPENING', a."openingBalance", a."reserved", a."balance", a."reserved",
       'M4.3 compatibility opening from the persisted sport FAAB balance.', 'faab-opening:' || a."id"::text
FROM "FaabAccount" a;

INSERT INTO "WaiverPriority" ("leagueId", "leagueSportId", "teamId", "rank")
SELECT ls."leagueId", ls."id", t."id",
       row_number() OVER (PARTITION BY ls."id" ORDER BY t."draftSlot" DESC NULLS LAST, t."id")
FROM "LeagueSport" ls
JOIN "FantasyTeam" t ON t."leagueId" = ls."leagueId";

CREATE TRIGGER "FaabLedgerEntry_append_only"
  BEFORE UPDATE OR DELETE ON "FaabLedgerEntry"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only_direct();

CREATE TRIGGER "GameCompletionEvidence_append_only"
  BEFORE UPDATE OR DELETE ON "GameCompletionEvidence"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only_direct();
