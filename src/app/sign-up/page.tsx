import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <AuthShell title="Create an account">
      <AuthForm mode="sign-up" />
      <p className="muted">Already have an account? <Link className="text-link" href="/sign-in">Sign in</Link></p>
    </AuthShell>
  );
}
