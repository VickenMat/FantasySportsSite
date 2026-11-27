type Run = { status: string; startedAt: Date; result: unknown } | null;

export function workerState(run: Run, now: Date, maximumAgeMs: number) {
  if (!run) return "MISSING";
  const result = run.result as { heartbeatAt?: string; competitionStatus?:string; value?: { degraded?: boolean } } | null;
  const at = new Date(result?.heartbeatAt ?? run.startedAt);
  if (!Number.isFinite(Number(at)) || now.getTime() - at.getTime() > maximumAgeMs) return "STALE";
  if (run.status === "FAILED" || run.status === "BLOCKED" || result?.value?.degraded || result?.competitionStatus === "DEGRADED") return "DEGRADED";
  return run.status === "COMPLETE" || run.status === "RUNNING" ? "HEALTHY" : "STOPPED";
}
