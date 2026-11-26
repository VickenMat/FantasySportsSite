"use client";
import { useActionState, type ReactNode } from "react";
import { administerLeague } from "@/app/actions/administration";
export function AdministrationForm({ leagueId, operation, label, children }: { leagueId: string; operation: "ASSIGN" | "ROLLOVER" | "FUTURE_SETTINGS" | "OWNERSHIP" | "WINDOW"; label: string; children: ReactNode }) {
  const [message, action, pending] = useActionState(administerLeague.bind(null, leagueId, operation), "");
  return <form action={action} className="form-grid">{children}<button className="button secondary" disabled={pending}>{label}</button>{message && <p role="status">{message}</p>}</form>;
}
