import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/league-shell";
import { requireSession } from "@/lib/auth";
import { listCommissionerAudit } from "@/server/commissioner-audit";
import { leagueContext } from "@/server/league";

export default async function CommissionerAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireSession();
  const { id } = await params;
  const context = await leagueContext(user.id, id);
  if (context?.role !== "COMMISSIONER") notFound();
  const events = await listCommissionerAudit(user.id, id);
  return <LeagueShell leagueId={id}>
    <div className="workspace-intro">
      <h1 className="display">Commissioner audit</h1>
    </div>
    <section className="panel">
      {events.length ? <ul className="transaction-list">
        {events.map((event) => <li key={event.id}>
          <strong>{event.reason}</strong>
          <span>{event.sport ?? "League"} · {event.effectiveAt.toISOString()}</span>
          <details>
            <summary>View changes</summary>
            <dl className="definition-list">
              <dt>Actor</dt><dd>{context.league.teams.find(({ managerId }) => managerId === event.actorUserId)?.manager?.name ?? event.actorUserId}</dd>
              <dt>Previous</dt><dd><code>{JSON.stringify(event.before)}</code></dd>
              <dt>Updated</dt><dd><code>{JSON.stringify(event.after)}</code></dd>
            </dl>
          </details>
        </li>)}
      </ul> : <p className="muted">No commissioner changes recorded.</p>}
    </section>
  </LeagueShell>;
}
