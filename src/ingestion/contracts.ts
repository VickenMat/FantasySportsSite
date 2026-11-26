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
]);
export const observationSchema = z.object({
  provider: z.string().min(1).max(100), sport: z.enum(["NFL", "MLB", "NBA", "NHL"]), entityKey: z.string().min(1).max(300),
  revisionToken: z.string().min(1).max(200), revisionOrdinal: z.number().int().nonnegative().safe().nullable(),
  sourceReference: z.url().refine(value => {const u=new URL(value);return !u.username&&!u.password&&![...u.searchParams.keys()].some(k=>/^(key|api[-_]?key|token|access_token|authorization|password|subscription[-_]?key|ocp-apim-subscription-key)$/i.test(k));}, "Source references cannot contain credentials."),
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
export type ProviderPolicy={ provider:string; sport:Observation["sport"]; stream:string; minIntervalMs:number; maxRequests:number; leaseMs:number; permission:"FIXTURE_ONLY" | "DISABLED" };
export interface ProviderAdapter { fetchPage(cursor:string|null):Promise<ProviderPage> }
export class ProviderFailure extends Error { constructor(public status:number,public retryAfterMs:number|null=null){super(`Provider request failed (HTTP ${status}).`);} }
export function retryDelay(failures:number,minIntervalMs:number,retryAfterMs:number|null) {return Math.max(minIntervalMs,retryAfterMs??0,Math.min(86400000,1000*2**Math.min(failures,16)));}
