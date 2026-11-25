CREATE TYPE "DraftKind" AS ENUM ('INITIAL', 'ROOKIE');

DROP INDEX "Draft_leagueSportId_seasonId_key";
ALTER TABLE "Draft" ADD COLUMN "kind" "DraftKind" NOT NULL DEFAULT 'INITIAL';
ALTER TABLE "Draft" ADD COLUMN "orderProvenance" TEXT;
CREATE UNIQUE INDEX "Draft_leagueSportId_seasonId_kind_key" ON "Draft"("leagueSportId", "seasonId", "kind");

CREATE TABLE "RookieEligibilityEvidence" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "playerId" UUID NOT NULL,
  "seasonId" UUID NOT NULL,
  "sport" "Sport" NOT NULL,
  "eligible" BOOLEAN NOT NULL,
  "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
  "knownAt" TIMESTAMPTZ(3) NOT NULL,
  "provider" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "sourceRecord" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RookieEligibilityEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RookieEligibilityEvidence_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RookieEligibilityEvidence_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RookieEligibilityEvidence_provider_externalId_key" ON "RookieEligibilityEvidence"("provider", "externalId");
CREATE INDEX "RookieEligibilityEvidence_playerId_seasonId_knownAt_idx" ON "RookieEligibilityEvidence"("playerId", "seasonId", "knownAt");
CREATE INDEX "RookieEligibilityEvidence_sport_seasonId_eligible_idx" ON "RookieEligibilityEvidence"("sport", "seasonId", "eligible");

CREATE TRIGGER "RookieEligibilityEvidence_append_only"
  BEFORE UPDATE OR DELETE ON "RookieEligibilityEvidence"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only_direct();
