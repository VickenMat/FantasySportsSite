-- Preserve existing trades while allowing one league-level proposal to contain several sports.
ALTER TABLE "Player" ADD COLUMN "isSynthetic" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Player" SET "isSynthetic" = true WHERE "id" = '0646a272-b7b1-48ed-84b4-d9337960ac67';
CREATE INDEX "Player_isSynthetic_sport_displayName_idx" ON "Player"("isSynthetic", "sport", "displayName");

ALTER TABLE "Trade" ALTER COLUMN "leagueSportId" DROP NOT NULL;
ALTER TABLE "Trade" ALTER COLUMN "sport" DROP NOT NULL;
DROP INDEX "Trade_leagueId_sport_status_createdAt_idx";
CREATE INDEX "Trade_leagueId_status_createdAt_idx" ON "Trade"("leagueId", "status", "createdAt");

ALTER TABLE "TradeAsset"
  ADD COLUMN "destinationTeamId" UUID,
  ADD COLUMN "sourceRosterId" UUID,
  ADD COLUMN "sport" "Sport";

UPDATE "TradeAsset" asset SET
  "sport" = trade."sport",
  "sourceRosterId" = roster."id",
  "destinationTeamId" = CASE WHEN asset."side" = 'PROPOSER' THEN trade."recipientTeamId" ELSE trade."proposerTeamId" END
FROM "Trade" trade
JOIN "FantasyRoster" roster ON roster."leagueSportId" = trade."leagueSportId"
WHERE asset."tradeId" = trade."id" AND roster."teamId" = asset."teamId";

ALTER TABLE "TradeAsset" ALTER COLUMN "destinationTeamId" SET NOT NULL;
ALTER TABLE "TradeAsset" ALTER COLUMN "sourceRosterId" SET NOT NULL;
ALTER TABLE "TradeAsset" ALTER COLUMN "sport" SET NOT NULL;
CREATE INDEX "TradeAsset_destinationTeamId_sport_idx" ON "TradeAsset"("destinationTeamId", "sport");
CREATE INDEX "TradeAsset_sourceRosterId_idx" ON "TradeAsset"("sourceRosterId");
ALTER TABLE "TradeAsset" ADD CONSTRAINT "TradeAsset_destinationTeamId_fkey" FOREIGN KEY ("destinationTeamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradeAsset" ADD CONSTRAINT "TradeAsset_sourceRosterId_fkey" FOREIGN KEY ("sourceRosterId") REFERENCES "FantasyRoster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TradeCut" (
  "id" UUID NOT NULL,
  "tradeId" UUID NOT NULL,
  "teamId" UUID NOT NULL,
  "rosterId" UUID NOT NULL,
  "playerId" UUID NOT NULL,
  "sport" "Sport" NOT NULL,
  "authorizedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMPTZ(3),
  CONSTRAINT "TradeCut_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TradeCut_tradeId_playerId_key" ON "TradeCut"("tradeId", "playerId");
CREATE INDEX "TradeCut_teamId_sport_idx" ON "TradeCut"("teamId", "sport");
CREATE INDEX "TradeCut_rosterId_idx" ON "TradeCut"("rosterId");
ALTER TABLE "TradeCut" ADD CONSTRAINT "TradeCut_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradeCut" ADD CONSTRAINT "TradeCut_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradeCut" ADD CONSTRAINT "TradeCut_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "FantasyRoster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TradeCut" ADD CONSTRAINT "TradeCut_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
