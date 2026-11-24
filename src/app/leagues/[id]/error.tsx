"use client";

import Link from "next/link";

export default function LeagueError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main id="main" className="shell workspace narrow"><section className="panel">
    <p className="eyebrow">Action not completed</p><h1 className="display">Review this request</h1>
    <p className="form-error" role="alert">{error.message || "The league action could not be completed."}</p>
    <div className="button-row"><button className="button primary" onClick={reset}>Try again</button><Link className="button secondary" href="/dashboard">Return to dashboard</Link></div>
  </section></main>;
}
