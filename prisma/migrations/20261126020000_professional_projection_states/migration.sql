-- Verified cancellations skip inactive regular-season periods without recording ties.
-- Existing finalized competitive results and every existing row remain unchanged.
ALTER TYPE "MatchupStatus" ADD VALUE 'SKIPPED';

-- Cross-provider state projection resolves one canonical game/entity at a time.
CREATE INDEX "ProfessionalDataObservation_sport_entity_revision_idx"
ON "ProfessionalDataObservation"("sport", "category", "entityKey", "revisionOrdinal");
