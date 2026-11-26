import Link from 'next/link';
import {notFound} from 'next/navigation';
import {LeagueShell} from '@/components/league-shell';
import {requireSession} from '@/lib/auth';
import {getDatabase} from '@/lib/db';
import {leagueContext} from '@/server/league';
import {statisticDisplayName} from '@/scoring/display-names';
import {scoringComparisons} from '@/scoring/comparisons';
export default async function ScoringPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{sport?:string}>}){
 const {user}=await requireSession(),{id}=await params,query=await searchParams,context=await leagueContext(user.id,id);if(!context)notFound();
 const preset=await getDatabase().scoringPreset.findUniqueOrThrow({where:{id:context.league.presetId},include:{rules:{orderBy:[{applicability:'asc'},{statKey:'asc'}]}}});
 const sports=context.league.sports.map(s=>s.sport),selected=sports.find(s=>s===query.sport)??sports[0],comparisons=scoringComparisons(preset.rules.map(r=>({...r,coefficient:Number(r.coefficient)})),sports);
 return <LeagueShell leagueId={id}><div className="workspace-intro"><h1 className="display">Scoring</h1><p>{preset.name}</p><nav className="sport-tabs sport-colors" aria-label="Scoring sport">{sports.map(sport=><Link className={`sport-${sport} ${sport===selected?'active':''}`} aria-current={sport===selected?'page':undefined} key={sport} href={`?sport=${sport}`}>{sport}</Link>)}</nav></div><section className="panel"><h2>{selected} scoring</h2><table className="data-table"><thead><tr><th>Statistic</th><th>Points</th></tr></thead><tbody>{preset.rules.filter(r=>r.sport===selected).map(r=><tr key={r.id}><td>{statisticDisplayName(r.statKey)}</td><td>{r.coefficient.toFixed(1)}</td></tr>)}</tbody></table></section>{comparisons.length>0&&<section className="panel scoring-comparisons"><h2>Across the Sports</h2><ul>{comparisons.map(c=><li key={c.label}><small>{c.kind}</small> {c.label}</li>)}</ul><p className="muted">Statistical weights and specified events only. These comparisons do not establish season balance.</p></section>}</LeagueShell>;
}
