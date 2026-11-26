-- Additive draft preparation/scheduling. No existing draft or lineup is rewritten.
CREATE TABLE "DraftPlan" (
  "id" UUID NOT NULL, "leagueId" UUID NOT NULL, "leagueSportId" UUID NOT NULL,
  "seasonId" UUID NOT NULL, "draftId" UUID, "kind" "DraftKind" NOT NULL DEFAULT 'INITIAL',
  "method" TEXT NOT NULL DEFAULT 'SNAKE', "scope" TEXT NOT NULL DEFAULT 'SPORT',
  "orderMethod" TEXT NOT NULL DEFAULT 'CUSTOM', "order" TEXT[] NOT NULL,
  "rounds" INTEGER NOT NULL, "secondsPerPick" INTEGER NOT NULL DEFAULT 90,
  "scheduledAt" TIMESTAMPTZ(3), "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "status" TEXT NOT NULL DEFAULT 'UNSCHEDULED', "blockedReason" TEXT, "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DraftPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DraftPlan_configuration" CHECK ("rounds" BETWEEN 1 AND 200 AND "secondsPerPick" BETWEEN 15 AND 600
    AND method IN ('SNAKE','AUCTION','LINEAR') AND scope IN ('SPORT','UNIVERSAL')
    AND "orderMethod" IN ('CUSTOM','RANDOM','REVERSE_FINAL_PLACEMENT')
    AND status IN ('UNSCHEDULED','SCHEDULED','ROOM_OPEN','IN_PROGRESS','PAUSED','BLOCKED','COMPLETED','CANCELLED')),
  CONSTRAINT "DraftPlan_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DraftPlan_leagueSportId_fkey" FOREIGN KEY ("leagueSportId") REFERENCES "LeagueSport"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DraftPlan_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DraftPlan_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"(id) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DraftPlan_draftId_key" ON "DraftPlan"("draftId");
CREATE UNIQUE INDEX "DraftPlan_leagueSportId_seasonId_kind_key" ON "DraftPlan"("leagueSportId","seasonId",kind);
CREATE INDEX "DraftPlan_status_scheduledAt_idx" ON "DraftPlan"(status,"scheduledAt");
CREATE FUNCTION fantasy_validate_draft_plan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "LeagueSport" s JOIN "Season" season ON season.id=NEW."seasonId"
    WHERE s.id=NEW."leagueSportId" AND s."leagueId"=NEW."leagueId" AND s.sport=season.sport)
    OR (NEW."draftId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Draft" d WHERE d.id=NEW."draftId"
      AND d."leagueId"=NEW."leagueId" AND d."leagueSportId"=NEW."leagueSportId" AND d."seasonId"=NEW."seasonId" AND d.kind=NEW.kind)) THEN
    RAISE EXCEPTION 'Draft plan scope must match its league, sport, season and draft' USING ERRCODE='23514';
  END IF;
  IF NEW.kind='ROOKIE' AND (NEW.method<>'LINEAR' OR NEW."orderMethod"<>'REVERSE_FINAL_PLACEMENT') THEN
    RAISE EXCEPTION 'Rookie drafts require reverse finalized placement and linear order' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "DraftPlan_scope" BEFORE INSERT OR UPDATE ON "DraftPlan" FOR EACH ROW EXECUTE FUNCTION fantasy_validate_draft_plan();

-- Capture new selections only. Historical labels are never fabricated by a backfill.
CREATE TABLE "DraftSelectionSnapshot" (
 "pickId" UUID PRIMARY KEY REFERENCES "DraftPick"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "playerName" TEXT NOT NULL, "franchiseName" TEXT NOT NULL,
 "originalTeamId" UUID NOT NULL, "originalTeamName" TEXT NOT NULL,
 sport "Sport" NOT NULL, positions TEXT[] NOT NULL, price INTEGER CHECK(price IS NULL OR price>=1),
 method TEXT NOT NULL, "capturedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER "DraftSelectionSnapshot_immutable" BEFORE UPDATE OR DELETE ON "DraftSelectionSnapshot"
 FOR EACH ROW EXECUTE FUNCTION fantasy_append_only_direct();
