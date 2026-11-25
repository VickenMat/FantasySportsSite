-- Direct corrections to M4.3 evidence/history remain forbidden. PostgreSQL
-- foreign-key cascade actions run at nested trigger depth and are permitted so
-- an explicitly deleted parent league/test fixture can be removed atomically.
CREATE FUNCTION fantasy_append_only_direct() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER "RosterAssignmentEvent_append_only" ON "RosterAssignmentEvent";
CREATE TRIGGER "RosterAssignmentEvent_append_only"
  BEFORE UPDATE OR DELETE ON "RosterAssignmentEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only_direct();

DROP TRIGGER "RosterComplianceSnapshot_append_only" ON "RosterComplianceSnapshot";
CREATE TRIGGER "RosterComplianceSnapshot_append_only"
  BEFORE UPDATE OR DELETE ON "RosterComplianceSnapshot"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only_direct();

DROP TRIGGER "PlayerAvailabilityEvidence_append_only" ON "PlayerAvailabilityEvidence";
CREATE TRIGGER "PlayerAvailabilityEvidence_append_only"
  BEFORE UPDATE OR DELETE ON "PlayerAvailabilityEvidence"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only_direct();

DROP TRIGGER "GameLineupSnapshot_append_only" ON "GameLineupSnapshot";
CREATE TRIGGER "GameLineupSnapshot_append_only"
  BEFORE UPDATE OR DELETE ON "GameLineupSnapshot"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only_direct();
