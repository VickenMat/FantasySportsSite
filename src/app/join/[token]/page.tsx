import { joinLeagueAction } from "@/app/actions/leagues";
import { DashboardHeader } from "@/components/dashboard-header";
import { requireSession } from "@/lib/auth";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  await requireSession();
  const { token } = await params;
  return <><DashboardHeader /><main id="main" className="shell workspace narrow"><section className="panel">
    <p className="eyebrow">League invitation</p><h1 className="display">Join the competition</h1>
    <p className="muted">Invitation links expire after seven days and can be accepted once.</p>
    <form action={joinLeagueAction.bind(null, token)}><button className="button primary" type="submit">Join league</button></form>
  </section></main></>;
}
