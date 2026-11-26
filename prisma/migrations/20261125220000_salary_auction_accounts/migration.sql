-- CreateTable
CREATE TABLE "LeagueFinancePolicy" (
    "leagueId" UUID NOT NULL,
    "salaryMode" BOOLEAN NOT NULL,
    "scope" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "LeagueFinancePolicy_pkey" PRIMARY KEY ("leagueId")
);

-- CreateTable
CREATE TABLE "FinanceAccount" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "leagueSportId" UUID,
    "seasonId" UUID,
    "cycleId" UUID,
    "kind" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "baseCap" INTEGER NOT NULL,
    "capAdjustment" INTEGER NOT NULL DEFAULT 0,
    "payroll" INTEGER NOT NULL DEFAULT 0,
    "deadCap" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceLedgerEntry" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "capDelta" INTEGER NOT NULL DEFAULT 0,
    "payrollDelta" INTEGER NOT NULL DEFAULT 0,
    "deadDelta" INTEGER NOT NULL DEFAULT 0,
    "reservedDelta" INTEGER NOT NULL DEFAULT 0,
    "availableAfter" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "actorUserId" UUID,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerSalary" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PlayerSalary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadCapObligation" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "releaseSalary" INTEGER NOT NULL,
    "releasedAt" TIMESTAMPTZ(3) NOT NULL,
    "clearedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DeadCapObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleasedPlayerFloor" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "ReleasedPlayerFloor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcquisitionAuction" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "leagueSportId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "nominatorTeamId" UUID NOT NULL,
    "draftId" UUID,
    "mode" TEXT NOT NULL,
    "priority" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "minimum" INTEGER NOT NULL,
    "opensAt" TIMESTAMPTZ(3) NOT NULL,
    "closesAt" TIMESTAMPTZ(3) NOT NULL,
    "winnerTeamId" UUID,
    "price" INTEGER,
    "settledAt" TIMESTAMPTZ(3),

    CONSTRAINT "AcquisitionAuction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcquisitionBid" (
    "id" UUID NOT NULL,
    "auctionId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "maximum" INTEGER NOT NULL,
    "reservation" INTEGER NOT NULL,
    "tieRank" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcquisitionBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceAccount_leagueId_scopeKey_idx" ON "FinanceAccount"("leagueId", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccount_teamId_kind_scopeKey_key" ON "FinanceAccount"("teamId", "kind", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceLedgerEntry_idempotencyKey_key" ON "FinanceLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FinanceLedgerEntry_accountId_createdAt_idx" ON "FinanceLedgerEntry"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "PlayerSalary_teamId_active_idx" ON "PlayerSalary"("teamId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerSalary_leagueId_playerId_key" ON "PlayerSalary"("leagueId", "playerId");

-- CreateIndex
CREATE INDEX "DeadCapObligation_accountId_playerId_releasedAt_idx" ON "DeadCapObligation"("accountId", "playerId", "releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReleasedPlayerFloor_leagueId_playerId_key" ON "ReleasedPlayerFloor"("leagueId", "playerId");

-- CreateIndex
CREATE INDEX "AcquisitionAuction_status_closesAt_idx" ON "AcquisitionAuction"("status", "closesAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcquisitionBid_auctionId_teamId_key" ON "AcquisitionBid"("auctionId", "teamId");

-- AddForeignKey
ALTER TABLE "LeagueFinancePolicy" ADD CONSTRAINT "LeagueFinancePolicy_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_leagueSportId_fkey" FOREIGN KEY ("leagueSportId") REFERENCES "LeagueSport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLedgerEntry" ADD CONSTRAINT "FinanceLedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSalary" ADD CONSTRAINT "PlayerSalary_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSalary" ADD CONSTRAINT "PlayerSalary_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSalary" ADD CONSTRAINT "PlayerSalary_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSalary" ADD CONSTRAINT "PlayerSalary_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadCapObligation" ADD CONSTRAINT "DeadCapObligation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadCapObligation" ADD CONSTRAINT "DeadCapObligation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleasedPlayerFloor" ADD CONSTRAINT "ReleasedPlayerFloor_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleasedPlayerFloor" ADD CONSTRAINT "ReleasedPlayerFloor_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionAuction" ADD CONSTRAINT "AcquisitionAuction_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionAuction" ADD CONSTRAINT "AcquisitionAuction_leagueSportId_fkey" FOREIGN KEY ("leagueSportId") REFERENCES "LeagueSport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionAuction" ADD CONSTRAINT "AcquisitionAuction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionAuction" ADD CONSTRAINT "AcquisitionAuction_nominatorTeamId_fkey" FOREIGN KEY ("nominatorTeamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionAuction" ADD CONSTRAINT "AcquisitionAuction_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionBid" ADD CONSTRAINT "AcquisitionBid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "AcquisitionAuction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionBid" ADD CONSTRAINT "AcquisitionBid_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionBid" ADD CONSTRAINT "AcquisitionBid_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "LeagueFinancePolicy" ADD CONSTRAINT "FinancePolicy_values" CHECK (scope IN ('SPORT','UNIVERSAL') AND amount BETWEEN 1 AND 1000000);
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_values" CHECK (kind IN ('SALARY','DRAFT') AND status IN ('ACTIVE','EXPIRED') AND "baseCap" BETWEEN 1 AND 1000000 AND payroll>=0 AND "deadCap">=0 AND reserved>=0);
ALTER TABLE "PlayerSalary" ADD CONSTRAINT "PlayerSalary_values" CHECK (amount>0 AND version>0);
ALTER TABLE "ReleasedPlayerFloor" ADD CONSTRAINT "ReleasedPlayerFloor_positive" CHECK (amount>0);
ALTER TABLE "DeadCapObligation" ADD CONSTRAINT "DeadCapObligation_penalty" CHECK ("releaseSalary">0 AND amount=("releaseSalary"+1)/2);
ALTER TABLE "AcquisitionAuction" ADD CONSTRAINT "AcquisitionAuction_values" CHECK (mode IN ('ENGLISH','VICKREY') AND status IN ('OPEN','SETTLED','CANCELLED','EXPIRED') AND minimum>0 AND "closesAt">"opensAt" AND (price IS NULL OR price>=minimum));
ALTER TABLE "AcquisitionBid" ADD CONSTRAINT "AcquisitionBid_values" CHECK (maximum>0 AND reservation>=0 AND reservation<=maximum AND "tieRank">0 AND version>0);
CREATE UNIQUE INDEX "AcquisitionAuction_active_player" ON "AcquisitionAuction"("leagueId","playerId") WHERE status='OPEN';
CREATE UNIQUE INDEX "AcquisitionAuction_active_draft" ON "AcquisitionAuction"("draftId") WHERE status='OPEN' AND "draftId" IS NOT NULL;
CREATE UNIQUE INDEX "DeadCapObligation_active_player" ON "DeadCapObligation"("accountId","playerId") WHERE "clearedAt" IS NULL;
CREATE TRIGGER "FinanceLedgerEntry_append_only" BEFORE UPDATE OR DELETE ON "FinanceLedgerEntry" FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only_direct();
CREATE FUNCTION fantasy_floor_can_only_decrease() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.amount>OLD.amount THEN RAISE EXCEPTION 'Released-player acquisition floor can only decrease' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ReleasedPlayerFloor_decreasing" BEFORE UPDATE ON "ReleasedPlayerFloor" FOR EACH ROW EXECUTE FUNCTION fantasy_floor_can_only_decrease();
CREATE FUNCTION fantasy_validate_finance_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "FantasyTeam" t WHERE t.id=NEW."teamId" AND t."leagueId"=NEW."leagueId")
 OR (NEW."leagueSportId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "LeagueSport" s JOIN "Season" y ON y.id=NEW."seasonId" AND y.sport=s.sport WHERE s.id=NEW."leagueSportId" AND s."leagueId"=NEW."leagueId"))
 OR (NEW."cycleId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ChampionshipCycle" c WHERE c.id=NEW."cycleId" AND c."leagueId"=NEW."leagueId"))
 THEN RAISE EXCEPTION 'Financial account scope mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "FinanceAccount_scope" BEFORE INSERT OR UPDATE ON "FinanceAccount" FOR EACH ROW EXECUTE FUNCTION fantasy_validate_finance_account();
CREATE OR REPLACE FUNCTION fantasy_validate_future_pick() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "LeagueSport" sport JOIN "League" league ON league.id=sport."leagueId"
 JOIN "FantasyTeam" original ON original.id=NEW."originalTeamId" AND original."leagueId"=league.id
 JOIN "FantasyTeam" owner ON owner.id=NEW."ownerTeamId" AND owner."leagueId"=league.id
 WHERE sport.id=NEW."leagueSportId" AND league.format='DYNASTY'
 AND NOT EXISTS (SELECT 1 FROM "LeagueFinancePolicy" policy WHERE policy."leagueId"=league.id AND policy."salaryMode"))
 THEN RAISE EXCEPTION 'Future picks require a dynasty league in traditional mode and franchises in that league' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
