"use client";

import type { FormEvent } from "react";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { accountNameSchema, emailSchema, maxPasswordLength, minPasswordLength, passwordSchema } from "@/lib/auth-validation";

type Mode = "sign-in" | "sign-up" | "forgot" | "reset";

const labels: Record<Mode, string> = {
  "sign-in": "Sign in",
  "sign-up": "Create account",
  forgot: "Send reset link",
  reset: "Update password",
};

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function AuthForm({ mode, token }: { mode: Mode; token?: string }) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const createsPassword = mode === "sign-up" || mode === "reset";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const fields = new FormData(event.currentTarget);
    const email = emailSchema.safeParse(fields.get("email"));
    const name = accountNameSchema.safeParse(fields.get("name"));
    const password = String(fields.get("password") ?? "");

    if (mode !== "reset" && !email.success) {
      setError("Enter a valid email address.");
      return;
    }
    if (mode === "sign-up" && !name.success) {
      setError("Enter a name between 1 and 80 characters.");
      return;
    }
    if (createsPassword && !passwordSchema.safeParse(password).success) {
      setError(`Use a password between ${minPasswordLength} and ${maxPasswordLength} characters.`);
      return;
    }

    setBusy(true);
    try {
      switch (mode) {
        case "sign-in": {
          const result = await authClient.signIn.email({ email: email.data!, password });
          if (result.error) {
            setError(result.error.status === 429 ? "Too many attempts. Try again shortly." : "Email or password is incorrect.");
            return;
          }
          break;
        }
        case "sign-up": {
          const result = await authClient.signUp.email({ name: name.data!, email: email.data!, password });
          if (result.error) {
            setError(result.error.message ?? "Account creation failed. Try again.");
            return;
          }
          break;
        }
        case "forgot": {
          const result = await authClient.requestPasswordReset({
            email: email.data!,
            redirectTo: new URL("/reset-password", window.location.origin).href,
          });
          if (result.error) setError("Could not request a reset. Try again shortly.");
          else setStatus("If an account matches that address, a reset link will arrive by email.");
          return;
        }
        case "reset": {
          const result = await authClient.resetPassword({ token, newPassword: password });
          if (result.error) setError("Could not reset the password. Request a new link and try again.");
          else router.replace("/sign-in?reset=1");
          return;
        }
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Could not connect. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  if (status) return <p className="form-notice" role="status">{status}</p>;

  return (
    <form method="post" onSubmit={submit}>
      <fieldset className="account-form" disabled={!ready || busy}>
        {mode === "sign-up" && (
          <label>Name<input name="name" autoComplete="name" maxLength={80} required /></label>
        )}
        {mode !== "reset" && (
          <label>Email<input type="email" name="email" autoComplete="email" required /></label>
        )}
        {mode !== "forgot" && (
          <div className="password-field">
            <label>
              {mode === "reset" ? "New password" : "Password"}
              <input
                type="password"
                name="password"
                minLength={createsPassword ? minPasswordLength : undefined}
                maxLength={maxPasswordLength}
                autoComplete={createsPassword ? "new-password" : "current-password"}
                aria-describedby={createsPassword ? "password-help" : undefined}
                required
              />
            </label>
            {createsPassword && <span className="input-help" id="password-help">At least {minPasswordLength} characters.</span>}
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button primary" type="submit">{busy ? "Please wait…" : labels[mode]}</button>
      </fieldset>
    </form>
  );
}
