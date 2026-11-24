-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('PROPOSER', 'RECIPIENT');

-- AlterEnum
ALTER TYPE "DraftStatus" ADD VALUE 'PAUSED';

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'TRADE';

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "pausedAt" TIMESTAMPTZ(3),
ADD COLUMN     "pickStartedAt" TIMESTAMPTZ(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "playoffPeriods" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "playoffTeams" INTEGER NOT NULL DEFAULT 4;

-- AlterTable
ALTER TABLE "Matchup" ADD COLUMN     "isPlayoff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "playoffRound" INTEGER;

-- CreateTable
CREATE TABLE "Trade" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "proposerTeamId" UUID NOT NULL,
    "recipientTeamId" UUID NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMPTZ(3),
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeAsset" (
    "id" UUID NOT NULL,
    "tradeId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "side" "TradeSide" NOT NULL,

    CONSTRAINT "TradeAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "BackgroundJobRun" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "result" JSONB,

    CONSTRAINT "BackgroundJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trade_leagueId_status_createdAt_idx" ON "Trade"("leagueId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Trade_recipientTeamId_status_idx" ON "Trade"("recipientTeamId", "status");

-- CreateIndex
CREATE INDEX "Trade_proposerTeamId_status_idx" ON "Trade"("proposerTeamId", "status");

-- CreateIndex
CREATE INDEX "TradeAsset_teamId_playerId_idx" ON "TradeAsset"("teamId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeAsset_tradeId_playerId_key" ON "TradeAsset"("tradeId", "playerId");

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundJobRun_key_key" ON "BackgroundJobRun"("key");

-- CreateIndex
CREATE INDEX "BackgroundJobRun_jobType_startedAt_idx" ON "BackgroundJobRun"("jobType", "startedAt");

-- CreateIndex
CREATE INDEX "Draft_status_pickStartedAt_idx" ON "Draft"("status", "pickStartedAt");

-- CreateIndex
CREATE INDEX "FantasyTeam_leagueId_isComputer_idx" ON "FantasyTeam"("leagueId", "isComputer");

-- CreateIndex
CREATE INDEX "League_status_primarySport_idx" ON "League"("status", "primarySport");

-- CreateIndex
CREATE INDEX "LeagueMember_leagueId_role_idx" ON "LeagueMember"("leagueId", "role");

-- CreateIndex
CREATE INDEX "Matchup_leagueId_isPlayoff_playoffRound_idx" ON "Matchup"("leagueId", "isPlayoff", "playoffRound");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_proposerTeamId_fkey" FOREIGN KEY ("proposerTeamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_recipientTeamId_fkey" FOREIGN KEY ("recipientTeamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAsset" ADD CONSTRAINT "TradeAsset_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAsset" ADD CONSTRAINT "TradeAsset_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAsset" ADD CONSTRAINT "TradeAsset_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
