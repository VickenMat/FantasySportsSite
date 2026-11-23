"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOut() {
  const router = useRouter();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setError(false);
    setBusy(true);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message);
      router.replace("/");
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sign-out">
      <button className="button secondary" type="button" disabled={busy} onClick={signOut}>
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && <p className="form-error" role="alert">Sign-out failed. Try again.</p>}
    </div>
  );
}
