import type { Metadata } from "next";
import { DashboardHeader } from "@/components/dashboard-header";
import { requireSession } from "@/lib/auth";
import { createLeagueAction } from "@/app/actions/leagues";
import { DraftCompletionInput, SchedulePreview } from "@/components/schedule-preview";

export const metadata: Metadata = { title: "Create league" };

export default async function CreateLeaguePage() {
  await requireSession();
  return <><DashboardHeader /><main id="main" className="shell workspace narrow">
    <div className="workspace-intro"><p className="eyebrow">New league</p><h1 className="display">Build your league</h1><p className="muted">One franchise per manager, with an independent roster and draft for every selected sport.</p></div>
    <form action={createLeagueAction} className="panel form-grid">
      <label>League name<input name="name" required minLength={3} maxLength={80} /></label>
      <fieldset><legend>Included sports</legend><div className="sport-choice-grid">{["NFL", "NBA", "MLB", "NHL"].map((sport) => <label className="check sport-choice" key={sport}><input name="sports" value={sport} type="checkbox" defaultChecked /> {sport}</label>)}</div></fieldset>
      <label>Teams<input name="maxTeams" type="number" min="2" max="16" defaultValue="12" required /></label>
      <label>Format<select name="format" defaultValue="DYNASTY"><option value="DYNASTY">Dynasty</option><option value="REDRAFT">Redraft</option></select></label>
      <label>Competition<select name="competitionType" defaultValue="HEAD_TO_HEAD"><option value="HEAD_TO_HEAD">Head-to-head</option><option value="CUMULATIVE">Cumulative points</option></select></label>
      <DraftCompletionInput />
      <label>Visibility<select name="visibility" defaultValue="PRIVATE"><option value="PRIVATE">Private · invitation only</option><option value="PUBLIC">Public · discoverable and open</option></select></label>
      <details><summary>Optional gameplay settings</summary><div className="form-grid advanced-settings">
        <label>Starting FAAB per sport<input name="startingFaab" type="number" min="0" max="100000" defaultValue="100" /></label>
        <label>Bench slots per sport<input name="benchSlots" type="number" min="0" max="20" defaultValue="5" /></label>
        <fieldset><legend>Redraft keeper limits</legend><p className="input-help">Leave at zero for traditional redraft. Dynasty ignores these values.</p>{["NFL", "NBA", "MLB", "NHL"].map((sport) => <label key={sport}>{sport}<input name={`keeper_${sport}`} type="number" min="0" max="50" defaultValue="0" /></label>)}</fieldset>
        <label className="check"><input name="fillWithComputers" type="checkbox" /> Fill vacant slots with computer-controlled franchises</label>
        <label className="check"><input name="historical" type="checkbox" /> Historical replay league</label>
        <label>Historical season start year<input name="seasonYear" type="number" min="2016" max="2100" placeholder="Only used for historical replay" /></label>
      </div></details>
      <SchedulePreview />
      <button className="button primary" type="submit">Create league</button>
    </form>
  </main></>;
}
