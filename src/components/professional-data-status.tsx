import type{Sport}from"@/generated/prisma/enums";
import{DataFreshnessClock}from"./data-freshness-clock";
import{professionalDataFreshness}from"@/server/professional-data-freshness";
const format=(value:Date|null)=>value?new Intl.DateTimeFormat("en-US",{timeZone:"UTC",dateStyle:"medium",timeStyle:"long"}).format(value):"Unknown";
export async function ProfessionalDataStatus({sport,seasonId,historical=false}:{sport:Sport;seasonId:string;historical?:boolean}){
 const data=await professionalDataFreshness({sport,seasonId});
 return <section className="panel" aria-label={`${sport} source data status`}><h2 className="display">{sport} source data</h2>
  {historical&&<p className="muted">Historical replay; current professional data is verified separately.</p>}
  {data.status==="PENDING_DATA"?<p>Current source data is awaiting verification for this season.</p>:<>
   <p><strong>{data.status==="PENDING_REVIEW"?"Source verification pending":data.status==="PROVISIONAL"?"Provisional scoring data":"Official source publication recorded"}</strong>{data.source&&<> · <a href={data.source.reference} target="_blank" rel="noreferrer">Source</a></>}</p>
   <dl className="overview-grid"><div><dt>First received</dt><dd>{format(data.receivedAt)}</dd></div><div><dt>Latest publication</dt><dd>{format(data.publishedAt)}</dd></div><div><dt>Original final publication</dt><dd>{format(data.initialPublishedAt)}</dd></div><div><dt>Last checked</dt><dd>{format(data.checkedAt)}</dd></div><div><dt>Last scored</dt><dd>{format(data.scoredAt)}</dd></div></dl>
   {data.scoredAt&&<DataFreshnessClock scoredAt={data.scoredAt.toISOString()} />}
   {data.enriched&&<p className="muted">Missing fields were supplemented from reviewed sources; recorded primary values were retained. {data.source?.supplementalReferences.map(url=><a key={url} href={url} target="_blank" rel="noreferrer">Supplement: {new URL(url).hostname} </a>)}</p>}
   {data.status==="PENDING_REVIEW"||data.operationalAnchorInvalidated?<p className="muted">Correction clock under review.</p>:data.operationalAnchorAt&&data.operationalDeadlineAt?<p className="muted"><strong>{data.operationalAnchorMode==="OBSERVED_COMPLETE_BOX"?"Observed complete box clock":"Recorded publication clock"}</strong> · {data.boxObservedAt&&<>Validated {format(data.boxObservedAt)} · </>}Game correction deadline {format(data.operationalDeadlineAt)}</p>:!data.initialPublishedAt&&<p className="muted">Correction clock pending; original final publication time is unknown.</p>}
   {data.missingStats.length>0&&<p className="muted">Some required statistics are unknown. They are not treated as zero.</p>}
   <p className="muted">Source publication does not finalize fantasy results. The 24-hour correction window and competition rules still apply.</p>
  </>}
 </section>;
}
