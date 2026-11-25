ALTER TABLE "LeagueSport" ADD COLUMN "regularSeasonMatchups" INTEGER NOT NULL DEFAULT 14;

CREATE TABLE "RelativeMatchupPeriod" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "leagueId" UUID NOT NULL,
  "leagueSportId" UUID NOT NULL,
  "sport" "Sport" NOT NULL,
  "number" INTEGER NOT NULL,
  "scoringPeriodId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RelativeMatchupPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RelativeMatchupPeriod_positive" CHECK ("number" > 0)
);
CREATE UNIQUE INDEX "RelativeMatchupPeriod_leagueSportId_number_key" ON "RelativeMatchupPeriod"("leagueSportId", "number");
CREATE UNIQUE INDEX "RelativeMatchupPeriod_scoringPeriodId_key" ON "RelativeMatchupPeriod"("scoringPeriodId");
CREATE INDEX "RelativeMatchupPeriod_leagueId_sport_number_idx" ON "RelativeMatchupPeriod"("leagueId", "sport", "number");

CREATE TABLE "RelativeMatchup" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "periodId" UUID NOT NULL,
  "homeTeamId" UUID NOT NULL,
  "awayTeamId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RelativeMatchup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RelativeMatchup_no_self" CHECK ("homeTeamId" <> "awayTeamId")
);
CREATE UNIQUE INDEX "RelativeMatchup_periodId_homeTeamId_awayTeamId_key" ON "RelativeMatchup"("periodId", "homeTeamId", "awayTeamId");
CREATE INDEX "RelativeMatchup_homeTeamId_periodId_idx" ON "RelativeMatchup"("homeTeamId", "periodId");
CREATE INDEX "RelativeMatchup_awayTeamId_periodId_idx" ON "RelativeMatchup"("awayTeamId", "periodId");

ALTER TABLE "RelativeMatchupPeriod" ADD CONSTRAINT "RelativeMatchupPeriod_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RelativeMatchupPeriod" ADD CONSTRAINT "RelativeMatchupPeriod_leagueSportId_fkey" FOREIGN KEY ("leagueSportId") REFERENCES "LeagueSport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RelativeMatchupPeriod" ADD CONSTRAINT "RelativeMatchupPeriod_scoringPeriodId_fkey" FOREIGN KEY ("scoringPeriodId") REFERENCES "ScoringPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RelativeMatchup" ADD CONSTRAINT "RelativeMatchup_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "RelativeMatchupPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RelativeMatchup" ADD CONSTRAINT "RelativeMatchup_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RelativeMatchup" ADD CONSTRAINT "RelativeMatchup_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
