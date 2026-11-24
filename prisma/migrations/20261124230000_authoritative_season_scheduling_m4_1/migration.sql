CREATE TYPE "CompetitionType" AS ENUM ('HEAD_TO_HEAD', 'CUMULATIVE');
CREATE TYPE "ScheduleDataStatus" AS ENUM ('PENDING_DATA', 'AVAILABLE', 'INCOMPLETE', 'UNAVAILABLE');
CREATE TYPE "ChampionshipCycleStatus" AS ENUM ('PLANNING', 'ACTIVE', 'COMPLETE');
CREATE TYPE "LeagueSportSeasonStatus" AS ENUM ('PENDING_DATA', 'PENDING_CONFIGURATION', 'ELIGIBLE', 'DRAFTING', 'ACTIVE', 'COMPLETE', 'ROLLED_OVER');

ALTER TABLE "League" ADD COLUMN "competitionType" "CompetitionType" NOT NULL DEFAULT 'HEAD_TO_HEAD';

CREATE TABLE "ProfessionalSeasonScheduleRevision" (
  "id" UUID NOT NULL,
  "seasonId" UUID NOT NULL,
  "status" "ScheduleDataStatus" NOT NULL,
  "provider" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
  "regularSeasonStartsAt" TIMESTAMPTZ(3),
  "regularSeasonEndsAt" TIMESTAMPTZ(3),
  "postseasonStartsAt" TIMESTAMPTZ(3),
  "postseasonEndsAt" TIMESTAMPTZ(3),
  "reason" TEXT,
  "sourceRecord" JSONB NOT NULL,
  "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfessionalSeasonScheduleRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProfessionalSeasonScheduleRevision_available_dates_check" CHECK (
    "status" <> 'AVAILABLE' OR ("regularSeasonStartsAt" IS NOT NULL AND "regularSeasonEndsAt" IS NOT NULL)
  ),
  CONSTRAINT "ProfessionalSeasonScheduleRevision_regular_order_check" CHECK (
    "regularSeasonStartsAt" IS NULL OR "regularSeasonEndsAt" IS NULL OR "regularSeasonStartsAt" < "regularSeasonEndsAt"
  ),
  CONSTRAINT "ProfessionalSeasonScheduleRevision_postseason_order_check" CHECK (
    "postseasonStartsAt" IS NULL OR "postseasonEndsAt" IS NULL OR "postseasonStartsAt" < "postseasonEndsAt"
  )
);

CREATE UNIQUE INDEX "ProfessionalSeasonScheduleRevision_seasonId_provider_contentHash_key" ON "ProfessionalSeasonScheduleRevision"("seasonId", "provider", "contentHash");
CREATE INDEX "ProfessionalSeasonScheduleRevision_seasonId_status_retrievedAt_idx" ON "ProfessionalSeasonScheduleRevision"("seasonId", "status", "retrievedAt");
ALTER TABLE "ProfessionalSeasonScheduleRevision" ADD CONSTRAINT "ProfessionalSeasonScheduleRevision_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ChampionshipCycle" (
  "id" UUID NOT NULL,
  "leagueId" UUID NOT NULL,
  "number" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "status" "ChampionshipCycleStatus" NOT NULL DEFAULT 'PLANNING',
  "startsAt" TIMESTAMPTZ(3),
  "endsAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChampionshipCycle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChampionshipCycle_dates_check" CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" < "endsAt")
);
CREATE UNIQUE INDEX "ChampionshipCycle_leagueId_number_key" ON "ChampionshipCycle"("leagueId", "number");
CREATE INDEX "ChampionshipCycle_leagueId_status_idx" ON "ChampionshipCycle"("leagueId", "status");
ALTER TABLE "ChampionshipCycle" ADD CONSTRAINT "ChampionshipCycle_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LeagueSportSeason" (
  "id" UUID NOT NULL,
  "leagueSportId" UUID NOT NULL,
  "seasonId" UUID NOT NULL,
  "championshipCycleId" UUID NOT NULL,
  "scheduleRevisionId" UUID,
  "status" "LeagueSportSeasonStatus" NOT NULL DEFAULT 'PENDING_DATA',
  "statusReason" TEXT,
  "draftDeadlineAt" TIMESTAMPTZ(3),
  "firstScoringAt" TIMESTAMPTZ(3),
  "scoringEndsAt" TIMESTAMPTZ(3),
  "playoffStartsAt" TIMESTAMPTZ(3),
  "playoffEndsAt" TIMESTAMPTZ(3),
  "tradeDeadlineAt" TIMESTAMPTZ(3),
  "rolloverEligibleAt" TIMESTAMPTZ(3),
  "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeagueSportSeason_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeagueSportSeason_scoring_dates_check" CHECK ("firstScoringAt" IS NULL OR "scoringEndsAt" IS NULL OR "firstScoringAt" < "scoringEndsAt")
);
CREATE UNIQUE INDEX "LeagueSportSeason_leagueSportId_seasonId_key" ON "LeagueSportSeason"("leagueSportId", "seasonId");
CREATE UNIQUE INDEX "LeagueSportSeason_leagueSportId_championshipCycleId_key" ON "LeagueSportSeason"("leagueSportId", "championshipCycleId");
CREATE INDEX "LeagueSportSeason_championshipCycleId_status_idx" ON "LeagueSportSeason"("championshipCycleId", "status");
CREATE INDEX "LeagueSportSeason_seasonId_status_idx" ON "LeagueSportSeason"("seasonId", "status");
ALTER TABLE "LeagueSportSeason" ADD CONSTRAINT "LeagueSportSeason_leagueSportId_fkey" FOREIGN KEY ("leagueSportId") REFERENCES "LeagueSport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeagueSportSeason" ADD CONSTRAINT "LeagueSportSeason_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeagueSportSeason" ADD CONSTRAINT "LeagueSportSeason_championshipCycleId_fkey" FOREIGN KEY ("championshipCycleId") REFERENCES "ChampionshipCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeagueSportSeason" ADD CONSTRAINT "LeagueSportSeason_scheduleRevisionId_fkey" FOREIGN KEY ("scheduleRevisionId") REFERENCES "ProfessionalSeasonScheduleRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "LeagueGameAssignment" (
  "id" UUID NOT NULL,
  "leagueId" UUID NOT NULL,
  "leagueSportSeasonId" UUID NOT NULL,
  "championshipCycleId" UUID NOT NULL,
  "gameId" UUID NOT NULL,
  "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeagueGameAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LeagueGameAssignment_leagueId_gameId_key" ON "LeagueGameAssignment"("leagueId", "gameId");
CREATE INDEX "LeagueGameAssignment_leagueSportSeasonId_gameId_idx" ON "LeagueGameAssignment"("leagueSportSeasonId", "gameId");
CREATE INDEX "LeagueGameAssignment_championshipCycleId_idx" ON "LeagueGameAssignment"("championshipCycleId");
ALTER TABLE "LeagueGameAssignment" ADD CONSTRAINT "LeagueGameAssignment_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeagueGameAssignment" ADD CONSTRAINT "LeagueGameAssignment_leagueSportSeasonId_fkey" FOREIGN KEY ("leagueSportSeasonId") REFERENCES "LeagueSportSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeagueGameAssignment" ADD CONSTRAINT "LeagueGameAssignment_championshipCycleId_fkey" FOREIGN KEY ("championshipCycleId") REFERENCES "ChampionshipCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeagueGameAssignment" ADD CONSTRAINT "LeagueGameAssignment_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing leagues retain their current season pointer but are explicitly marked as waiting for authoritative schedule data.
INSERT INTO "ChampionshipCycle" ("id", "leagueId", "number", "label", "status")
SELECT gen_random_uuid(), "id", 1, 'Cycle 1', 'PLANNING' FROM "League";

INSERT INTO "LeagueSportSeason" ("id", "leagueSportId", "seasonId", "championshipCycleId", "status", "statusReason")
SELECT gen_random_uuid(), ls."id", ls."seasonId", cycle."id", 'PENDING_DATA',
       'Awaiting a source-backed professional season schedule.'
FROM "LeagueSport" ls
JOIN "ChampionshipCycle" cycle ON cycle."leagueId" = ls."leagueId" AND cycle."number" = 1;

CREATE TRIGGER "ProfessionalSeasonScheduleRevision_append_only"
  BEFORE UPDATE OR DELETE ON "ProfessionalSeasonScheduleRevision"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only();
