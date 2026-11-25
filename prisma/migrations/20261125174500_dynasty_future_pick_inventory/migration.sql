-- CreateTable
CREATE TABLE "FutureDraftPick" (
    "id" UUID NOT NULL,
    "leagueSportId" UUID NOT NULL,
    "seasonStartYear" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "originalTeamId" UUID NOT NULL,
    "ownerTeamId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FutureDraftPick_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FutureDraftPick_round" CHECK ("round" BETWEEN 1 AND 4)
);

-- CreateTable
CREATE TABLE "FutureDraftPickOwnership" (
    "id" UUID NOT NULL,
    "pickId" UUID NOT NULL,
    "ownerTeamId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FutureDraftPickOwnership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FutureDraftPick_owner_inventory" ON "FutureDraftPick"("ownerTeamId", "leagueSportId", "seasonStartYear");

-- CreateIndex
CREATE UNIQUE INDEX "FutureDraftPick_identity" ON "FutureDraftPick"("leagueSportId", "seasonStartYear", "round", "originalTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "FutureDraftPickOwnership_idempotencyKey_key" ON "FutureDraftPickOwnership"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FutureDraftPickOwnership_pickId_recordedAt_idx" ON "FutureDraftPickOwnership"("pickId", "recordedAt");

-- AddForeignKey
ALTER TABLE "FutureDraftPick" ADD CONSTRAINT "FutureDraftPick_leagueSportId_fkey" FOREIGN KEY ("leagueSportId") REFERENCES "LeagueSport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FutureDraftPick" ADD CONSTRAINT "FutureDraftPick_originalTeamId_fkey" FOREIGN KEY ("originalTeamId") REFERENCES "FantasyTeam"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FutureDraftPick" ADD CONSTRAINT "FutureDraftPick_ownerTeamId_fkey" FOREIGN KEY ("ownerTeamId") REFERENCES "FantasyTeam"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "FutureDraftPickOwnership" ADD CONSTRAINT "FutureDraftPickOwnership_pickId_fkey" FOREIGN KEY ("pickId") REFERENCES "FutureDraftPick"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FutureDraftPickOwnership" ADD CONSTRAINT "FutureDraftPickOwnership_ownerTeamId_fkey" FOREIGN KEY ("ownerTeamId") REFERENCES "FantasyTeam"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION fantasy_validate_future_pick() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "LeagueSport" sport
    JOIN "League" league ON league.id = sport."leagueId"
    JOIN "FantasyTeam" original ON original.id = NEW."originalTeamId" AND original."leagueId" = league.id
    JOIN "FantasyTeam" owner ON owner.id = NEW."ownerTeamId" AND owner."leagueId" = league.id
    WHERE sport.id = NEW."leagueSportId" AND league.format <> 'REDRAFT'
  ) THEN
    RAISE EXCEPTION 'Future picks require a dynasty league and franchises in that league' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FutureDraftPick_scope"
  BEFORE INSERT OR UPDATE ON "FutureDraftPick"
  FOR EACH ROW EXECUTE FUNCTION fantasy_validate_future_pick();

CREATE TRIGGER "FutureDraftPickOwnership_append_only"
  BEFORE UPDATE OR DELETE ON "FutureDraftPickOwnership"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only_direct();
