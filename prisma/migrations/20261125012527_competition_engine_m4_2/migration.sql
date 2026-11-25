-- CreateEnum
CREATE TYPE "CompetitiveState" AS ENUM ('PENDING_DATA', 'UPCOMING', 'ACTIVE', 'PROVISIONAL', 'FINALIZED');

-- CreateEnum
CREATE TYPE "CompetitionPeriodType" AS ENUM ('REGULAR', 'PLAYOFF', 'CONSOLATION');

-- CreateEnum
CREATE TYPE "ChampionshipAwardType" AS ENUM ('BASE_PLACEMENT', 'PLAYOFF_QUALIFICATION', 'SPORT_CHAMPION', 'SPORT_RUNNER_UP', 'SPORT_THIRD_PLACE', 'HIGHEST_REGULAR_PF', 'LOWEST_REGULAR_PF');

-- AlterTable
ALTER TABLE "Matchup" ADD COLUMN     "awaySeed" INTEGER,
ADD COLUMN     "bracketSlot" TEXT,
ADD COLUMN     "finalizedAt" TIMESTAMPTZ(3),
ADD COLUMN     "homeSeed" INTEGER,
ADD COLUMN     "resultFinalizesAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ScoringPeriod" ADD COLUMN     "competitionId" UUID,
ADD COLUMN     "periodType" "CompetitionPeriodType" NOT NULL DEFAULT 'REGULAR';

-- CreateTable
CREATE TABLE "CompetitionConfigSnapshot" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "championshipCycleId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "competitionType" "CompetitionType" NOT NULL,
    "playoffTeams" INTEGER NOT NULL,
    "playoffWeeks" INTEGER NOT NULL,
    "fixedBracket" BOOLEAN NOT NULL DEFAULT true,
    "thirdPlaceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "consolationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "qualificationPoints" INTEGER NOT NULL DEFAULT 1,
    "championPoints" INTEGER NOT NULL DEFAULT 5,
    "runnerUpPoints" INTEGER NOT NULL DEFAULT 2,
    "thirdPlacePoints" INTEGER NOT NULL DEFAULT 1,
    "highestPfPoints" INTEGER NOT NULL DEFAULT 3,
    "lowestPfPoints" INTEGER NOT NULL DEFAULT -3,
    "standingsTiebreakers" TEXT[],
    "playoffTiebreakers" TEXT[],
    "overallTiebreakers" TEXT[],
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CompetitionConfigSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportCompetition" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "leagueSportSeasonId" UUID NOT NULL,
    "configSnapshotId" UUID NOT NULL,
    "sport" "Sport" NOT NULL,
    "status" "CompetitiveState" NOT NULL DEFAULT 'PENDING_DATA',
    "statusReason" TEXT,
    "regularSeasonStartsAt" TIMESTAMPTZ(3),
    "regularSeasonEndsAt" TIMESTAMPTZ(3),
    "fantasyPlayoffStartsAt" TIMESTAMPTZ(3),
    "fantasyPlayoffEndsAt" TIMESTAMPTZ(3),
    "provisionallyCompleteAt" TIMESTAMPTZ(3),
    "finalizedAt" TIMESTAMPTZ(3),

    CONSTRAINT "SportCompetition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchupResultRevision" (
    "id" UUID NOT NULL,
    "matchupId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "homeTenths" BIGINT NOT NULL,
    "awayTenths" BIGINT NOT NULL,
    "calculatedAt" TIMESTAMPTZ(3) NOT NULL,
    "finalizesAt" TIMESTAMPTZ(3) NOT NULL,
    "correctionReason" TEXT,
    "finalizedAt" TIMESTAMPTZ(3),

    CONSTRAINT "MatchupResultRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportFinalPlacement" (
    "id" UUID NOT NULL,
    "sportCompetitionId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "placement" INTEGER NOT NULL,
    "qualifiedForPlayoffs" BOOLEAN NOT NULL DEFAULT false,
    "initialSeed" INTEGER,
    "regularPfTenths" BIGINT NOT NULL DEFAULT 0,
    "regularPaTenths" BIGINT NOT NULL DEFAULT 0,
    "finalizedAt" TIMESTAMPTZ(3),

    CONSTRAINT "SportFinalPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChampionshipPointAward" (
    "id" UUID NOT NULL,
    "sportCompetitionId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "awardType" "ChampionshipAwardType" NOT NULL,
    "pointsNumerator" INTEGER NOT NULL,
    "pointsDenominator" INTEGER NOT NULL DEFAULT 1,
    "projected" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ChampionshipPointAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChampionshipResult" (
    "id" UUID NOT NULL,
    "championshipCycleId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "pointsNumerator" INTEGER NOT NULL DEFAULT 0,
    "pointsDenominator" INTEGER NOT NULL DEFAULT 1,
    "combinedUbpTenths" BIGINT NOT NULL DEFAULT 0,
    "sportChampionships" INTEGER NOT NULL DEFAULT 0,
    "runnerUpFinishes" INTEGER NOT NULL DEFAULT 0,
    "thirdPlaceFinishes" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "projected" BOOLEAN NOT NULL DEFAULT true,
    "finalizedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ChampionshipResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitiveTiebreakerEvent" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "drawRank" INTEGER NOT NULL,
    "randomToken" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitiveTiebreakerEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompetitionPeriodGame" (
    "id" UUID NOT NULL,
    "sportCompetitionId" UUID NOT NULL,
    "scoringPeriodId" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    CONSTRAINT "CompetitionPeriodGame_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitionConfigSnapshot_leagueId_createdAt_idx" ON "CompetitionConfigSnapshot"("leagueId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionConfigSnapshot_championshipCycleId_version_key" ON "CompetitionConfigSnapshot"("championshipCycleId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionConfigSnapshot_championshipCycleId_contentHash_key" ON "CompetitionConfigSnapshot"("championshipCycleId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "SportCompetition_leagueSportSeasonId_key" ON "SportCompetition"("leagueSportSeasonId");

-- CreateIndex
CREATE INDEX "SportCompetition_leagueId_sport_status_idx" ON "SportCompetition"("leagueId", "sport", "status");

-- CreateIndex
CREATE INDEX "SportCompetition_configSnapshotId_status_idx" ON "SportCompetition"("configSnapshotId", "status");

-- CreateIndex
CREATE INDEX "MatchupResultRevision_finalizesAt_finalizedAt_idx" ON "MatchupResultRevision"("finalizesAt", "finalizedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchupResultRevision_matchupId_revision_key" ON "MatchupResultRevision"("matchupId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "SportFinalPlacement_sportCompetitionId_teamId_key" ON "SportFinalPlacement"("sportCompetitionId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "SportFinalPlacement_sportCompetitionId_placement_key" ON "SportFinalPlacement"("sportCompetitionId", "placement");

-- CreateIndex
CREATE INDEX "ChampionshipPointAward_teamId_projected_idx" ON "ChampionshipPointAward"("teamId", "projected");

-- CreateIndex
CREATE UNIQUE INDEX "ChampionshipPointAward_sportCompetitionId_teamId_awardType_key" ON "ChampionshipPointAward"("sportCompetitionId", "teamId", "awardType");

-- CreateIndex
CREATE INDEX "ChampionshipResult_championshipCycleId_rank_idx" ON "ChampionshipResult"("championshipCycleId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "ChampionshipResult_championshipCycleId_teamId_key" ON "ChampionshipResult"("championshipCycleId", "teamId");

-- CreateIndex
CREATE INDEX "CompetitiveTiebreakerEvent_leagueId_createdAt_idx" ON "CompetitiveTiebreakerEvent"("leagueId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitiveTiebreakerEvent_scopeType_scopeId_teamId_key" ON "CompetitiveTiebreakerEvent"("scopeType", "scopeId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitiveTiebreakerEvent_scopeType_scopeId_drawRank_key" ON "CompetitiveTiebreakerEvent"("scopeType", "scopeId", "drawRank");
CREATE UNIQUE INDEX "CompetitionPeriodGame_sportCompetitionId_gameId_key" ON "CompetitionPeriodGame"("sportCompetitionId", "gameId");
CREATE UNIQUE INDEX "CompetitionPeriodGame_scoringPeriodId_gameId_key" ON "CompetitionPeriodGame"("scoringPeriodId", "gameId");
CREATE INDEX "CompetitionPeriodGame_gameId_idx" ON "CompetitionPeriodGame"("gameId");

-- CreateIndex
CREATE INDEX "ScoringPeriod_competitionId_periodType_number_idx" ON "ScoringPeriod"("competitionId", "periodType", "number");

-- AddForeignKey
ALTER TABLE "ScoringPeriod" ADD CONSTRAINT "ScoringPeriod_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "SportCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionConfigSnapshot" ADD CONSTRAINT "CompetitionConfigSnapshot_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionConfigSnapshot" ADD CONSTRAINT "CompetitionConfigSnapshot_championshipCycleId_fkey" FOREIGN KEY ("championshipCycleId") REFERENCES "ChampionshipCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportCompetition" ADD CONSTRAINT "SportCompetition_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportCompetition" ADD CONSTRAINT "SportCompetition_leagueSportSeasonId_fkey" FOREIGN KEY ("leagueSportSeasonId") REFERENCES "LeagueSportSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportCompetition" ADD CONSTRAINT "SportCompetition_configSnapshotId_fkey" FOREIGN KEY ("configSnapshotId") REFERENCES "CompetitionConfigSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchupResultRevision" ADD CONSTRAINT "MatchupResultRevision_matchupId_fkey" FOREIGN KEY ("matchupId") REFERENCES "Matchup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportFinalPlacement" ADD CONSTRAINT "SportFinalPlacement_sportCompetitionId_fkey" FOREIGN KEY ("sportCompetitionId") REFERENCES "SportCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportFinalPlacement" ADD CONSTRAINT "SportFinalPlacement_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChampionshipPointAward" ADD CONSTRAINT "ChampionshipPointAward_sportCompetitionId_fkey" FOREIGN KEY ("sportCompetitionId") REFERENCES "SportCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChampionshipPointAward" ADD CONSTRAINT "ChampionshipPointAward_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChampionshipResult" ADD CONSTRAINT "ChampionshipResult_championshipCycleId_fkey" FOREIGN KEY ("championshipCycleId") REFERENCES "ChampionshipCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChampionshipResult" ADD CONSTRAINT "ChampionshipResult_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitiveTiebreakerEvent" ADD CONSTRAINT "CompetitiveTiebreakerEvent_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitiveTiebreakerEvent" ADD CONSTRAINT "CompetitiveTiebreakerEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionPeriodGame" ADD CONSTRAINT "CompetitionPeriodGame_sportCompetitionId_fkey" FOREIGN KEY ("sportCompetitionId") REFERENCES "SportCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionPeriodGame" ADD CONSTRAINT "CompetitionPeriodGame_scoringPeriodId_fkey" FOREIGN KEY ("scoringPeriodId") REFERENCES "ScoringPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionPeriodGame" ADD CONSTRAINT "CompetitionPeriodGame_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChampionshipPointAward" ADD CONSTRAINT "ChampionshipPointAward_denominator_check" CHECK ("pointsDenominator" > 0);
ALTER TABLE "ChampionshipResult" ADD CONSTRAINT "ChampionshipResult_denominator_check" CHECK ("pointsDenominator" > 0);
ALTER TABLE "SportFinalPlacement" ADD CONSTRAINT "SportFinalPlacement_placement_check" CHECK ("placement" > 0);

-- Existing leagues receive an immutable configuration snapshot matching their current settings.
INSERT INTO "CompetitionConfigSnapshot" (
  "id", "leagueId", "championshipCycleId", "version", "competitionType", "playoffTeams", "playoffWeeks",
  "standingsTiebreakers", "playoffTiebreakers", "overallTiebreakers", "contentHash"
)
SELECT gen_random_uuid(), cycle."leagueId", cycle."id", 1, league."competitionType",
  CASE WHEN league."competitionType" = 'CUMULATIVE' THEN 0 ELSE league."playoffTeams" END,
  CASE WHEN league."competitionType" = 'CUMULATIVE' THEN 0 ELSE league."playoffPeriods" END,
  ARRAY['RECORD','REGULAR_PF','HEAD_TO_HEAD','REGULAR_PA','RECORDED_DRAW'],
  ARRAY['MATCHUP_UBP','HEAD_TO_HEAD','REGULAR_PF','ORIGINAL_SEED'],
  CASE WHEN league."competitionType" = 'CUMULATIVE'
    THEN ARRAY['COMBINED_UBP','FIRST_PLACE_FINISHES','SECOND_PLACE_FINISHES','THIRD_PLACE_FINISHES','RECORDED_DRAW']
    ELSE ARRAY['CHAMPIONSHIP_POINTS','COMBINED_UBP','SPORT_CHAMPIONSHIPS','RUNNER_UP_FINISHES','THIRD_PLACE_FINISHES','RECORDED_DRAW'] END,
  md5(cycle."id"::text || ':competition-v1')
FROM "ChampionshipCycle" cycle
JOIN "League" league ON league."id" = cycle."leagueId";

INSERT INTO "SportCompetition" (
  "id", "leagueId", "leagueSportSeasonId", "configSnapshotId", "sport", "status", "statusReason",
  "regularSeasonStartsAt", "regularSeasonEndsAt"
)
SELECT gen_random_uuid(), ls."leagueId", assignment."id", config."id", ls."sport", 'PENDING_DATA',
  'Authoritative UTC professional game schedule is required before competition periods can be generated.',
  assignment."firstScoringAt", assignment."scoringEndsAt"
FROM "LeagueSportSeason" assignment
JOIN "LeagueSport" ls ON ls."id" = assignment."leagueSportId"
JOIN "CompetitionConfigSnapshot" config ON config."championshipCycleId" = assignment."championshipCycleId" AND config."version" = 1;

CREATE TRIGGER "CompetitionConfigSnapshot_append_only"
  BEFORE UPDATE ON "CompetitionConfigSnapshot"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only();
CREATE TRIGGER "MatchupResultRevision_append_only"
  BEFORE UPDATE ON "MatchupResultRevision"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only();
CREATE TRIGGER "CompetitiveTiebreakerEvent_append_only"
  BEFORE UPDATE ON "CompetitiveTiebreakerEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only();
