-- CreateEnum
CREATE TYPE "LeagueStatus" AS ENUM ('SETUP', 'DRAFTING', 'ACTIVE', 'COMPLETE');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETE');

-- CreateEnum
CREATE TYPE "WaiverStatus" AS ENUM ('PENDING', 'WON', 'LOST', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MatchupStatus" AS ENUM ('SCHEDULED', 'FINAL');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DRAFT', 'ADD', 'DROP', 'WAIVER', 'COMMISSIONER');

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "benchSlots" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "currentPeriod" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "draftRounds" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "isHistorical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "primarySport" "Sport",
ADD COLUMN     "rosterSlots" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "seasonYear" INTEGER NOT NULL DEFAULT 2026,
ADD COLUMN     "startingFaab" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "status" "LeagueStatus" NOT NULL DEFAULT 'SETUP';

-- CreateTable
CREATE TABLE "LeagueInvitation" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyTeam" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "managerId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "draftSlot" INTEGER,
    "faabRemaining" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FantasyTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterEntry" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "slot" TEXT NOT NULL,
    "acquiredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(3),

    CONSTRAINT "RosterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'SCHEDULED',
    "rounds" INTEGER NOT NULL,
    "secondsPerPick" INTEGER NOT NULL DEFAULT 90,
    "currentPick" INTEGER NOT NULL DEFAULT 1,
    "order" TEXT[],
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftPick" (
    "id" UUID NOT NULL,
    "draftId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "overall" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "roundPick" INTEGER NOT NULL,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "pickedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftQueueEntry" (
    "id" UUID NOT NULL,
    "draftId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftQueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringPeriod" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "finalizedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ScoringPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matchup" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "homeTeamId" UUID NOT NULL,
    "awayTeamId" UUID NOT NULL,
    "homeTenths" BIGINT NOT NULL DEFAULT 0,
    "awayTenths" BIGINT NOT NULL DEFAULT 0,
    "status" "MatchupStatus" NOT NULL DEFAULT 'SCHEDULED',
    "calculatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Matchup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaiverClaim" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "addPlayerId" UUID NOT NULL,
    "dropPlayerId" UUID,
    "bid" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL,
    "processAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "WaiverStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WaiverClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyTransaction" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "playerId" UUID,
    "relatedPlayerId" UUID,
    "amount" INTEGER,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FantasyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeagueInvitation_tokenHash_key" ON "LeagueInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "LeagueInvitation_leagueId_expiresAt_idx" ON "LeagueInvitation"("leagueId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyTeam_membershipId_key" ON "FantasyTeam"("membershipId");

-- CreateIndex
CREATE INDEX "FantasyTeam_managerId_idx" ON "FantasyTeam"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyTeam_leagueId_managerId_key" ON "FantasyTeam"("leagueId", "managerId");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyTeam_leagueId_name_key" ON "FantasyTeam"("leagueId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyTeam_leagueId_draftSlot_key" ON "FantasyTeam"("leagueId", "draftSlot");

-- CreateIndex
CREATE INDEX "RosterEntry_teamId_slot_idx" ON "RosterEntry"("teamId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "RosterEntry_leagueId_playerId_key" ON "RosterEntry"("leagueId", "playerId");

-- CreateIndex
CREATE INDEX "Draft_leagueId_status_idx" ON "Draft"("leagueId", "status");

-- CreateIndex
CREATE INDEX "DraftPick_teamId_idx" ON "DraftPick"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftId_overall_key" ON "DraftPick"("draftId", "overall");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftId_playerId_key" ON "DraftPick"("draftId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftQueueEntry_draftId_teamId_playerId_key" ON "DraftQueueEntry"("draftId", "teamId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftQueueEntry_draftId_teamId_rank_key" ON "DraftQueueEntry"("draftId", "teamId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringPeriod_leagueId_number_key" ON "ScoringPeriod"("leagueId", "number");

-- CreateIndex
CREATE INDEX "Matchup_leagueId_status_idx" ON "Matchup"("leagueId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Matchup_periodId_homeTeamId_key" ON "Matchup"("periodId", "homeTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "Matchup_periodId_awayTeamId_key" ON "Matchup"("periodId", "awayTeamId");

-- CreateIndex
CREATE INDEX "WaiverClaim_leagueId_processAt_status_idx" ON "WaiverClaim"("leagueId", "processAt", "status");

-- CreateIndex
CREATE INDEX "WaiverClaim_teamId_status_idx" ON "WaiverClaim"("teamId", "status");

-- CreateIndex
CREATE INDEX "FantasyTransaction_leagueId_createdAt_idx" ON "FantasyTransaction"("leagueId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeagueInvitation" ADD CONSTRAINT "LeagueInvitation_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueInvitation" ADD CONSTRAINT "LeagueInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "LeagueMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftQueueEntry" ADD CONSTRAINT "DraftQueueEntry_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftQueueEntry" ADD CONSTRAINT "DraftQueueEntry_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftQueueEntry" ADD CONSTRAINT "DraftQueueEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringPeriod" ADD CONSTRAINT "ScoringPeriod_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ScoringPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matchup" ADD CONSTRAINT "Matchup_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_addPlayerId_fkey" FOREIGN KEY ("addPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_dropPlayerId_fkey" FOREIGN KEY ("dropPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTransaction" ADD CONSTRAINT "FantasyTransaction_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTransaction" ADD CONSTRAINT "FantasyTransaction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTransaction" ADD CONSTRAINT "FantasyTransaction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTransaction" ADD CONSTRAINT "FantasyTransaction_relatedPlayerId_fkey" FOREIGN KEY ("relatedPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
