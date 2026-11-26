import type{Sport}from"@/generated/prisma/enums";
import{getDatabase}from"@/lib/db";
import{observationSchema}from"@/ingestion/contracts";
import{professionalGameProjection}from"./professional-game-state";
export const measuredDelay=(after:Date|null,before:Date|null)=>after&&before&&after>=before?+after-+before:null;
/** Source, ingestion, normalization, scoring and display clocks are deliberately separate. */
export async function professionalDataFreshness(input:{sport:Sport;seasonId:string;asOf?:Date},client:Pick<ReturnType<typeof getDatabase>,"$queryRaw">=getDatabase()){
 const at=input.asOf??new Date();
 const [row]=await client.$queryRaw<{provider:string;initialPublishedAt:Date|null;enriched:boolean;sourceReference:string;observedAt:Date;publishedAt:Date|null;normalizedAt:Date;scoredAt:Date;missingStats:string[];phase:string;sourceFailure:string|null;gameEvidencePending:boolean;checkedAt:Date|null;fieldSources:Record<string,{sourceReference?:string|null}>|null}[]>`
  SELECT stat.provider, (stat.raw->'professionalObservation'->>'initialPublishedAt')::timestamptz AS "initialPublishedAt",
    COALESCE((stat.raw->'professionalObservation'->>'enriched')::boolean,false) AS enriched, stat.raw->'fieldSources' AS "fieldSources", observation."sourceReference", COALESCE((stat.raw->'professionalObservation'->>'receivedAt')::timestamptz,observation."observedAt") AS "observedAt", stat."sourceKnownAt" AS "publishedAt",
    stat."recordedAt" AS "normalizedAt", entry."calculatedAt" AS "scoredAt", entry."missingStats", observation.normalized->>'phase' AS phase, selection."lastFailure" AS "sourceFailure",
    (source_state.sources>0 AND source_start."resolvedStart" IS NULL) AS "gameEvidencePending",
    (SELECT MAX(sync."lastSuccessAt") FROM "ProfessionalSyncState" sync WHERE sync.provider=COALESCE(stat.raw->'professionalObservation'->>'primaryProvider',stat.provider) AND sync.sport=game.sport
      AND sync.stream IN ('STAT:game:'||game.id::text,'GAME_BUNDLE:game:'||game.id::text) AND sync."lastSuccessAt"<=${at}) AS "checkedAt"
  FROM "ScoreLedgerEntry" entry JOIN "ScoreLedger" ledger ON ledger.id=entry."ledgerId"
  JOIN "Game" game ON game.id=ledger."gameId" ${professionalGameProjection(at)} JOIN "PlayerGameStat" stat ON stat.id=entry."statId"
  JOIN "ProfessionalDataObservation" observation ON observation.id::text=stat.raw->'professionalObservation'->>'observationId'
  LEFT JOIN "ProfessionalSyncState" selection ON selection.provider='internal-source-selection' AND selection.sport=game.sport
    AND selection.stream='game:'||game.id::text||':player:'||ledger."playerId"::text AND selection."nextPollAt"<=${at}
  WHERE game.sport=${input.sport}::"Sport" AND game."seasonId"=${input.seasonId}::uuid
    AND entry."calculatedAt"<=${at} AND observation."observedAt"<=${at}
    AND (stat."sourceKnownAt" IS NULL OR stat."sourceKnownAt"<=${at})
    AND EXISTS(SELECT 1 FROM "ProfessionalDataDecision" decision WHERE decision."observationId"=observation.id AND decision.outcome='ACCEPTED')
  ORDER BY entry."calculatedAt" DESC, entry.sequence DESC, entry.id DESC LIMIT 1`;
 if(!row)return{status:"PENDING_DATA" as const,source:null,initialPublishedAt:null,enriched:false,checkedAt:null,receivedAt:null,publishedAt:null,normalizedAt:null,scoredAt:null,missingStats:[] as string[],delays:{publicationToReceiptMs:null,normalizationMs:null,scoringMs:null,serverRenderMs:null}};
 const status=row.sourceFailure||row.gameEvidencePending?"PENDING_REVIEW" as const:!row.publishedAt||!row.initialPublishedAt||row.missingStats.length||row.phase==="LIVE"?"PROVISIONAL" as const:"SOURCE_PUBLISHED" as const;
 const supplementalReferences=[...new Set(Object.values(row.fieldSources??{}).map(field=>field.sourceReference).filter((url):url is string=>typeof url==="string"&&url!==row.sourceReference&&observationSchema.shape.sourceReference.safeParse(url).success))];
 return{status,initialPublishedAt:row.initialPublishedAt,enriched:row.enriched,checkedAt:row.checkedAt,source:{provider:row.provider,reference:row.sourceReference,supplementalReferences},receivedAt:row.observedAt,publishedAt:row.publishedAt,normalizedAt:row.normalizedAt,scoredAt:row.scoredAt,missingStats:row.missingStats,delays:{publicationToReceiptMs:measuredDelay(row.observedAt,row.publishedAt),normalizationMs:measuredDelay(row.normalizedAt,row.observedAt),scoringMs:measuredDelay(row.scoredAt,row.normalizedAt),serverRenderMs:measuredDelay(at,row.scoredAt)}};
}
