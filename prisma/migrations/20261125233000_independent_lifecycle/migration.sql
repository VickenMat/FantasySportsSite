-- Preserve legacy rows without inferring their season; new plans carry an explicit season scope.
ALTER TABLE "RelativeMatchupPeriod" ADD COLUMN "seasonId" UUID;
DROP INDEX "RelativeMatchupPeriod_leagueSportId_number_key";
CREATE UNIQUE INDEX "RelativeMatchupPeriod_leagueSportId_seasonId_number_key" ON "RelativeMatchupPeriod"("leagueSportId","seasonId",number);

CREATE TABLE "FantasyWindowRevision" (
 id UUID PRIMARY KEY, "leagueSportId" UUID NOT NULL REFERENCES "LeagueSport"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "seasonId" UUID NOT NULL REFERENCES "Season"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 version INTEGER NOT NULL CHECK(version>0), "startsAt" TIMESTAMPTZ(3) NOT NULL, "endsAt" TIMESTAMPTZ(3) NOT NULL,
 "playoffStartsAt" TIMESTAMPTZ(3), "playoffEndsAt" TIMESTAMPTZ(3), "matchupDays" INTEGER NOT NULL DEFAULT 7 CHECK("matchupDays" BETWEEN 1 AND 28),
 "actorUserId" UUID NOT NULL, reason TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FantasyWindowRevision_leagueSportId_seasonId_version_key" UNIQUE("leagueSportId","seasonId",version),
 CHECK("endsAt">"startsAt"), CHECK(("playoffStartsAt" IS NULL AND "playoffEndsAt" IS NULL) OR ("playoffStartsAt">="startsAt" AND "playoffEndsAt">"playoffStartsAt" AND "playoffEndsAt"<="endsAt"))
);
CREATE TRIGGER "FantasyWindowRevision_immutable" BEFORE UPDATE OR DELETE ON "FantasyWindowRevision" FOR EACH ROW EXECUTE FUNCTION fantasy_append_only_direct();
CREATE TABLE "RookieDraftRule" ("leagueSportId" UUID PRIMARY KEY REFERENCES "LeagueSport"(id) ON DELETE CASCADE ON UPDATE CASCADE, rounds INTEGER NOT NULL DEFAULT 4 CHECK(rounds BETWEEN 1 AND 100));
ALTER TABLE "FutureDraftPick" DROP CONSTRAINT "FutureDraftPick_round";
ALTER TABLE "FutureDraftPick" ADD CONSTRAINT "FutureDraftPick_round" CHECK(round BETWEEN 1 AND 100);
