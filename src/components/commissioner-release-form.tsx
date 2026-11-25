"use client";
import { useActionState } from "react";
import { commissionerReleaseAction } from "@/app/actions/leagues";

export function CommissionerReleaseForm({ leagueId, entryId, name }: { leagueId: string; entryId: string; name: string }) {
  const [message, submit, pending] = useActionState(commissionerReleaseAction.bind(null, leagueId, entryId), "");
  return <details><summary>Release {name}</summary><form action={submit}><p>This explicitly releases this player to waivers and records your reason in the permanent audit history.</p><label>Correction reason<input name="reason" required minLength={10} maxLength={1000} /></label><button className="button compact secondary" disabled={pending}>Confirm release of {name}</button>{message && <p role="status">{message}</p>}</form></details>;
}
