import { changePasswordAction, deleteAccountAction, updateAccountAction } from "@/app/actions/account";
import { DashboardHeader } from "@/components/dashboard-header";
import { requireSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { maxPasswordLength, minPasswordLength } from "@/lib/auth-validation";

export default async function AccountPage() {
  const { user } = await requireSession();
  const account = await getDatabase().user.findUniqueOrThrow({ where: { id: user.id } });
  return <><DashboardHeader /><main id="main" className="shell workspace">
    <div className="workspace-intro"><p className="eyebrow">Account</p><h1 className="display">Your profile</h1><p className="muted">Created {account.createdAt.toLocaleDateString("en-US")}</p></div>
    <div className="league-details"><form action={updateAccountAction} className="panel form-grid"><h2 className="display">Basic information</h2><label>Display name<input name="name" defaultValue={account.name} required /></label><label>Email address<input type="email" value={account.email} readOnly aria-describedby="email-note" /></label><small id="email-note" className="muted">Email changes are not currently supported.</small><button className="button primary">Save profile</button></form>
      <form action={changePasswordAction} className="panel form-grid"><h2 className="display">Password</h2><label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label><label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={minPasswordLength} maxLength={maxPasswordLength} required /></label><button className="button secondary">Change password</button></form></div>
    <form action={deleteAccountAction} className="panel form-grid danger-zone"><h2 className="display">Delete account</h2><p className="muted">This anonymizes your identity and signs out every session while preserving league history. Active league commissioners must transfer ownership first.</p><label>Current password<input name="password" type="password" autoComplete="current-password" required /></label><label>Type DELETE<input name="confirmation" required /></label><label className="checkbox-row"><input name="confirm" type="checkbox" required /> I understand this action cannot be undone.</label><button className="button secondary">Delete account</button></form>
  </main></>;
}
