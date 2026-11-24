"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Notice = { message: string; type: "success" | "error" };

export function NotificationCenter() {
  const pathname = usePathname();
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    const value = document.cookie.split("; ").find((item) => item.startsWith("fantasy_notice="))?.split("=").slice(1).join("=");
    if (value) {
      let parsed: Notice | null = null;
      try { parsed = JSON.parse(decodeURIComponent(value)) as Notice; } catch { parsed = null; }
      const timer = window.setTimeout(() => setNotice(parsed), 0);
      document.cookie = "fantasy_notice=; Max-Age=0; Path=/; SameSite=Strict";
      return () => window.clearTimeout(timer);
    }
  }, [pathname]);
  useEffect(() => {
    const submit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement;
      const submitter = event.submitter as HTMLButtonElement | null;
      if (!form || !submitter || submitter.disabled) return;
      submitter.disabled = true;
      submitter.setAttribute("aria-busy", "true");
      window.setTimeout(() => { submitter.disabled = false; submitter.removeAttribute("aria-busy"); }, 1_000);
    };
    document.addEventListener("submit", submit, true);
    return () => document.removeEventListener("submit", submit, true);
  }, []);
  if (!notice) return null;
  return <div className={`app-notice ${notice.type}`} role={notice.type === "error" ? "alert" : "status"} aria-live="polite"><span>{notice.message}</span><button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}>×</button></div>;
}
