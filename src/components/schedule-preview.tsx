"use client";

import { useState, type ChangeEvent, type MouseEvent } from "react";

type Preview = { sport: string; status: string; reason: string; seasonLabel: string | null; draftDeadlineAt: string | null;
  firstScoringAt: string | null; scoringEndsAt: string | null; tradeDeadlineAt: string | null; warnings: string[] };

const show = (value: string | null) => value ? new Date(value).toLocaleString() : "Pending authoritative data";

export function DraftCompletionInput() {
  const [instant, setInstant] = useState("");
  function update(event: ChangeEvent<HTMLInputElement>) {
    const date = new Date(event.currentTarget.value);
    setInstant(event.currentTarget.value && !Number.isNaN(date.getTime()) ? date.toISOString() : "");
  }
  return <label>Expected draft completion<input name="draftCompleteByLocal" type="datetime-local" onChange={update} />
    <input name="draftCompleteBy" type="hidden" value={instant} />
    <span className="input-help">Used only to select a professional season that has not started. Leave blank to use creation time. Your browser converts this local time to an exact UTC instant.</span>
  </label>;
}

export function SchedulePreview() {
  const [rows, setRows] = useState<Preview[]>([]); const [message, setMessage] = useState(""); const [loading, setLoading] = useState(false);
  async function preview(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.closest("form"); if (!form) return;
    const data = new FormData(form); const draftValue = String(data.get("draftCompleteBy") ?? "");
    const draftCompleteBy = new Date(draftValue);
    if (!draftValue || Number.isNaN(draftCompleteBy.getTime())) { setMessage("Choose an expected draft completion time first."); return; }
    setLoading(true); setMessage("");
    const response = await fetch("/api/schedule-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      sports: data.getAll("sports").map(String), competitionType: String(data.get("competitionType") ?? "HEAD_TO_HEAD"), draftCompleteBy: draftCompleteBy.toISOString(),
    }) });
    const body = await response.json() as { sports?: Preview[]; error?: string };
    if (response.ok && body.sports) setRows(body.sports); else setMessage(body.error ?? "Schedule preview failed.");
    setLoading(false);
  }
  return <section className="schedule-preview" aria-live="polite">
    <button className="button secondary" type="button" onClick={preview} disabled={loading}>{loading ? "Checking schedules…" : "Preview championship schedule"}</button>
    {message ? <p className="form-error">{message}</p> : null}
    {rows.length ? <div className="card-grid">{rows.map((row) => <article className="mini-card" key={row.sport}>
      <p className="eyebrow">{row.sport} · {row.status}</p><h3>{row.seasonLabel ?? "Season pending"}</h3><p>{row.reason}</p>
      <dl><dt>Draft deadline</dt><dd>{show(row.draftDeadlineAt)}</dd><dt>Scoring window</dt><dd>{show(row.firstScoringAt)} – {show(row.scoringEndsAt)}</dd><dt>Trade deadline</dt><dd>{show(row.tradeDeadlineAt)}</dd></dl>
      {row.warnings.map((warning) => <p className="input-help" key={warning}>{warning}</p>)}
    </article>)}</div> : null}
  </section>;
}
