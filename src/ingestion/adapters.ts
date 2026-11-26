import { z } from "zod";
import { observationSchema, type Observation, type ProviderAdapter, type ProviderPage } from "./contracts";

/** Pure decoder only. No request, credential, license acceptance or publication-time inference. */
export function decodeSportsDataIoPlayers(payload: unknown, metadata: {
 sport:Observation["sport"];observedAt:string;sourceReference:string;revisionToken:string;revisionOrdinal:number|null;
 links?:ReadonlyMap<string,{provider:string;externalId:string}[]>;
}) {
 const rows=z.array(z.object({PlayerID:z.number().int().positive().safe(),FirstName:z.string().trim().min(1),LastName:z.string().trim().min(1)}).passthrough()).max(1000).parse(payload);
 return rows.map(row=>observationSchema.parse({provider:"sportsdataio",sport:metadata.sport,entityKey:`player:${row.PlayerID}`,revisionToken:metadata.revisionToken,revisionOrdinal:metadata.revisionOrdinal,sourceReference:metadata.sourceReference,observedAt:metadata.observedAt,effectiveAt:null,publishedAt:null,raw:row,
  normalized:{kind:"PLAYER",externalId:String(row.PlayerID),displayName:`${row.FirstName} ${row.LastName}`,links:metadata.links?.get(String(row.PlayerID))??[],discovery:"EXISTING"}}));
}
/** A bounded local page is the only enabled adapter until a provider license is selected. */
export class LocalPageAdapter implements ProviderAdapter {
 constructor(private readonly page:ProviderPage) {}
 async fetchPage():Promise<ProviderPage> {return this.page;}
}
export function decodeLocalPage(value:unknown):ProviderPage {
 const page=z.object({records:z.array(observationSchema).max(1000),nextCursor:z.string().max(2000).nullable()}).strict().parse(value);
 return page;
}
