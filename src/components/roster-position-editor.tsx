"use client";

import { useState } from "react";
import { lineupAction } from "@/app/actions/leagues";
import type { Sport } from "@/generated/prisma/enums";

export type PositionRow = {
  key: string;
  label: string;
  slot: string;
  index: number;
  entry: null | { id: string; playerId: string; sport: Sport; name: string; positions: string[]; team: string | null; locked: boolean };
};

export function RosterPositionEditor({ leagueId, rows, legalDestinations }: {
  leagueId: string;
  rows: PositionRow[];
  legalDestinations: Record<string, string[]>;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const source = rows.find(({ key }) => key === selectedKey);
  const legal = new Set(source?.entry ? legalDestinations[source.entry.id] ?? [] : []);

  return <div className="position-editor" data-testid="position-editor">
    {source?.entry && <div className="position-help" role="status"><span>Moving <strong>{source.entry.name}</strong>. Choose a highlighted destination.</span><button type="button" className="button compact secondary" onClick={() => setSelectedKey(null)}>Cancel</button></div>}
    <div className="roster-position-grid roster-position-head"><span>Slot</span><span>Player</span><span>TEAM</span><span>POS</span><span>AVG</span><span>PTS</span></div>
    {rows.map((row) => {
      const selected = row.key === selectedKey;
      const destination = Boolean(source?.entry && legal.has(row.key));
      const disabled = Boolean(source?.entry && !destination && !selected);
      const button = row.entry && !source ? <button type="button" className="position-button" disabled={row.entry.locked} aria-label={`Move ${row.entry.name} from ${row.label}`} onClick={() => setSelectedKey(row.key)}>{row.label}</button>
        : destination && source?.entry ? <form action={lineupAction.bind(null, leagueId)}>
          <input type="hidden" name="sport" value={source.entry.sport} />
          <input type="hidden" name="entryId" value={source.entry.id} />
          <input type="hidden" name="slot" value={row.slot} />
          <input type="hidden" name="slotIndex" value={row.index} />
          {row.entry && <input type="hidden" name="destinationEntryId" value={row.entry.id} />}
          <button className="position-button legal" aria-label={`Move ${source.entry.name} to ${row.label} ${row.index}`}>{row.label}</button>
        </form>
        : <button type="button" className={`position-button ${selected ? "selected" : ""}`} disabled={disabled || !row.entry}>{row.label}</button>;
      return <div key={row.key} className={`roster-position-grid roster-position-row ${selected ? "selected" : ""} ${destination ? "legal" : ""} ${disabled ? "disabled" : ""}`}>
        {button}<strong>{row.entry?.name ?? "Empty"}{row.entry && row.slot.startsWith("UNIVERSAL_") && <small> · {row.entry.sport}</small>}</strong><span>{row.entry?.team ?? "N/A"}</span><span>{row.entry?.positions.join(", ") || "N/A"}</span><span>N/A</span><span>N/A</span>
      </div>;
    })}
  </div>;
}
