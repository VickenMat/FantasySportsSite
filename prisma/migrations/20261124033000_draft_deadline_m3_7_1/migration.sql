ALTER TABLE "Draft" ADD COLUMN "pickDeadlineAt" TIMESTAMPTZ(3),
ADD COLUMN "pausedRemainingMs" INTEGER;

UPDATE "Draft"
SET "pickDeadlineAt" = "pickStartedAt" + ("secondsPerPick" * INTERVAL '1 second')
WHERE "pickStartedAt" IS NOT NULL AND status = 'ACTIVE';

CREATE INDEX "Draft_status_pickDeadlineAt_idx" ON "Draft"("status", "pickDeadlineAt");
DROP INDEX IF EXISTS "Draft_status_pickStartedAt_idx";
