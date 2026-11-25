CREATE TABLE "CommissionerAuditEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "leagueId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "sport" "Sport",
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionerAuditEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CommissionerAuditEvent_leagueId_fkey"
      FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CommissionerAuditEvent_leagueId_effectiveAt_idx" ON "CommissionerAuditEvent"("leagueId", "effectiveAt");

CREATE TRIGGER "CommissionerAuditEvent_append_only"
  BEFORE UPDATE OR DELETE ON "CommissionerAuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION fantasy_append_only_direct();

CREATE FUNCTION fantasy_audit_commissioner_settings() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor UUID := NULLIF(current_setting('fantasy.commissioner_actor', true), '')::UUID;
  previous JSONB;
  updated JSONB;
  before_values JSONB;
  after_values JSONB;
  league_id UUID;
  sport_value "Sport";
BEGIN
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;

  previous := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  updated := to_jsonb(NEW);
  SELECT jsonb_object_agg(field.key, previous -> field.key), jsonb_object_agg(field.key, field.value)
    INTO before_values, after_values
    FROM jsonb_each(updated) field
    WHERE previous -> field.key IS DISTINCT FROM field.value;
  IF after_values IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'League' THEN
    league_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'LeagueSport' THEN
    league_id := NEW."leagueId";
    sport_value := NEW.sport;
  ELSE
    SELECT "leagueId", sport INTO STRICT league_id, sport_value
      FROM "LeagueSport" WHERE id = NEW."leagueSportId";
  END IF;
  INSERT INTO "CommissionerAuditEvent" (
    "leagueId", "actorUserId", "action", "targetType", "targetId", "sport", "before", "after", "reason"
  ) VALUES (
    league_id, actor, current_setting('fantasy.commissioner_action'), TG_TABLE_NAME, NEW.id, sport_value,
    COALESCE(before_values, '{}'::jsonb), after_values, current_setting('fantasy.commissioner_reason')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER "League_commissioner_audit"
  AFTER UPDATE ON "League"
  FOR EACH ROW EXECUTE FUNCTION fantasy_audit_commissioner_settings();

CREATE TRIGGER "LeagueSport_commissioner_audit"
  AFTER UPDATE ON "LeagueSport"
  FOR EACH ROW EXECUTE FUNCTION fantasy_audit_commissioner_settings();

CREATE TRIGGER "LeagueSportSeason_commissioner_audit"
  AFTER INSERT ON "LeagueSportSeason"
  FOR EACH ROW EXECUTE FUNCTION fantasy_audit_commissioner_settings();
