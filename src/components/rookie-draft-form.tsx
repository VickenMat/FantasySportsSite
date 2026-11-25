"use client";

import { useActionState, useState } from "react";
import { correctFuturePickAction, rookieDraftAction } from "@/app/actions/leagues";

type Team = { id: string; name: string };
export function RookieDraftForm({ leagueId, leagueSportId, teams }: { leagueId: string; leagueSportId: string; teams: Team[] }) {
  const [method, setMethod] = useState("REVERSE");
  const [message, submit, pending] = useActionState(rookieDraftAction.bind(null, leagueId, leagueSportId), "");
  return <details><summary>Start rookie draft</summary><form action={submit} className="form-grid">
    <p>Traditional dynasty only. Requires current-season pick entitlements and verified rookie evidence. Temporary overflow must be corrected before the season.</p>
    <label>Rounds<select name="rounds" defaultValue="4">{[1, 2, 3, 4].map((round) => <option key={round}>{round}</option>)}</select></label>
    <label>Order method<select name="method" value={method} onChange={(event) => setMethod(event.target.value)}><option value="REVERSE">Reverse finalized sport placement</option><option value="MANUAL">Commissioner manual order</option><option value="LOTTERY">Explicitly configured weighted lottery</option></select></label>
    {method === "MANUAL" && teams.map((team, index) => <label key={team.id}>Position {index + 1}<select name="teamId" defaultValue={team.id}>{teams.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>)}
    {method === "LOTTERY" && <><p>No lottery defaults are approved. Include all non-playoff franchises; worse finishes require greater weights.</p><label>Selected positions<input name="selectedPositions" type="number" min="1" max={teams.length} required /></label><label>Weights JSON (teamId and integer weight)<textarea name="weights" required placeholder='[{"teamId":"franchise UUID","weight":10}]' /></label></>}
    <label>Reason<input name="reason" minLength={5} required /></label><button className="button secondary" disabled={pending}>Start rookie draft</button>
    {message && <p role="status">{message}</p>}
  </form></details>;
}

export function FuturePickCorrectionForm({ leagueId, pickId, ownerTeamId, teams }: { leagueId: string; pickId: string; ownerTeamId: string; teams: Team[] }) {
  const [message, submit, pending] = useActionState(correctFuturePickAction.bind(null, leagueId, pickId), "");
  return <details><summary>Correct ownership</summary><form action={submit}><label>New owner<select name="ownerTeamId" defaultValue={ownerTeamId}>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Correction reason<input name="reason" required minLength={5} /></label><button className="button compact secondary" disabled={pending}>Record correction</button>{message && <p role="status">{message}</p>}</form></details>;
}
