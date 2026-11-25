-- CreateEnum
CREATE TYPE "ScheduleCrosswalkStatus" AS ENUM ('MATCHED', 'UNRESOLVED', 'AMBIGUOUS');

-- CreateTable
CREATE TABLE "ScheduleImportBatch" (
    "id" UUID NOT NULL,
    "importerVersion" TEXT NOT NULL,
    "bundleHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceManifest" JSONB NOT NULL,
    "scheduleRows" INTEGER NOT NULL DEFAULT 0,
    "calendarRows" INTEGER NOT NULL DEFAULT 0,
    "teamRows" INTEGER NOT NULL DEFAULT 0,
    "crosswalkRows" INTEGER NOT NULL DEFAULT 0,
    "unresolvedRows" INTEGER NOT NULL DEFAULT 0,
    "missingStartRows" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ScheduleImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameScheduleObservation" (
    "id" UUID NOT NULL,
    "importBatchId" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "sport" "Sport" NOT NULL,
    "scheduleProvider" TEXT NOT NULL,
    "scheduleExternalId" TEXT NOT NULL,
    "gameKey" TEXT NOT NULL,
    "phase" "GamePhase" NOT NULL,
    "gameDate" DATE NOT NULL,
    "startsAt" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sourceRecord" JSONB NOT NULL,
    "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameScheduleObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonCalendarObservation" (
    "id" UUID NOT NULL,
    "importBatchId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "firstGameDate" DATE NOT NULL,
    "lastGameDate" DATE NOT NULL,
    "firstKnownStartAt" TIMESTAMPTZ(3),
    "lastKnownStartAt" TIMESTAMPTZ(3),
    "observedGames" INTEGER NOT NULL,
    "missingStartTimes" INTEGER NOT NULL,
    "independentlyVerified" BOOLEAN NOT NULL DEFAULT false,
    "sourceRecord" JSONB NOT NULL,
    "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonCalendarObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProTeamSeasonObservation" (
    "id" UUID NOT NULL,
    "importBatchId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "sourceTeamId" TEXT NOT NULL,
    "sourceTeamName" TEXT NOT NULL,
    "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProTeamSeasonObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalGameCrosswalk" (
    "id" UUID NOT NULL,
    "importBatchId" UUID NOT NULL,
    "sport" "Sport" NOT NULL,
    "archiveGameId" TEXT NOT NULL,
    "scheduleExternalId" TEXT,
    "gameKey" TEXT,
    "canonicalGameId" UUID,
    "status" "ScheduleCrosswalkStatus" NOT NULL,
    "reason" TEXT,
    "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalGameCrosswalk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleImportIssue" (
    "id" UUID NOT NULL,
    "importBatchId" UUID NOT NULL,
    "sport" "Sport",
    "code" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleImportIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleImportBatch_bundleHash_key" ON "ScheduleImportBatch"("bundleHash");

-- CreateIndex
CREATE INDEX "ScheduleImportBatch_status_startedAt_idx" ON "ScheduleImportBatch"("status", "startedAt");

-- CreateIndex
CREATE INDEX "GameScheduleObservation_gameId_retrievedAt_idx" ON "GameScheduleObservation"("gameId", "retrievedAt");

-- CreateIndex
CREATE INDEX "GameScheduleObservation_sport_startsAt_idx" ON "GameScheduleObservation"("sport", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameScheduleObservation_sport_scheduleProvider_scheduleExte_key" ON "GameScheduleObservation"("sport", "scheduleProvider", "scheduleExternalId", "contentHash");

-- CreateIndex
CREATE INDEX "SeasonCalendarObservation_seasonId_importedAt_idx" ON "SeasonCalendarObservation"("seasonId", "importedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonCalendarObservation_importBatchId_seasonId_key" ON "SeasonCalendarObservation"("importBatchId", "seasonId");

-- CreateIndex
CREATE INDEX "ProTeamSeasonObservation_seasonId_teamId_idx" ON "ProTeamSeasonObservation"("seasonId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ProTeamSeasonObservation_importBatchId_seasonId_sourceTeamI_key" ON "ProTeamSeasonObservation"("importBatchId", "seasonId", "sourceTeamId");

-- CreateIndex
CREATE INDEX "HistoricalGameCrosswalk_sport_scheduleExternalId_idx" ON "HistoricalGameCrosswalk"("sport", "scheduleExternalId");

-- CreateIndex
CREATE INDEX "HistoricalGameCrosswalk_canonicalGameId_idx" ON "HistoricalGameCrosswalk"("canonicalGameId");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalGameCrosswalk_importBatchId_sport_archiveGameId_key" ON "HistoricalGameCrosswalk"("importBatchId", "sport", "archiveGameId");
CREATE INDEX "HistoricalGameCrosswalk_sport_archiveGameId_importedAt_idx" ON "HistoricalGameCrosswalk"("sport", "archiveGameId", "importedAt");

-- CreateIndex
CREATE INDEX "ScheduleImportIssue_code_sport_idx" ON "ScheduleImportIssue"("code", "sport");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleImportIssue_importBatchId_code_externalId_key" ON "ScheduleImportIssue"("importBatchId", "code", "externalId");

-- AddForeignKey
ALTER TABLE "GameScheduleObservation" ADD CONSTRAINT "GameScheduleObservation_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ScheduleImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameScheduleObservation" ADD CONSTRAINT "GameScheduleObservation_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonCalendarObservation" ADD CONSTRAINT "SeasonCalendarObservation_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ScheduleImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonCalendarObservation" ADD CONSTRAINT "SeasonCalendarObservation_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProTeamSeasonObservation" ADD CONSTRAINT "ProTeamSeasonObservation_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ScheduleImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProTeamSeasonObservation" ADD CONSTRAINT "ProTeamSeasonObservation_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProTeamSeasonObservation" ADD CONSTRAINT "ProTeamSeasonObservation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "ProTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalGameCrosswalk" ADD CONSTRAINT "HistoricalGameCrosswalk_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ScheduleImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalGameCrosswalk" ADD CONSTRAINT "HistoricalGameCrosswalk_canonicalGameId_fkey" FOREIGN KEY ("canonicalGameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleImportIssue" ADD CONSTRAINT "ScheduleImportIssue_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ScheduleImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TRIGGER "GameScheduleObservation_append_only"
  BEFORE UPDATE ON "GameScheduleObservation"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only();
CREATE TRIGGER "SeasonCalendarObservation_append_only"
  BEFORE UPDATE ON "SeasonCalendarObservation"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only();
CREATE TRIGGER "ProTeamSeasonObservation_append_only"
  BEFORE UPDATE ON "ProTeamSeasonObservation"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only();
CREATE TRIGGER "HistoricalGameCrosswalk_append_only"
  BEFORE UPDATE ON "HistoricalGameCrosswalk"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only();
CREATE TRIGGER "ScheduleImportIssue_append_only"
  BEFORE UPDATE ON "ScheduleImportIssue"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only();
