"use client";

import { useActionState, useRef, useState, useSyncExternalStore } from "react";
import { configureDraftAction } from "@/app/actions/leagues";

type Team = { id: string; name: string };
const subscribeTimezone = () => () => {};
const localTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
type DraftConfigurationProps = {
  leagueId: string; leagueSportId: string; seasonLabel: string; teams: Team[]; enabled: boolean; auctionEnabled: boolean; salaryMode: boolean; universalAvailable: boolean;
  current: { scope: string; method: string; version: number; order: string[]; orderMethod: string; rounds: number; secondsPerPick: number; scheduledAt: string | null; timezone: string };
};
export function DraftConfiguration(props: DraftConfigurationProps) {
  const [message, submit, pending] = useActionState(configureDraftAction.bind(null, props.leagueId, props.leagueSportId), "");
  return <DraftConfigurationForm key={props.current.version} {...props} message={message} submit={submit} pending={pending} />;
}
function DraftConfigurationForm({ seasonLabel, teams, current, enabled, auctionEnabled, salaryMode, universalAvailable, message, submit, pending }: DraftConfigurationProps & { message: string; submit: (form: FormData) => void; pending: boolean }) {
  const [method, setMethod] = useState(current.orderMethod);
  const [order, setOrder] = useState(current.order.length === teams.length && current.order.every((id) => teams.some((team) => team.id === id)) ? current.order : teams.map(({ id }) => id));
  const [instant, setInstant] = useState(current.scheduledAt ?? "");
  const zone = useSyncExternalStore(subscribeTimezone, localTimezone, () => current.timezone);
  const dragged = useRef<number | null>(null);
  function move(from: number, to: number) {
    if (to < 0 || to >= order.length) return;
    setOrder((values) => { const result = [...values]; const [item] = result.splice(from, 1); result.splice(to, 0, item); return result; });
  }
  return <section className="panel"><h2 className="display">Configure initial draft</h2><p>{seasonLabel} · {teams.length} participating franchises. Settings are locked when drafting begins.</p>
    {!enabled && <p role="status">Scheduling requires approval and deployment of the prepared additive draft-center migration.</p>}
    <form action={submit} className="form-grid"><input type="hidden" name="version" value={current.version} /><input type="hidden" name="order" value={JSON.stringify(order)} /><input type="hidden" name="scheduledAt" value={instant} /><input type="hidden" name="timezone" value={zone} />
      <label>Draft coverage<select name="scope" defaultValue={current.scope}><option value="SPORT">Selected sport</option><option value="UNIVERSAL" disabled={!universalAvailable}>Universal · all league sports</option></select></label>
      <label>Draft type<select name="method" defaultValue={salaryMode ? "AUCTION" : current.method}><option value="SNAKE" disabled={salaryMode}>Snake</option><option value="AUCTION" disabled={!auctionEnabled}>Auction</option></select></label>
      <p>For auctions, saved order controls nominations. Winning bids determine acquisition ownership.</p>
      <label>Draft date and time ({zone})<input name="scheduledLocal" type="datetime-local" onChange={(event) => { const date = new Date(event.target.value); setInstant(Number.isNaN(+date) ? "" : date.toISOString()); }} /></label>
      {current.scheduledAt && <p>Saved start: {current.scheduledAt} · {current.timezone}. Leave the local control blank to retain this instant.</p>}
      {instant && <p>Canonical start: {instant}</p>}
      <label>Draft timer (seconds)<input name="secondsPerPick" type="number" min="15" max="600" defaultValue={current.secondsPerPick} /></label>
      <label>Draft rounds per franchise<input name="rounds" type="number" min="1" max="100" defaultValue={current.rounds} /></label>
      <label>Initial draft order<select name="orderMethod" value={method} onChange={(event) => setMethod(event.target.value)}><option value="RANDOM">Random</option><option value="CUSTOM">Custom</option></select></label>
      <ol aria-label="Initial draft order">{order.map((id, index) => <li key={id} draggable={method === "CUSTOM"} onDragStart={() => { dragged.current = index; }} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (method === "CUSTOM" && dragged.current != null) move(dragged.current, index); dragged.current = null; }}>
        {index + 1}. {teams.find((team) => team.id === id)?.name ?? id} {method === "CUSTOM" && <><button type="button" disabled={index === 0} onClick={() => move(index, index - 1)} aria-label={`Move ${teams.find((team) => team.id === id)?.name} up`}>↑</button><button type="button" disabled={index === order.length - 1} onClick={() => move(index, index + 1)} aria-label={`Move ${teams.find((team) => team.id === id)?.name} down`}>↓</button></>}
      </li>)}</ol>
      <button className="button primary" disabled={!enabled || pending}>Save Draft Order and Schedule</button>
      {method === "RANDOM" && <button className="button secondary" name="regenerate" value="true" disabled={!enabled || pending}>Explicitly regenerate random order</button>}
      {message && <p role="status">{message}</p>}
    </form></section>;
}
