-- CreateTable
CREATE TABLE "ProfessionalDataObservation" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "sport" "Sport" NOT NULL,
    "category" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "revisionToken" TEXT NOT NULL,
    "revisionOrdinal" BIGINT,
    "contentHash" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "raw" JSONB NOT NULL,
    "normalized" JSONB NOT NULL,

    CONSTRAINT "ProfessionalDataObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalDataDecision" (
    "id" UUID NOT NULL,
    "observationId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "targets" JSONB NOT NULL,
    "decidedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProfessionalDataDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalSyncState" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "sport" "Sport" NOT NULL,
    "stream" TEXT NOT NULL,
    "cursor" TEXT,
    "nextPollAt" TIMESTAMPTZ(3) NOT NULL,
    "leaseToken" UUID,
    "leaseUntil" TIMESTAMPTZ(3),
    "failures" INTEGER NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMPTZ(3),
    "lastFailure" TEXT,

    CONSTRAINT "ProfessionalSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfessionalDataObservation_provider_sport_category_entityK_idx" ON "ProfessionalDataObservation"("provider", "sport", "category", "entityKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalDataObservation_identity_key" ON "ProfessionalDataObservation"("provider", "sport", "category", "entityKey", "revisionToken", "contentHash");

-- CreateIndex
CREATE INDEX "ProfessionalDataDecision_outcome_decidedAt_idx" ON "ProfessionalDataDecision"("outcome", "decidedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalDataDecision_observationId_version_key" ON "ProfessionalDataDecision"("observationId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalSyncState_provider_sport_stream_key" ON "ProfessionalSyncState"("provider", "sport", "stream");

-- AddForeignKey
ALTER TABLE "ProfessionalDataDecision" ADD CONSTRAINT "ProfessionalDataDecision_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "ProfessionalDataObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "ProfessionalDataObservation" ADD CONSTRAINT "ProfessionalDataObservation_revision_ordinal" CHECK ("revisionOrdinal" IS NULL OR "revisionOrdinal">=0);
ALTER TABLE "ProfessionalDataObservation" ADD CONSTRAINT "ProfessionalDataObservation_publication" CHECK ("publishedAt" IS NULL OR "publishedAt"<="observedAt");
ALTER TABLE "ProfessionalDataDecision" ADD CONSTRAINT "ProfessionalDataDecision_valid" CHECK(version>0 AND outcome IN ('ACCEPTED','STALE','QUARANTINED','PENDING_DATA'));
ALTER TABLE "ProfessionalSyncState" ADD CONSTRAINT "ProfessionalSyncState_nonnegative" CHECK(failures>=0 AND requests>=0);
CREATE TRIGGER "ProfessionalDataObservation_immutable" BEFORE UPDATE OR DELETE ON "ProfessionalDataObservation" FOR EACH ROW EXECUTE FUNCTION fantasy_append_only_direct();
CREATE TRIGGER "ProfessionalDataDecision_immutable" BEFORE UPDATE OR DELETE ON "ProfessionalDataDecision" FOR EACH ROW EXECUTE FUNCTION fantasy_append_only_direct();
ALTER TABLE "ProfessionalSyncState" ADD CONSTRAINT "ProfessionalSyncState_lease_pair" CHECK (("leaseToken" IS NULL)=("leaseUntil" IS NULL));
