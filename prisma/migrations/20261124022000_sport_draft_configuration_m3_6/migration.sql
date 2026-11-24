-- Each sport can retain its own commissioner-defined snake order.
ALTER TABLE "LeagueSport" ADD COLUMN "draftOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
