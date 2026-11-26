"use client";
import { useActionState, useState } from "react";
import { createInviteLinkAction } from "@/app/actions/leagues";

export function InviteLinkForm({ leagueId }: { leagueId: string }) {
  const [state, submit, pending] = useActionState(createInviteLinkAction.bind(null, leagueId), { url: "", message: "" });
  const [copied, setCopied] = useState(false);
  return <section className="panel"><h2 className="display">Invite managers</h2><p>Private, single-use link. Expires in 7 days.</p>
    <form action={submit}><label>Email (optional)<input name="email" type="email" /></label><button className="button secondary" disabled={pending}>Create secure link</button></form>
    {state.url && <><label>Invitation URL<input value={state.url} readOnly /></label><button className="button primary" onClick={async () => { try { await navigator.clipboard.writeText(state.url); setCopied(true); } catch { setCopied(false); } }}>Copy Invite Link</button><p role="status">{copied ? "Invite link copied." : "Copy this link and send it to the intended manager."}</p></>}
    {state.message && <p role="status">{state.message}</p>}
  </section>;
}
