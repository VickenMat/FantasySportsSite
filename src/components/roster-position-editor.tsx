"use client";

import { Fragment, useState, type ReactNode } from "react";
import { lineupAction } from "@/app/actions/leagues";
import type { Sport } from "@/generated/prisma/enums";
import { PositionBadges } from "./position-badge";

export type PositionRow = {
  key: string;
  label: string;
  slot: string;
  index: number;
  entry: null | { id: string; playerId: string; sport: Sport; name: string; positions: string[]; positionSource?: string; team: string | null; teamSource?: string; locked: boolean; average?: string; points?: string; gamesPlayed?:number|null };
};

export function RosterPositionEditor({ leagueId, rows, legalDestinations, rookiePicks }: {
  leagueId: string;
  rows: PositionRow[];
  legalDestinations: Record<string, string[]>;
  rookiePicks?: ReactNode;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const source = rows.find(({ key }) => key === selectedKey);
  const legal = new Set(source?.entry ? legalDestinations[source.entry.id] ?? [] : []);

  return <div className="position-editor" data-testid="position-editor">
    {source?.entry && <div className="position-help" role="status"><span>Moving <strong>{source.entry.name}</strong>. Choose a highlighted destination.</span><button type="button" className="button compact secondary" onClick={() => setSelectedKey(null)}>Cancel</button></div>}
    <div className="roster-position-grid roster-position-head"><span>Slot</span><span>Player</span><span>TEAM</span><span>POS</span><span>AVG</span><span>PTS</span></div>
    {rows.map((row, index) => {
      const group = (slot: string) => slot === "ROOKIE_OVERFLOW" ? "Rookie draft overflow" : slot === "BENCH" ? "Bench" : slot === "UNIVERSAL_IR" ? "IR" : slot === "UNIVERSAL_BENCH" ? "U Bench" : "Starters";
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
        : <button type="button" className={`position-button ${selected ? "selected" : ""}`} disabled={disabled || !row.entry}
          onClick={selected ? () => setSelectedKey(null) : undefined}>{row.label}</button>;
      return <Fragment key={row.key}>
        {row.slot === "UNIVERSAL_BENCH" && rows[index - 1]?.slot !== "UNIVERSAL_BENCH" && rows[index - 1]?.slot !== "UNIVERSAL_IR" && rookiePicks}
        {(index === 0 || group(row.slot) !== group(rows[index - 1].slot)) && <h3 className="roster-section-heading">{group(row.slot)}{["BENCH","UNIVERSAL_IR","UNIVERSAL_BENCH"].includes(row.slot) && <small>{rows.filter(r=>r.slot===row.slot&&r.entry).length}/{rows.filter(r=>r.slot===row.slot).length}</small>}</h3>}
        <div className={`roster-position-grid roster-position-row ${selected ? "selected" : ""} ${destination ? "legal" : ""} ${disabled ? "disabled" : ""}`}>
        {button}<strong><span>{row.entry?.name ?? "Empty"}</span>{row.entry && row.slot.startsWith("UNIVERSAL_") && <small> · {row.entry.sport}</small>}{row.entry&&<small className="position-provenance" title="Games played">GP {row.entry.gamesPlayed??'N/A'}</small>}</strong><span>{row.entry?.team ?? "N/A"}{row.entry?.teamSource && <small className="position-provenance">{row.entry.teamSource}</small>}</span><span>{row.entry ? <><PositionBadges sport={row.entry.sport} positions={row.entry.positions} />{row.entry.positionSource && <small className="position-provenance">{row.entry.positionSource}</small>}</> : "N/A"}</span><span>{row.entry?.average ?? "N/A"}</span><span>{row.entry?.points ?? "N/A"}</span>
        </div>
        {row.slot === "UNIVERSAL_IR" && rows[index + 1]?.slot !== "UNIVERSAL_IR" && rookiePicks}
      </Fragment>;
    })}
    {!rows.some(({ slot }) => slot === "UNIVERSAL_IR" || slot === "UNIVERSAL_BENCH") && rookiePicks}
  </div>;
}
