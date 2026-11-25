"use client";

import { useActionState } from "react";
import { provisionFuturePicksAction } from "@/app/actions/leagues";

export function FuturePickGrantForm({ leagueId, leagueSportId }: { leagueId: string; leagueSportId: string }) {
  const grant = provisionFuturePicksAction.bind(null, leagueId, leagueSportId);
  const [message, submit, pending] = useActionState(grant, "");
  return <form action={submit}>
    <button className="button secondary" disabled={pending}>Grant future picks</button>
    {message && <p role="status">{message}</p>}
  </form>;
}
