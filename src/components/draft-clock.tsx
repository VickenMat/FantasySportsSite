"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export function DraftClock({ status, pickStartedAt, secondsPerPick, version }: {
  status: string; pickStartedAt: string | null; secondsPerPick: number; version: number;
}) {
  const router = useRouter();
  const deadline = useMemo(() => pickStartedAt ? Date.parse(pickStartedAt) + secondsPerPick * 1000 : null, [pickStartedAt, secondsPerPick]);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (status !== "ACTIVE") return;
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    const refresh = window.setInterval(() => router.refresh(), 3000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); window.clearInterval(refresh); };
  }, [router, status, version]);
  if (status === "PAUSED") return <div className="draft-clock paused" role="status">Draft paused</div>;
  if (status !== "ACTIVE" || deadline == null) return <div className="draft-clock">{status}</div>;
  const remaining = now == null ? secondsPerPick : Math.max(0, Math.ceil((deadline - now) / 1000));
  return <div className={`draft-clock ${remaining <= 10 ? "urgent" : ""}`} role="timer" aria-live="polite">
    <span>On the clock</span><strong>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</strong>
  </div>;
}
