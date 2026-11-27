import type{Sport}from '@/generated/prisma/enums';
import {getDatabase}from '@/lib/db';
import {professionalGameProjection}from './professional-game-state';
/** Box provenance may validate archived score rows without inventing an archive transport receipt. */
export async function historicalBoxFreshness(input:{sport:Sport;seasonId:string;asOf:Date},client:Pick<ReturnType<typeof getDatabase>,'$queryRaw'>){
 const at=input.asOf;
 const [row]=await client.$queryRaw<{provider:string;sourceReference:string;initialPublishedAt:Date|null;publishedAt:Date|null;normalizedAt:Date|null;scoredAt:Date|null;boxObservedAt:Date|null;operationalAnchorAt:Date|null;operationalDeadlineAt:Date|null;operationalAnchorMode:string|null;operationalAnchorInvalidated:boolean;gameEvidencePending:boolean}[]>`
 SELECT box.provider,box."sourceReference",box."publishedAt",(box.normalized->>'initialPublishedAt')::timestamptz AS "initialPublishedAt",
   bound."normalizedAt",bound."scoredAt",clock."observedAt" AS "boxObservedAt",
   (clock.normalized->>'anchorAt')::timestamptz AS "operationalAnchorAt",(clock.normalized->>'deadlineAt')::timestamptz AS "operationalDeadlineAt",clock.normalized->>'mode' AS "operationalAnchorMode",
   EXISTS(SELECT 1 FROM "ProfessionalDataObservation" invalidation JOIN "ProfessionalDataDecision" receipt ON receipt."observationId"=invalidation.id AND receipt.outcome='ACCEPTED'
     WHERE invalidation.provider='conservative-box-policy' AND invalidation.category='BOX_CLOCK_INVALIDATION' AND invalidation."entityKey"=clock."entityKey" AND receipt.targets->>'anchorId'=clock.id::text AND invalidation."observedAt"<=${at} AND receipt."decidedAt"<=${at}) AS "operationalAnchorInvalidated",
   (clock.id IS NULL OR box.outcome<>'ACCEPTED' OR source_state.status IS DISTINCT FROM 'FINAL' OR COALESCE(source_state."operationalCompletedAt",source_state."completedAt") IS NULL OR COALESCE(source_state."lockReviewPending",false)
     OR NOT COALESCE(bound.complete,false) OR bound.targets IS DISTINCT FROM (box.normalized->'completeness'->>'expectedPlayers')::int
     OR NOT COALESCE((box.normalized->'completeness'->>'allExpectedRowsPresent')::boolean,false)
     OR NOT COALESCE((box.normalized->'completeness'->>'rolesResolved')::boolean,false)
     OR NOT COALESCE((box.normalized->'completeness'->>'noUnresolvedContradictions')::boolean,false)
   ) AS "gameEvidencePending"
 FROM "Game" game ${professionalGameProjection(at)}
 JOIN LATERAL(SELECT observation.*,decision.outcome FROM "ProfessionalDataObservation" observation
   JOIN LATERAL(SELECT outcome FROM "ProfessionalDataDecision" receipt WHERE receipt."observationId"=observation.id AND receipt."decidedAt"<=${at} ORDER BY receipt.version DESC LIMIT 1) decision ON true
   WHERE observation.category='COMPLETE_FINAL_BOX' AND observation.sport=game.sport AND observation.normalized->'game'->>'provider'=game.provider AND observation.normalized->'game'->>'externalId'=game."externalId" AND observation."observedAt"<=${at}
   ORDER BY observation."observedAt" DESC,observation.id DESC LIMIT 1) box ON true
 LEFT JOIN LATERAL(SELECT anchor.* FROM "ProfessionalDataObservation" anchor
   JOIN LATERAL(SELECT outcome FROM "ProfessionalDataDecision" receipt WHERE receipt."observationId"=anchor.id AND receipt."decidedAt"<=${at} ORDER BY receipt.version DESC LIMIT 1) decision ON decision.outcome='ACCEPTED'
   WHERE anchor.provider='conservative-box-policy' AND anchor.category='BOX_CLOCK' AND anchor."entityKey"='box-clock:'||game.id::text AND anchor."observedAt"<=${at}
   ORDER BY anchor."revisionOrdinal" DESC,anchor."observedAt" DESC,anchor.id DESC LIMIT 1) clock ON true
 LEFT JOIN LATERAL(SELECT COUNT(*)::int targets,MAX(stat."recordedAt") AS "normalizedAt",MAX(entry."calculatedAt") AS "scoredAt",
   bool_and(COALESCE(ledger."gameId"=game.id AND ledger."playerId"::text=target->>'playerId' AND ledger.role::text=target->>'role' AND preset.version='ubp-v9-experimental'
     AND stat.id::text=target->>'statId' AND stat."contentHash"=target->>'statHash' AND stat."gameId"=game.id AND stat."playerId"=ledger."playerId" AND stat.role=ledger.role
     AND cardinality(entry."missingStats")=0 AND entry."calculatedAt"<=${at} AND stat."recordedAt"<=${at}
     AND NOT EXISTS(SELECT 1 FROM "ScoreLedgerEntry" later WHERE later."ledgerId"=entry."ledgerId" AND later.sequence>entry.sequence AND later."calculatedAt"<=${at})
     AND NOT EXISTS(SELECT 1 FROM "ProfessionalSyncState" selection WHERE selection.provider='internal-source-selection' AND selection.sport=game.sport AND selection.stream='game:'||game.id::text||':player:'||ledger."playerId"::text AND selection."lastFailure" IS NOT NULL AND selection."nextPollAt"<=${at}),false))
     AND COUNT(DISTINCT target->>'playerId')=COUNT(*) AS complete
   FROM jsonb_array_elements(COALESCE(box.normalized->'statistics','[]'::jsonb)) target
   LEFT JOIN "ScoreLedgerEntry" entry ON entry.id::text=target->>'scoreEntryId'
   LEFT JOIN "ScoreLedger" ledger ON ledger.id=entry."ledgerId"
   LEFT JOIN "ScoringPreset" preset ON preset.id=ledger."presetId"
   LEFT JOIN "PlayerGameStat" stat ON stat.id=entry."statId") bound ON true
 WHERE game.sport=${input.sport}::"Sport" AND game."seasonId"=${input.seasonId}::uuid
 ORDER BY COALESCE(clock."observedAt",box."observedAt") DESC,box.id DESC LIMIT 1`;
 return row?{...row,enriched:false,fieldSources:null,observedAt:null,checkedAt:null,sourceFailure:null,phase:'FINAL',missingStats:[] as string[]}:null;
}
