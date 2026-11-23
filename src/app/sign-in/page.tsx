import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  return (
    <AuthShell title="Sign in">
      {reset === "1" && <p className="form-notice" role="status">Password updated. Sign in with your new password.</p>}
      <AuthForm mode="sign-in" />
      {process.env.SMTP_URL && process.env.MAIL_FROM && (
        <p><Link className="text-link" href="/forgot-password">Forgot password?</Link></p>
      )}
      <p className="muted">New to Fantasy Evolution? <Link className="text-link" href="/sign-up">Create an account</Link></p>
    </AuthShell>
  );
}
