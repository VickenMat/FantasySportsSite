"use client";
import { useActionState } from "react";
import { bidAuctionAction, nominateAuctionAction, financePolicyAction } from "@/app/actions/leagues";

export function NominateAuctionForm({ leagueId, leagueSportId, playerId, draftId, disabled = false }: { leagueId: string; leagueSportId: string; playerId: string; draftId?: string; disabled?: boolean }) {
  const [message, submit, pending] = useActionState(nominateAuctionAction.bind(null, leagueId, leagueSportId, playerId, draftId ?? null), "");
  return <form action={submit}><button className="button compact primary" disabled={pending || disabled}>Nominate</button>{message && <p role="status">{message}</p>}</form>;
}
export function AuctionBidForm({ leagueId, auctionId, minimum, ownMaximum }: { leagueId: string; auctionId: string; minimum: number; ownMaximum?: number }) {
  const [message, submit, pending] = useActionState(bidAuctionAction.bind(null, leagueId, auctionId), "");
  return <form action={submit}><label>My maximum bid<input name="maximum" type="number" min={minimum} step="1" required defaultValue={ownMaximum ? ownMaximum + 1 : minimum} /></label>{ownMaximum != null && <p>Your current maximum: {ownMaximum}</p>}<button className="button secondary" disabled={pending}>Submit bid</button>{message && <p role="status">{message}</p>}</form>;
}
export function FinancePolicyForm({ leagueId, enabled }: { leagueId: string; enabled: boolean }) {
  const [message, submit, pending] = useActionState(financePolicyAction.bind(null, leagueId), "");
  return <form action={submit} className="form-grid"><label>Financial format<select name="mode"><option value="TRADITIONAL">Traditional auction draft budget</option><option value="SALARY">Salary dynasty</option></select></label><label>Budget or cap scope<select name="scope"><option value="SPORT">Per sport</option><option value="UNIVERSAL">Universal</option></select></label><label>Integer budget / cap<input name="amount" type="number" min="1" max="1000000" placeholder="Salary defaults: 400 per sport or 500 universal" /></label><p>Traditional auction budgets require an explicit amount. Salary caps follow players and increase by 2 at each applicable sport rollover. Contracts remain inactive.</p><button className="button primary" disabled={!enabled || pending}>Configure auction finances</button>{message && <p role="status">{message}</p>}</form>;
}
