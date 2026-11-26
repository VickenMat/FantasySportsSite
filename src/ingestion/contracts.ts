import { createHash } from "node:crypto";
import { z } from "zod";
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,entry])=>entry!==undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const fingerprint = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");
const external = z.object({ provider: z.string().min(1).max(100), externalId: z.string().min(1).max(200) }).strict();
const normalized = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PLAYER"), externalId: z.string().min(1).max(200), displayName: z.string().trim().min(1).max(200), links: z.array(external).max(20), discovery: z.enum(["EXISTING", "NEW"]) }).strict(),
  z.object({ kind: z.literal("POSITION"), player: external, seasonStartYear: z.number().int().min(1900).max(2200), code: z.string().regex(/^[A-Z0-9]{1,12}$/), evidenceKind: z.enum(["LISTED", "FIELDING"]), gameId: z.uuid().optional(), started: z.boolean().optional() }).strict(),
  z.object({ kind:z.literal("AVAILABILITY"), player:external, game:external.nullable(), designation:z.enum(["ACTIVE","QUESTIONABLE","DOUBTFUL","OUT","INJURED_RESERVE","SUSPENDED","RETIRED","UNKNOWN"]), irEligible:z.boolean(), expiresAt:z.iso.datetime({offset:true}).nullable() }).strict(),
  z.object({ kind:z.literal("ROOKIE"), player:external, seasonStartYear:z.number().int().min(1900).max(2200), eligible:z.boolean(), classificationBasis:z.string().trim().min(1).max(1000) }).strict(),
  z.object({ kind:z.literal("GAME_COMPLETION"), game:external, completedAt:z.iso.datetime({offset:true}) }).strict(),
  z.object({ kind:z.literal("TEAM_ASSIGNMENT"), player:external, team:external.nullable(), seasonStartYear:z.number().int().min(1900).max(2200), assignment:z.enum(["ROSTERED","FREE_AGENT"]) }).strict(),
  z.object({kind:z.literal("POSITION_REVISION"),originalObservationId:z.uuid(),replacements:z.array(z.object({code:z.string().regex(/^[A-Z0-9]{1,12}$/),started:z.boolean().optional()}).strict()).max(12)}).strict(),
  z.object({kind:z.literal("STAT"),player:external,game:external,team:external,role:z.enum(["FOOTBALL","HITTER","PITCHER","BASKETBALL","SKATER","GOALIE"]),phase:z.enum(["LIVE","FINAL","CORRECTION"]),publicationSemantics:z.enum(["UNVERIFIED","OFFICIAL_BOX_SCORE"]),initialPublishedAt:z.iso.datetime({offset:true}).nullable().optional(),stats:z.record(z.string().regex(/^[A-Za-z0-9_]{1,64}$/),z.number().finite().nullable()).refine(value=>Object.keys(value).length<=200)}).strict(),
  z.object({kind:z.literal("GAME_STATE"),game:external,status:z.enum(["SCHEDULED","LIVE","SUSPENDED","POSTPONED","FINAL","CANCELLED"]),scheduledStartsAt:z.iso.datetime({offset:true}).nullable(),actualStartsAt:z.iso.datetime({offset:true}).nullable(),completedAt:z.iso.datetime({offset:true}).nullable()}).strict(),
  z.object({kind:z.literal("SEASON_BOUNDARY"),seasonStartYear:z.number().int().min(1900).max(2200),label:z.string().trim().min(1).max(30),status:z.enum(["AVAILABLE","INCOMPLETE","UNAVAILABLE"]),independentlyVerified:z.boolean(),regularSeasonStartsAt:z.iso.datetime({offset:true}).nullable(),regularSeasonEndsAt:z.iso.datetime({offset:true}).nullable(),postseasonStartsAt:z.iso.datetime({offset:true}).nullable(),postseasonEndsAt:z.iso.datetime({offset:true}).nullable(),reason:z.string().max(1000).nullable()}).strict(),
  z.object({kind:z.literal("TEAM_IDENTITY"),externalId:z.string().min(1).max(200),displayName:z.string().trim().min(1).max(200),code:z.string().max(20).nullable(),links:z.array(external).max(20),discovery:z.enum(["EXISTING","NEW"])}).strict(),
  z.object({kind:z.literal("GAME_IDENTITY"),externalId:z.string().min(1).max(200),links:z.array(external).max(20),discovery:z.enum(["EXISTING","NEW"]),seasonStartYear:z.number().int().min(1900).max(2200),phase:z.enum(["REGULAR","POSTSEASON","PRESEASON","UNKNOWN"]),gameDate:z.iso.date().nullable(),scheduledStartsAt:z.iso.datetime({offset:true}).nullable(),teams:z.array(z.object({team:external,side:z.enum(["HOME","AWAY","UNKNOWN"])}).strict()).max(2)}).strict(),
]);
export const observationSchema = z.object({
  provider: z.string().min(1).max(100), sport: z.enum(["NFL", "MLB", "NBA", "NHL"]), entityKey: z.string().min(1).max(300),
  revisionToken: z.string().min(1).max(200), revisionOrdinal: z.number().int().nonnegative().safe().nullable(),
  sourceReference: z.url().refine(value => {const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&![...u.searchParams.keys()].some(k=>/^(key|api[-_]?key|token|access_token|authorization|password|subscription[-_]?key|ocp-apim-subscription-key)$/i.test(k));}, "Use a public HTTPS source reference without credentials."),
  observedAt: z.iso.datetime({ offset: true }), effectiveAt: z.iso.datetime({ offset: true }).nullable(), publishedAt: z.iso.datetime({ offset: true }).nullable(),
  raw: z.record(z.string(), z.json()), normalized,
}).strict().superRefine((value,ctx)=>{
  if(value.publishedAt && +new Date(value.publishedAt)>+new Date(value.observedAt))ctx.addIssue({code:"custom",message:"Publication cannot be later than observation."});
});
export type Observation = z.infer<typeof observationSchema>;
export function contentFingerprint(input: Observation) {
  const { observedAt: _observed, ...content }=input; void _observed;
  return fingerprint(content);
}
export type ProviderPage={ records: Observation[]; nextCursor: string | null };
export type ProviderPolicy={ provider:string; sport:Observation["sport"]; stream:string; gameId?:string; minIntervalMs:number; maxRequests:number; requestWindows?:{limit:number;windowMs:number}[]; leaseMs:number; permission:"FIXTURE_ONLY" | "DISABLED" };
export interface ProviderAdapter { fetchPage(cursor:string|null):Promise<ProviderPage> }
export class ProviderFailure extends Error { constructor(public status:number,public retryAfterMs:number|null=null){super(`Provider request failed (HTTP ${status}).`);} }
export function retryDelay(failures:number,minIntervalMs:number,retryAfterMs:number|null) {return Math.max(minIntervalMs,retryAfterMs??0,Math.min(86400000,1000*2**Math.min(failures,16)));}
