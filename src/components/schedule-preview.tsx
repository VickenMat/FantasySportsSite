"use client";

import { useState, type MouseEvent } from "react";

type Preview = { sport: string; status: string; reason: string; seasonLabel: string | null; draftDeadlineAt: string | null;
  firstScoringAt: string | null; scoringEndsAt: string | null; tradeDeadlineAt: string | null; warnings: string[] };

const show = (value: string | null) => value ? new Date(value).toLocaleString() : "Pending authoritative data";

export function SchedulePreview() {
  const [rows, setRows] = useState<Preview[]>([]); const [message, setMessage] = useState(""); const [loading, setLoading] = useState(false);
  async function preview(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.closest("form"); if (!form) return;
    const data = new FormData(form);
    setLoading(true); setMessage("");
    const response = await fetch("/api/schedule-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      sports: data.getAll("sports").map(String), competitionType: String(data.get("competitionType") ?? "HEAD_TO_HEAD"), seasonOffset: Number(data.get("seasonOffset") ?? 0),
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
