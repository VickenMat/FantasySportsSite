"use client";

import { useActionState } from "react";
import { correctFuturePickAction, rookieDraftAction } from "@/app/actions/leagues";

type Team = { id: string; name: string };
export function RookieDraftForm({ leagueId, leagueSportId }: { leagueId: string; leagueSportId: string; teams?: Team[] }) {
  const [message, submit, pending] = useActionState(rookieDraftAction.bind(null, leagueId, leagueSportId), "");
  return <details><summary>Start rookie draft</summary><form action={submit} className="form-grid">
    <p>Traditional dynasty only. Requires current-season pick entitlements and verified rookie evidence. Temporary overflow must be corrected before the season.</p>
    <label>Rounds<select name="rounds" defaultValue="4">{Array.from({ length: 100 }, (_, index) => index + 1).map((round) => <option key={round}>{round}</option>)}</select></label>
    <p>Order is reverse finalized sport standings: last place first, champion last, with the same original franchise slots every round. Lottery and custom rookie ordering are unavailable.</p>
    <label>Reason<input name="reason" minLength={5} required /></label><button className="button secondary" disabled={pending}>Start rookie draft</button>
    {message && <p role="status">{message}</p>}
  </form></details>;
}

export function FuturePickCorrectionForm({ leagueId, pickId, ownerTeamId, teams }: { leagueId: string; pickId: string; ownerTeamId: string; teams: Team[] }) {
  const [message, submit, pending] = useActionState(correctFuturePickAction.bind(null, leagueId, pickId), "");
  return <details><summary>Correct ownership</summary><form action={submit}><label>New owner<select name="ownerTeamId" defaultValue={ownerTeamId}>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Correction reason<input name="reason" required minLength={5} /></label><button className="button compact secondary" disabled={pending}>Record correction</button>{message && <p role="status">{message}</p>}</form></details>;
}
