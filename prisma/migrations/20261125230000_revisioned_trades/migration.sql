CREATE TABLE "TradeProposal" (
 id UUID PRIMARY KEY, "leagueId" UUID NOT NULL REFERENCES "League"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "proposerTeamId" UUID NOT NULL, "participantIds" TEXT[] NOT NULL,
 "currentRevision" INTEGER NOT NULL DEFAULT 1 CHECK("currentRevision">0),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','REVIEW','EXECUTED','CANCELLED','VETOED','EXPIRED','INVALIDATED')),
 "reviewHours" INTEGER NOT NULL DEFAULT 24 CHECK("reviewHours" BETWEEN 0 AND 168),
 "executeAt" TIMESTAMPTZ(3), "expiresAt" TIMESTAMPTZ(3) NOT NULL, "processedAt" TIMESTAMPTZ(3), reason TEXT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TradeProposal_leagueId_status_idx" ON "TradeProposal"("leagueId",status);
CREATE INDEX "TradeProposal_status_executeAt_idx" ON "TradeProposal"(status,"executeAt");
CREATE TABLE "TradeProposalRevision" (
 id UUID PRIMARY KEY, "proposalId" UUID NOT NULL REFERENCES "TradeProposal"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 version INTEGER NOT NULL CHECK(version>0), assets JSONB NOT NULL, "actorUserId" TEXT NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TradeProposalRevision_proposalId_version_key" UNIQUE("proposalId",version)
);
CREATE TABLE "TradeProposalAcceptance" (
 id UUID PRIMARY KEY, "revisionId" UUID NOT NULL REFERENCES "TradeProposalRevision"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "teamId" UUID NOT NULL, "actorUserId" TEXT NOT NULL, "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TradeProposalAcceptance_revisionId_teamId_key" UNIQUE("revisionId","teamId")
);
CREATE TABLE "TradeReviewPolicy" ("leagueId" UUID PRIMARY KEY REFERENCES "League"(id) ON DELETE CASCADE ON UPDATE CASCADE, "reviewHours" INTEGER NOT NULL DEFAULT 24 CHECK("reviewHours" BETWEEN 0 AND 168));
CREATE TRIGGER "TradeProposalRevision_immutable" BEFORE UPDATE OR DELETE ON "TradeProposalRevision" FOR EACH ROW EXECUTE FUNCTION fantasy_append_only_direct();
CREATE TRIGGER "TradeProposalAcceptance_immutable" BEFORE UPDATE OR DELETE ON "TradeProposalAcceptance" FOR EACH ROW EXECUTE FUNCTION fantasy_append_only_direct();

CREATE FUNCTION fantasy_validate_trade_proposal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total INTEGER;
BEGIN
 SELECT count(DISTINCT t.id) INTO total FROM "FantasyTeam" t
 WHERE t."leagueId"=NEW."leagueId" AND t.id::text=ANY(NEW."participantIds");
 IF total<2 OR total<>cardinality(NEW."participantIds") OR NOT NEW."proposerTeamId"::text=ANY(NEW."participantIds") THEN
  RAISE EXCEPTION 'Proposal participants must be distinct franchises from the same league, including the proposer' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "TradeProposal_scope" BEFORE INSERT OR UPDATE ON "TradeProposal" FOR EACH ROW EXECUTE FUNCTION fantasy_validate_trade_proposal();
CREATE FUNCTION fantasy_validate_trade_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "TradeProposalRevision" r JOIN "TradeProposal" p ON p.id=r."proposalId"
 JOIN "FantasyTeam" t ON t.id=NEW."teamId" AND t."leagueId"=p."leagueId"
 WHERE r.id=NEW."revisionId" AND r.version=p."currentRevision" AND p.status='PENDING'
 AND t.id::text=ANY(p."participantIds") AND t."managerId"::text=NEW."actorUserId") THEN
  RAISE EXCEPTION 'Only the current participating manager may accept the current pending proposal revision' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "TradeProposalAcceptance_scope" BEFORE INSERT ON "TradeProposalAcceptance" FOR EACH ROW EXECUTE FUNCTION fantasy_validate_trade_acceptance();
