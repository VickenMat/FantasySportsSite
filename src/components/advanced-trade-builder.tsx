"use client";
import { useActionState, useState } from "react";
import { advancedTradeResponse, saveAdvancedTrade, tradeReviewAction } from "@/app/actions/advanced-trades";
import type { TradeAssets } from "@/server/advanced-trades";

export type RoutedAsset = { key: string; type: "PLAYER" | "PICK"; id: string; from: string; label: string };
type Team = { id: string; name: string };
export function AdvancedTradeBuilder({ leagueId, teams, choices, sports, salaryMode, faabEnabled, initial, proposalId, revision }: {
  leagueId: string; teams: Team[]; choices: RoutedAsset[]; sports: { id: string; sport: string }[]; salaryMode: boolean; faabEnabled: boolean;
  initial?: TradeAssets; proposalId?: string; revision?: number;
}) {
  const [assets, setAssets] = useState<TradeAssets>(initial ?? []);
  const [message, action, pending] = useActionState(saveAdvancedTrade.bind(null, leagueId), "");
  const [source, setSource] = useState(teams[0]?.id ?? "");
  const [destination, setDestination] = useState(teams[1]?.id ?? "");
  const [sportId, setSportId] = useState(sports[0]?.id ?? "");
  const [amount, setAmount] = useState(1);
  const name = (id: string) => teams.find((team) => team.id === id)?.name ?? id;
  function route(choice: RoutedAsset, target: string) {
    setAssets((current) => {
      const next = current.filter((asset) => (asset.type === "PLAYER" || asset.type === "CUT") ? asset.playerId !== choice.id : asset.type !== "PICK" || asset.pickId !== choice.id);
      if (!target) return next;
      return [...next, choice.type === "PICK" ? { type: "PICK", from: choice.from, to: target, pickId: choice.id } : target === "CUT" ? { type: "CUT", from: choice.from, playerId: choice.id } : { type: "PLAYER", from: choice.from, to: target, playerId: choice.id }];
    });
  }
  return <form action={action} className="form-grid trade-builder-grid"><input type="hidden" name="assets" value={JSON.stringify(assets)} /><input type="hidden" name="proposalId" value={proposalId ?? ""} /><input type="hidden" name="revision" value={revision ?? ""} />

    {teams.map((team) => <fieldset className="franchise-assets" key={team.id}><legend>{team.name} · outgoing</legend><div className="incoming-assets"><strong>Incoming</strong>{assets.filter(asset=>"to" in asset&&asset.to===team.id).map((asset,i)=><small key={i}>{asset.type=== "PLAYER" || asset.type=== "PICK" ? choices.find(c=>c.id===("playerId" in asset?asset.playerId:asset.pickId))?.label : asset.type=== "FAAB" || asset.type=== "CAP" ? `${asset.amount} ${asset.type}` : ""}</small>)}</div>{choices.filter((choice) => choice.from === team.id).map((choice) => {
      const routed = assets.find((asset) => (asset.type === "PLAYER" || asset.type === "CUT") ? asset.playerId === choice.id : asset.type === "PICK" && asset.pickId === choice.id);
      return <label key={choice.key}>{choice.label}<select aria-label={`Destination for ${choice.label}`} value={routed ? "to" in routed ? routed.to : "CUT" : ""} onChange={(event) => route(choice, event.target.value)}><option value="">Keep on current franchise</option>{teams.filter(({ id }) => id !== team.id).map((target) => <option value={target.id} key={target.id}>Send to {target.name}</option>)}{choice.type === "PLAYER" && <option value="CUT">Authorize release</option>}</select></label>;
    })}</fieldset>)}
    {(salaryMode || faabEnabled) && <fieldset><legend>Current eligible funds</legend><label>From<select value={source} onChange={(event) => setSource(event.target.value)}>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><label>To<select value={destination} onChange={(event) => setDestination(event.target.value)}>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><label>Sport account<select value={sportId} onChange={(event) => setSportId(event.target.value)}>{sports.map((sport) => <option value={sport.id} key={sport.id}>{sport.sport}</option>)}</select></label><label>Amount<input type="number" min="1" max="1000000" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label><button type="button" className="button secondary" disabled={source === destination || !Number.isInteger(amount) || amount < 1} onClick={() => setAssets((current) => [...current, { type: salaryMode ? "CAP" : "FAAB", from: source, to: destination, leagueSportId: sportId, amount }])}>Add {salaryMode ? "cap" : "FAAB"} transfer</button></fieldset>}
    <ol aria-label="Proposed assets">{assets.map((asset, index) => <li key={index}>{name(asset.from)} → {"to" in asset ? name(asset.to) : "Release"}: {asset.type === "PLAYER" || asset.type === "CUT" || asset.type === "PICK" ? choices.find((choice) => choice.id === ("playerId" in asset ? asset.playerId : asset.pickId))?.label ?? "Asset unavailable" : `${asset.amount} ${asset.type} (${sports.find((sport) => sport.id === asset.leagueSportId)?.sport ?? "Account"})`} <button type="button" onClick={() => setAssets((current) => current.filter((_, i) => i !== index))}>Remove asset</button></li>)}</ol>
    <label>Offer expiry<select name="expiryHours" defaultValue="168"><option value="48">48 hours</option><option value="72">72 hours</option><option value="168">7 days</option></select></label><button className="button primary" disabled={pending || !assets.length}>{proposalId ? "Save revised terms; reset acceptances" : "Propose multi-asset trade"}</button>{message && <p role="status">{message}</p>}
  </form>;
}
export function AdvancedTradeResponse({ leagueId, proposalId, revision, operation }: { leagueId: string; proposalId: string; revision: number; operation: "ACCEPT" | "CANCEL" | "VETO" }) {
  const [message, action, pending] = useActionState(advancedTradeResponse.bind(null, leagueId, proposalId, revision, operation), "");
  return <form action={action}>{operation !== "ACCEPT" && <label>Reason<input name="reason" required minLength={5} maxLength={1000} /></label>}<button className="button secondary" disabled={pending}>{operation === "ACCEPT" ? `Accept revision ${revision}` : operation === "VETO" ? "Commissioner veto" : "Cancel pending proposal"}</button>{message && <p role="status">{message}</p>}</form>;
}
export function TradeReviewForm({ leagueId, hours }: { leagueId: string; hours: number }) {
  const [message, action, pending] = useActionState(tradeReviewAction.bind(null, leagueId), "");
  return <form action={action}><label>Review period for future proposals (hours)<input type="number" name="reviewHours" min="0" max="168" defaultValue={hours} /></label><button className="button secondary" disabled={pending}>Save review policy</button>{message && <p role="status">{message}</p>}</form>;
}
