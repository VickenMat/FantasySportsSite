import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";

export default function NotFound() {
  return (
    <AuthShell title="Page unavailable">
      <p className="muted">This page may have moved or require league access.</p>
      <p><Link className="text-link" href="/">Back to home</Link></p>
    </AuthShell>
  );
}
