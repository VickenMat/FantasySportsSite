import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";

export const metadata: Metadata = {
  title: "Choose a new password",
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return (
    <AuthShell title="Choose a new password">
      {typeof token === "string" && token && !error
        ? <AuthForm mode="reset" token={token} />
        : <p className="form-notice">This reset link is invalid or expired. <Link className="text-link" href="/forgot-password">Request a new link</Link></p>}
    </AuthShell>
  );
}
