-- M3.6 adds sport-scoped league gameplay without replacing any existing identity.
CREATE TYPE "LeagueVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

ALTER TABLE "League" ADD COLUMN "visibility" "LeagueVisibility" NOT NULL DEFAULT 'PRIVATE';
ALTER TABLE "League" ADD CONSTRAINT "League_maxTeams_check" CHECK ("maxTeams" BETWEEN 2 AND 16);

ALTER TABLE "LeagueSport"
  ADD COLUMN "benchSlots" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "draftRounds" INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN "draftSecondsPerPick" INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN "keeperDeadline" TIMESTAMPTZ(3),
  ADD COLUMN "keeperLimit" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rosterSlots" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "seasonId" UUID,
  ADD COLUMN "seasonLabel" TEXT,
  ADD COLUMN "startingFaab" INTEGER NOT NULL DEFAULT 100;

INSERT INTO "Season" ("id", "sport", "startYear", "label", "coverage", "coverageReason")
SELECT gen_random_uuid(), ls."sport", l."seasonYear",
  CASE WHEN ls."sport" IN ('NBA', 'NHL')
    THEN l."seasonYear"::text || '-' || right((l."seasonYear" + 1)::text, 2)
    ELSE l."seasonYear"::text END,
  'UNVERIFIED', 'Automatically associated league season metadata; no authoritative live feed is connected.'
FROM "LeagueSport" ls
JOIN "League" l ON l."id" = ls."leagueId"
ON CONFLICT ("sport", "startYear") DO NOTHING;

UPDATE "LeagueSport" ls SET
  "seasonId" = s."id",
  "seasonLabel" = s."label",
  "rosterSlots" = CASE
    WHEN cardinality(l."rosterSlots") > 0 THEN l."rosterSlots"
    WHEN ls."sport" = 'NFL' THEN ARRAY['QB','RB','RB','WR','WR','WR','TE','FLEX','FLEX']::text[]
    WHEN ls."sport" = 'NBA' THEN ARRAY['PG','SG','G','SF','PF','F','C','C','UTIL']::text[]
    WHEN ls."sport" = 'MLB' THEN ARRAY['SP','SP','1B','3B','MI','OF','OF','UTIL','UTIL']::text[]
    ELSE ARRAY['F','F','F','F','D','D','G','UTIL','UTIL']::text[] END,
  "benchSlots" = l."benchSlots",
  "draftRounds" = l."draftRounds",
  "draftSecondsPerPick" = l."draftSecondsPerPick",
  "startingFaab" = l."startingFaab"
FROM "League" l, "Season" s
WHERE l."id" = ls."leagueId" AND s."sport" = ls."sport" AND s."startYear" = l."seasonYear";

ALTER TABLE "LeagueSport" ALTER COLUMN "seasonLabel" SET NOT NULL;
ALTER TABLE "LeagueSport" ADD CONSTRAINT "LeagueSport_keeperLimit_check" CHECK ("keeperLimit" BETWEEN 0 AND 50);
ALTER TABLE "LeagueSport" ADD CONSTRAINT "LeagueSport_benchSlots_check" CHECK ("benchSlots" BETWEEN 0 AND 20);
ALTER TABLE "LeagueSport" ADD CONSTRAINT "LeagueSport_timer_check" CHECK ("draftSecondsPerPick" BETWEEN 15 AND 600);

-- M0 demo memberships predate franchises. Give every human membership one stable franchise.
INSERT INTO "FantasyTeam" ("id", "leagueId", "managerId", "membershipId", "name", "isComputer", "draftSlot", "faabRemaining")
SELECT gen_random_uuid(), lm."leagueId", lm."userId", lm."id",
  'Franchise ' || (COALESCE(existing."count", 0) + row_number() OVER (PARTITION BY lm."leagueId" ORDER BY lm."joinedAt", lm."id"))::text,
  false,
  COALESCE(existing."count", 0) + row_number() OVER (PARTITION BY lm."leagueId" ORDER BY lm."joinedAt", lm."id"),
  l."startingFaab"
FROM "LeagueMember" lm
JOIN "League" l ON l."id" = lm."leagueId"
LEFT JOIN LATERAL (SELECT count(*)::int AS "count" FROM "FantasyTeam" ft WHERE ft."leagueId" = lm."leagueId") existing ON true
LEFT JOIN "FantasyTeam" current_team ON current_team."membershipId" = lm."id"
WHERE current_team."id" IS NULL;

CREATE TABLE "FantasyRoster" (
  "id" UUID NOT NULL,
  "leagueId" UUID NOT NULL,
  "leagueSportId" UUID NOT NULL,
  "teamId" UUID NOT NULL,
  "sport" "Sport" NOT NULL,
  "faabRemaining" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FantasyRoster_pkey" PRIMARY KEY ("id")
);

INSERT INTO "FantasyRoster" ("id", "leagueId", "leagueSportId", "teamId", "sport", "faabRemaining")
SELECT gen_random_uuid(), ft."leagueId", ls."id", ft."id", ls."sport", ls."startingFaab"
FROM "FantasyTeam" ft
JOIN "LeagueSport" ls ON ls."leagueId" = ft."leagueId";

CREATE UNIQUE INDEX "FantasyRoster_teamId_leagueSportId_key" ON "FantasyRoster"("teamId", "leagueSportId");
CREATE INDEX "FantasyRoster_leagueId_sport_idx" ON "FantasyRoster"("leagueId", "sport");
ALTER TABLE "FantasyRoster" ADD CONSTRAINT "FantasyRoster_leagueSportId_fkey" FOREIGN KEY ("leagueSportId") REFERENCES "LeagueSport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FantasyRoster" ADD CONSTRAINT "FantasyRoster_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RosterEntry"
  ADD COLUMN "releasedAt" TIMESTAMPTZ(3),
  ADD COLUMN "rosterId" UUID,
  ADD COLUMN "seasonId" UUID,
  ADD COLUMN "sport" "Sport";
UPDATE "RosterEntry" re SET "sport" = p."sport", "rosterId" = fr."id", "seasonId" = ls."seasonId"
FROM "Player" p, "FantasyRoster" fr, "LeagueSport" ls
WHERE p."id" = re."playerId" AND fr."teamId" = re."teamId" AND fr."sport" = p."sport"
  AND ls."id" = fr."leagueSportId";
ALTER TABLE "RosterEntry" ALTER COLUMN "rosterId" SET NOT NULL;
ALTER TABLE "RosterEntry" ALTER COLUMN "sport" SET NOT NULL;
DROP INDEX "RosterEntry_leagueId_playerId_key";
DROP INDEX "RosterEntry_teamId_slot_idx";
CREATE UNIQUE INDEX "RosterEntry_leagueId_sport_playerId_active_key" ON "RosterEntry"("leagueId", "sport", "playerId") WHERE "releasedAt" IS NULL;
CREATE INDEX "RosterEntry_leagueId_sport_playerId_releasedAt_idx" ON "RosterEntry"("leagueId", "sport", "playerId", "releasedAt");
CREATE INDEX "RosterEntry_rosterId_releasedAt_slot_idx" ON "RosterEntry"("rosterId", "releasedAt", "slot");
CREATE INDEX "RosterEntry_teamId_sport_slot_idx" ON "RosterEntry"("teamId", "sport", "slot");
ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "FantasyRoster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Draft" ADD COLUMN "leagueSportId" UUID, ADD COLUMN "pickOrder" TEXT[] DEFAULT ARRAY[]::TEXT[], ADD COLUMN "sport" "Sport";
UPDATE "Draft" d SET
  "sport" = COALESCE(l."primarySport", (SELECT x."sport" FROM "LeagueSport" x WHERE x."leagueId" = d."leagueId" ORDER BY x."sport" LIMIT 1)),
  "leagueSportId" = (SELECT x."id" FROM "LeagueSport" x WHERE x."leagueId" = d."leagueId" AND x."sport" = COALESCE(l."primarySport", (SELECT y."sport" FROM "LeagueSport" y WHERE y."leagueId" = d."leagueId" ORDER BY y."sport" LIMIT 1)))
FROM "League" l WHERE l."id" = d."leagueId";
ALTER TABLE "Draft" ALTER COLUMN "leagueSportId" SET NOT NULL;
ALTER TABLE "Draft" ALTER COLUMN "sport" SET NOT NULL;
DROP INDEX "Draft_leagueId_status_idx";
CREATE INDEX "Draft_leagueId_sport_status_idx" ON "Draft"("leagueId", "sport", "status");
CREATE UNIQUE INDEX "Draft_leagueId_sport_open_key" ON "Draft"("leagueId", "sport") WHERE "status" IN ('SCHEDULED', 'ACTIVE', 'PAUSED');
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_leagueSportId_fkey" FOREIGN KEY ("leagueSportId") REFERENCES "LeagueSport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScoringPeriod" ADD COLUMN "leagueSportId" UUID, ADD COLUMN "sport" "Sport";
UPDATE "ScoringPeriod" sp SET
  "sport" = COALESCE(l."primarySport", (SELECT x."sport" FROM "LeagueSport" x WHERE x."leagueId" = sp."leagueId" ORDER BY x."sport" LIMIT 1)),
  "leagueSportId" = (SELECT x."id" FROM "LeagueSport" x WHERE x."leagueId" = sp."leagueId" AND x."sport" = COALESCE(l."primarySport", (SELECT y."sport" FROM "LeagueSport" y WHERE y."leagueId" = sp."leagueId" ORDER BY y."sport" LIMIT 1)))
FROM "League" l WHERE l."id" = sp."leagueId";
ALTER TABLE "ScoringPeriod" ALTER COLUMN "leagueSportId" SET NOT NULL;
ALTER TABLE "ScoringPeriod" ALTER COLUMN "sport" SET NOT NULL;
DROP INDEX "ScoringPeriod_leagueId_number_key";
CREATE UNIQUE INDEX "ScoringPeriod_leagueId_sport_number_key" ON "ScoringPeriod"("leagueId", "sport", "number");
CREATE INDEX "ScoringPeriod_leagueSportId_number_idx" ON "ScoringPeriod"("leagueSportId", "number");
ALTER TABLE "ScoringPeriod" ADD CONSTRAINT "ScoringPeriod_leagueSportId_fkey" FOREIGN KEY ("leagueSportId") REFERENCES "LeagueSport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Matchup" ADD COLUMN "sport" "Sport";
UPDATE "Matchup" m SET "sport" = sp."sport" FROM "ScoringPeriod" sp WHERE sp."id" = m."periodId";
ALTER TABLE "Matchup" ALTER COLUMN "sport" SET NOT NULL;
DROP INDEX "Matchup_leagueId_status_idx";
CREATE INDEX "Matchup_leagueId_sport_status_idx" ON "Matchup"("leagueId", "sport", "status");

ALTER TABLE "WaiverClaim" ADD COLUMN "leagueSportId" UUID, ADD COLUMN "rosterId" UUID, ADD COLUMN "sport" "Sport";
UPDATE "WaiverClaim" wc SET "sport" = p."sport", "leagueSportId" = ls."id", "rosterId" = fr."id"
FROM "Player" p, "LeagueSport" ls, "FantasyRoster" fr
WHERE p."id" = wc."addPlayerId" AND ls."leagueId" = wc."leagueId" AND ls."sport" = p."sport"
  AND fr."leagueSportId" = ls."id" AND fr."teamId" = wc."teamId";
ALTER TABLE "WaiverClaim" ALTER COLUMN "leagueSportId" SET NOT NULL;
ALTER TABLE "WaiverClaim" ALTER COLUMN "rosterId" SET NOT NULL;
ALTER TABLE "WaiverClaim" ALTER COLUMN "sport" SET NOT NULL;
DROP INDEX "WaiverClaim_leagueId_processAt_status_idx";
CREATE INDEX "WaiverClaim_leagueId_sport_processAt_status_idx" ON "WaiverClaim"("leagueId", "sport", "processAt", "status");
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_leagueSportId_fkey" FOREIGN KEY ("leagueSportId") REFERENCES "LeagueSport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaiverClaim" ADD CONSTRAINT "WaiverClaim_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "FantasyRoster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FantasyTransaction" ADD COLUMN "leagueSportId" UUID, ADD COLUMN "rosterId" UUID, ADD COLUMN "sport" "Sport";
WITH resolved AS (
  SELECT tx."id", tx."teamId", tx."leagueId",
    COALESCE(p."sport", rp."sport", l."primarySport", (SELECT x."sport" FROM "LeagueSport" x WHERE x."leagueId" = tx."leagueId" ORDER BY x."sport" LIMIT 1)) AS "sport"
  FROM "FantasyTransaction" tx
  JOIN "League" l ON l."id" = tx."leagueId"
  LEFT JOIN "Player" p ON p."id" = tx."playerId"
  LEFT JOIN "Player" rp ON rp."id" = tx."relatedPlayerId"
)
UPDATE "FantasyTransaction" tx SET "sport" = resolved."sport", "leagueSportId" = ls."id", "rosterId" = fr."id"
FROM resolved
JOIN "LeagueSport" ls ON ls."leagueId" = resolved."leagueId" AND ls."sport" = resolved."sport"
JOIN "FantasyRoster" fr ON fr."leagueSportId" = ls."id" AND fr."teamId" = resolved."teamId"
WHERE tx."id" = resolved."id";
ALTER TABLE "FantasyTransaction" ALTER COLUMN "leagueSportId" SET NOT NULL;
ALTER TABLE "FantasyTransaction" ALTER COLUMN "rosterId" SET NOT NULL;
ALTER TABLE "FantasyTransaction" ALTER COLUMN "sport" SET NOT NULL;
DROP INDEX "FantasyTransaction_leagueId_createdAt_idx";
CREATE INDEX "FantasyTransaction_leagueId_sport_createdAt_idx" ON "FantasyTransaction"("leagueId", "sport", "createdAt");
ALTER TABLE "FantasyTransaction" ADD CONSTRAINT "FantasyTransaction_leagueSportId_fkey" FOREIGN KEY ("leagueSportId") REFERENCES "LeagueSport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FantasyTransaction" ADD CONSTRAINT "FantasyTransaction_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "FantasyRoster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Trade" ADD COLUMN "leagueSportId" UUID, ADD COLUMN "sport" "Sport";
WITH resolved AS (
  SELECT t."id", t."leagueId",
    COALESCE(p."sport", l."primarySport", (SELECT x."sport" FROM "LeagueSport" x WHERE x."leagueId" = t."leagueId" ORDER BY x."sport" LIMIT 1)) AS "sport"
  FROM "Trade" t
  JOIN "League" l ON l."id" = t."leagueId"
  LEFT JOIN LATERAL (SELECT ta."playerId" FROM "TradeAsset" ta WHERE ta."tradeId" = t."id" LIMIT 1) asset ON true
  LEFT JOIN "Player" p ON p."id" = asset."playerId"
)
UPDATE "Trade" t SET "sport" = resolved."sport", "leagueSportId" = ls."id"
FROM resolved JOIN "LeagueSport" ls ON ls."leagueId" = resolved."leagueId" AND ls."sport" = resolved."sport"
WHERE t."id" = resolved."id";
ALTER TABLE "Trade" ALTER COLUMN "leagueSportId" SET NOT NULL;
ALTER TABLE "Trade" ALTER COLUMN "sport" SET NOT NULL;
DROP INDEX "Trade_leagueId_status_createdAt_idx";
CREATE INDEX "Trade_leagueId_sport_status_createdAt_idx" ON "Trade"("leagueId", "sport", "status", "createdAt");
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_leagueSportId_fkey" FOREIGN KEY ("leagueSportId") REFERENCES "LeagueSport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "KeeperSelection" (
  "id" UUID NOT NULL,
  "leagueSportId" UUID NOT NULL,
  "rosterId" UUID NOT NULL,
  "teamId" UUID NOT NULL,
  "playerId" UUID NOT NULL,
  "seasonId" UUID NOT NULL,
  "draftCost" INTEGER,
  "selectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retainedAt" TIMESTAMPTZ(3),
  CONSTRAINT "KeeperSelection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KeeperSelection_leagueSportId_seasonId_playerId_key" ON "KeeperSelection"("leagueSportId", "seasonId", "playerId");
CREATE INDEX "KeeperSelection_rosterId_seasonId_idx" ON "KeeperSelection"("rosterId", "seasonId");
ALTER TABLE "KeeperSelection" ADD CONSTRAINT "KeeperSelection_leagueSportId_fkey" FOREIGN KEY ("leagueSportId") REFERENCES "LeagueSport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KeeperSelection" ADD CONSTRAINT "KeeperSelection_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "FantasyRoster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KeeperSelection" ADD CONSTRAINT "KeeperSelection_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "FantasyTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KeeperSelection" ADD CONSTRAINT "KeeperSelection_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KeeperSelection" ADD CONSTRAINT "KeeperSelection_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "LeagueSport_sport_seasonId_idx" ON "LeagueSport"("sport", "seasonId");
ALTER TABLE "LeagueSport" ADD CONSTRAINT "LeagueSport_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
