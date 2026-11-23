import { notFound } from "next/navigation";
import { inviteAction } from "@/app/actions/leagues";
import { LeagueShell } from "@/components/league-shell";
import { requireSession } from "@/lib/auth";
import { leagueContext } from "@/server/league";

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ invite?: string }> }) {
  const { user } = await requireSession(); const { id } = await params; const query = await searchParams; const context = await leagueContext(user.id, id); if (!context) notFound();
  const inviteUrl = query.invite ? `${process.env.AUTH_URL}/join/${query.invite}` : null;
  return <LeagueShell leagueId={id}><div className="workspace-intro"><p className="eyebrow">Commissioner controls</p><h1 className="display">League settings</h1></div>
    <div className="league-details"><section className="panel"><h2 className="display">Configuration</h2><dl className="definition-list"><dt>Sport</dt><dd>{context.league.primarySport}</dd><dt>Season</dt><dd>{context.league.seasonYear}</dd><dt>Teams</dt><dd>{context.league.maxTeams}</dd><dt>Scoring</dt><dd>{context.league.preset.name}</dd><dt>Starters</dt><dd>{context.league.rosterSlots.join(", ")}</dd><dt>Bench</dt><dd>{context.league.benchSlots}</dd></dl></section>
    {context.role === "COMMISSIONER" && <form className="panel form-grid" action={inviteAction.bind(null, id)}><h2 className="display">Invite manager</h2><label>Email restriction, optional<input name="email" type="email" /></label><button className="button primary">Create secure link</button>{inviteUrl && <><label>Invitation URL<input readOnly value={inviteUrl} /></label><p className="muted">This link expires in seven days and can be used once.</p></>}</form>}</div>
  </LeagueShell>;
}
