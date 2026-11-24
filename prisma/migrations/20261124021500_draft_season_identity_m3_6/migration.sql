-- Draft history must remain attached to the season in which it occurred even after LeagueSport advances.
ALTER TABLE "LeagueSport" ALTER COLUMN "seasonId" SET NOT NULL;

ALTER TABLE "Draft" ADD COLUMN "seasonId" UUID;
UPDATE "Draft" d SET "seasonId" = ls."seasonId" FROM "LeagueSport" ls WHERE ls."id" = d."leagueSportId";
ALTER TABLE "Draft" ALTER COLUMN "seasonId" SET NOT NULL;
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Draft_leagueSportId_seasonId_key" ON "Draft"("leagueSportId", "seasonId");
