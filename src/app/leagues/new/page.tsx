import type { Metadata } from "next";
import { DashboardHeader } from "@/components/dashboard-header";
import { requireSession } from "@/lib/auth";
import { createLeagueAction } from "@/app/actions/leagues";

export const metadata: Metadata = { title: "Create league" };

export default async function CreateLeaguePage() {
  await requireSession();
  return <><DashboardHeader /><main id="main" className="shell workspace narrow">
    <div className="workspace-intro"><p className="eyebrow">New league</p><h1 className="display">Build your league</h1><p className="muted">Single-sport play today, with a schema ready for future combined leagues.</p></div>
    <form action={createLeagueAction} className="panel form-grid">
      <label>League name<input name="name" required minLength={3} maxLength={80} /></label>
      <label>Sport<select name="sport" defaultValue="NFL"><option>NFL</option><option>NBA</option><option>MLB</option><option>NHL</option></select></label>
      <label>Season<input name="seasonYear" type="number" min="2016" max="2100" defaultValue="2026" required /></label>
      <label>Teams<input name="maxTeams" type="number" min="4" max="16" defaultValue="12" required /></label>
      <label>Format<select name="format"><option value="REDRAFT">Redraft</option><option value="DYNASTY">Dynasty</option></select></label>
      <label>Starting FAAB<input name="startingFaab" type="number" min="0" max="100000" defaultValue="100" /></label>
      <label>Bench slots<input name="benchSlots" type="number" min="0" max="20" defaultValue="5" /></label>
      <label className="check"><input name="historical" type="checkbox" /> Historical replay league</label>
      <label className="check"><input name="fillWithComputers" type="checkbox" /> Fill empty seats with computer managers</label>
      <button className="button primary" type="submit">Create league</button>
    </form>
  </main></>;
}
