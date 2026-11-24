"use client";

import { useRef, useState } from "react";
import { changeQueueAction, reorderQueueAction } from "@/app/actions/leagues";

type Entry = { id: string; rank: number; name: string; positions: string[]; team: string | null };

export function DraftQueue({ leagueId, draftId, initialEntries }: { leagueId: string; draftId: string; initialEntries: Entry[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const dragged = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= entries.length || to >= entries.length) return;
    setEntries((current) => {
      const next = [...current];
      const [entry] = next.splice(from, 1);
      next.splice(to, 0, entry);
      return next;
    });
    requestAnimationFrame(() => formRef.current?.requestSubmit());
  }

  if (!entries.length) return <p className="muted">Queue players while waiting. The first available eligible player is selected when your clock expires.</p>;
  return <form ref={formRef} action={reorderQueueAction.bind(null, leagueId, draftId)}>
    {entries.map(({ id }) => <input key={id} type="hidden" name="entryId" value={id} />)}
    <ol className="pick-list draft-queue" aria-label="My private draft queue">
      {entries.map((entry, index) => <li key={entry.id} draggable
        onDragStart={() => { dragged.current = index; }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => { if (dragged.current != null) move(dragged.current, index); dragged.current = null; }}>
        <span className="drag-handle" title="Drag to reorder">{index + 1} ↕</span>
        <span><strong>{entry.name}</strong><small>{entry.positions.join(", ") || "POS N/A"}{entry.team ? ` · ${entry.team}` : " · TEAM N/A"}</small></span>
        <span className="button-row">
          <button formAction={changeQueueAction.bind(null, leagueId, draftId, entry.id, "UP")} className="button compact" disabled={index === 0} aria-label={`Move ${entry.name} up`}>↑</button>
          <button formAction={changeQueueAction.bind(null, leagueId, draftId, entry.id, "DOWN")} className="button compact" disabled={index === entries.length - 1} aria-label={`Move ${entry.name} down`}>↓</button>
          <button formAction={changeQueueAction.bind(null, leagueId, draftId, entry.id, "REMOVE")} className="button compact" aria-label={`Remove ${entry.name} from queue`}>Remove</button>
        </span>
      </li>)}
    </ol>
  </form>;
}
