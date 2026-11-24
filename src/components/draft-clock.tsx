"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export function DraftClock({ status, pickDeadlineAt, pausedRemainingMs, secondsPerPick, version }: {
  status: string; pickDeadlineAt: string | null; pausedRemainingMs: number | null; secondsPerPick: number; version: number;
}) {
  const router = useRouter();
  const deadline = useMemo(() => pickDeadlineAt ? Date.parse(pickDeadlineAt) : null, [pickDeadlineAt]);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!["ACTIVE", "PAUSED"].includes(status)) return;
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = status === "ACTIVE" ? window.setInterval(() => setNow(Date.now()), 250) : undefined;
    const refresh = window.setInterval(() => router.refresh(), 3000);
    return () => { window.clearTimeout(initial); if (timer) window.clearInterval(timer); window.clearInterval(refresh); };
  }, [router, status, version]);
  if (status === "PAUSED") { const seconds = Math.max(0, Math.ceil((pausedRemainingMs ?? 0) / 1000)); return <div className="draft-clock paused" role="status">Draft paused · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} remaining</div>; }
  if (status !== "ACTIVE" || deadline == null) return <div className="draft-clock">{status}</div>;
  const remaining = now == null ? secondsPerPick : Math.max(0, Math.ceil((deadline - now) / 1000));
  return <div className={`draft-clock ${remaining <= 10 ? "urgent" : ""}`} role="timer" aria-live="polite">
    <span>On the clock</span><strong>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</strong>
  </div>;
}
