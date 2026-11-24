"use client";

import { useMemo, useState } from "react";
import { proposeTradeAction } from "@/app/actions/leagues";

type Player = { id: string; name: string; sport: string; positions: string[]; team: string | null; avg: string; points: string };
type Team = { id: string; name: string; rosters: Record<string, Player[]> };

function PlayerChoice({ player, name, checked, onChange, disabled }: { player: Player; name: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return <label className="trade-player"><input type="checkbox" name={name} value={player.id} checked={checked} onChange={onChange} disabled={disabled} /><span><strong>{player.name}</strong><small>{player.positions.join(", ") || "POS N/A"} · {player.team ?? "TEAM N/A"}</small></span><span><small>AVG</small>{player.avg}</span><span><small>PTS</small>{player.points}</span></label>;
}

export function TradeBuilder({ leagueId, myTeam, partners, sports, limits }: { leagueId: string; myTeam: Team; partners: Team[]; sports: string[]; limits: Record<string, number> }) {
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? "");
  const [offers, setOffers] = useState<Set<string>>(new Set());
  const [requests, setRequests] = useState<Set<string>>(new Set());
  const [cuts, setCuts] = useState<Set<string>>(new Set());
  const partner = partners.find(({ id }) => id === partnerId);
  const byId = useMemo(() => new Map([...sports.flatMap((sport) => myTeam.rosters[sport] ?? []), ...sports.flatMap((sport) => partner?.rosters[sport] ?? [])].map((player) => [player.id, player])), [myTeam, partner, sports]);
  const required = Object.fromEntries(sports.map((sport) => {
    const outgoing = [...offers].filter((id) => byId.get(id)?.sport === sport).length;
    const incoming = [...requests].filter((id) => byId.get(id)?.sport === sport).length;
    return [sport, Math.max(0, (myTeam.rosters[sport]?.length ?? 0) - outgoing + incoming - limits[sport])];
  }));
  const selectedCuts = Object.fromEntries(sports.map((sport) => [sport, [...cuts].filter((id) => byId.get(id)?.sport === sport).length]));
  const canSubmit = offers.size + requests.size > 0 && sports.every((sport) => selectedCuts[sport] === required[sport]);
  function toggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) { setter((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }

  return <form action={proposeTradeAction.bind(null, leagueId)} className="panel trade-builder form-grid">
    <div className="section-heading"><div><h2 className="display">Build a trade</h2><p className="muted">One atomic proposal can contain players from every sport in this league.</p></div><label>Trade partner<select name="recipientTeamId" required value={partnerId} onChange={(event) => { setPartnerId(event.target.value); setRequests(new Set()); }}><option value="" disabled>Select a franchise</option>{partners.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label></div>
    <div className="trade-columns"><section><h3>{myTeam.name}</h3>{sports.map((sport) => <fieldset key={sport}><legend>{sport} roster</legend>{(myTeam.rosters[sport] ?? []).map((player) => <PlayerChoice key={player.id} player={player} name="offerPlayerIds" checked={offers.has(player.id)} onChange={() => { toggle(setOffers, player.id); if (cuts.has(player.id)) toggle(setCuts, player.id); }} />)}{!myTeam.rosters[sport]?.length && <p className="muted">No players</p>}</fieldset>)}</section>
      <section><h3>{partner?.name ?? "Trading partner"}</h3>{sports.map((sport) => <fieldset key={sport}><legend>{sport} roster</legend>{(partner?.rosters[sport] ?? []).map((player) => <PlayerChoice key={player.id} player={player} name="requestPlayerIds" checked={requests.has(player.id)} onChange={() => toggle(setRequests, player.id)} />)}{!partner?.rosters[sport]?.length && <p className="muted">No players</p>}</fieldset>)}</section></div>
    <section className="trade-preview"><h3>Trade preview</h3><div className="trade-sides"><div><strong>I send</strong>{[...offers].map((id) => <p key={id}>{byId.get(id)?.sport} · {byId.get(id)?.name}</p>)}{!offers.size && <p className="muted">No players selected</p>}</div><div><strong>I receive</strong>{[...requests].map((id) => <p key={id}>{byId.get(id)?.sport} · {byId.get(id)?.name}</p>)}{!requests.size && <p className="muted">No players selected</p>}</div></div>
      <div className="capacity-grid">{sports.map((sport) => { const current = myTeam.rosters[sport]?.length ?? 0; const outgoing = [...offers].filter((id) => byId.get(id)?.sport === sport).length; const incoming = [...requests].filter((id) => byId.get(id)?.sport === sport).length; return <div key={sport}><strong>{sport}</strong><span>{current} current − {outgoing} outgoing + {incoming} incoming = {current - outgoing + incoming}</span><small>Maximum {limits[sport]} · {required[sport]} cut{required[sport] === 1 ? "" : "s"} required</small></div>; })}</div></section>
    {sports.some((sport) => required[sport] > 0) && <fieldset><legend>Authorize my required roster cuts</legend>{sports.filter((sport) => required[sport] > 0).map((sport) => <div key={sport}><strong>Select exactly {required[sport]} {sport} cut{required[sport] === 1 ? "" : "s"}</strong>{(myTeam.rosters[sport] ?? []).filter(({ id }) => !offers.has(id)).map((player) => <PlayerChoice key={player.id} player={player} name="proposerCutPlayerIds" checked={cuts.has(player.id)} onChange={() => toggle(setCuts, player.id)} />)}</div>)}</fieldset>}
    <label>Message<textarea name="message" maxLength={500} /></label><label>Expires in<select name="expiresInHours" defaultValue="48"><option value="24">24 hours</option><option value="48">48 hours</option><option value="72">72 hours</option><option value="168">7 days</option></select></label>
    <button className="button primary" disabled={!partner || !canSubmit}>Send atomic proposal</button>
  </form>;
}
