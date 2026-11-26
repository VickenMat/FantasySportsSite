"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function DraftScheduleStatus({ scheduledAt, timezone, status, refresh = false }: { scheduledAt: string | null; timezone: string; status: string; refresh?: boolean }) {
  const [now, setNow] = useState<number | null>(null); const router = useRouter();
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!refresh) return; const timer = setInterval(() => router.refresh(), 10000); return () => clearInterval(timer); }, [router, refresh]);
  if (!scheduledAt) return <p>{status === "UNSCHEDULED" ? "Draft unscheduled" : status.replaceAll("_", " ")}</p>;
  const start = +new Date(scheduledAt); const difference = now == null ? null : Math.max(0, start - now);
  return <div><p><strong>{status.replaceAll("_", " ")}</strong> · <time dateTime={scheduledAt}>{new Intl.DateTimeFormat("en-US", { timeZone: timezone, dateStyle: "medium", timeStyle: "long" }).format(start)}</time> · {timezone}</p>
    {!["COMPLETED", "CANCELLED"].includes(status) && <p>Room opens: {new Intl.DateTimeFormat("en-US", { timeZone: timezone, dateStyle: "medium", timeStyle: "long" }).format(start - 3600000)} · {difference == null ? "Countdown loading" : difference === 0 ? "Scheduled start reached; server activation governs selections" : `Starts in ${Math.floor(difference / 3600000)}h ${Math.floor(difference / 60000) % 60}m ${Math.floor(difference / 1000) % 60}s`}</p>}
  </div>;
}
