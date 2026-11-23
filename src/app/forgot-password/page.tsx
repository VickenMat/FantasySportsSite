import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";

export const metadata: Metadata = { title: "Forgot password" };
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password">
      {process.env.SMTP_URL && process.env.MAIL_FROM
        ? <AuthForm mode="forgot" />
        : <p className="form-notice">Password recovery is unavailable on this server.</p>}
      <p><Link className="text-link" href="/sign-in">Back to sign in</Link></p>
    </AuthShell>
  );
}
