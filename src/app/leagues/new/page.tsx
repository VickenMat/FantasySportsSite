import type { Metadata } from "next";
import { DashboardHeader } from "@/components/dashboard-header";
import { requireSession } from "@/lib/auth";
import { createLeagueAction } from "@/app/actions/leagues";
import { SchedulePreview } from "@/components/schedule-preview";
import { previewSelectedSeasons } from "@/server/scheduling";
import { getDatabase } from "@/lib/db";

export const metadata: Metadata = { title: "Create league" };

export default async function CreateLeaguePage() {
  await requireSession();
  const options = await Promise.all(([0, 1] as const).map((seasonOffset) => previewSelectedSeasons(getDatabase(), { sports: ["NFL", "NBA", "MLB", "NHL"], seasonOffset, competitionType: "HEAD_TO_HEAD" })));
  return <><DashboardHeader /><main id="main" className="shell workspace narrow">
    <div className="workspace-intro"><p className="eyebrow">New league</p><h1 className="display">Build your league</h1><p className="muted">One franchise per manager, with an independent roster and draft for every selected sport.</p></div>
    <form action={createLeagueAction} className="panel form-grid">
      <label>League name<input name="name" required minLength={3} maxLength={80} /></label>
      <fieldset><legend>Included sports</legend><div className="sport-choice-grid">{["NFL", "NBA", "MLB", "NHL"].map((sport) => <label className="check sport-choice" key={sport}><input name="sports" value={sport} type="checkbox" defaultChecked /> {sport}</label>)}</div></fieldset>
      <label>Teams<input name="maxTeams" type="number" min="2" max="16" defaultValue="12" required /></label>
      <label>Format<select name="format" defaultValue="DYNASTY"><option value="DYNASTY">Dynasty</option><option value="REDRAFT">Redraft</option></select></label>
      <label>Competition<select name="competitionType" defaultValue="HEAD_TO_HEAD"><option value="HEAD_TO_HEAD">Head-to-head</option><option value="CUMULATIVE">Cumulative points</option></select></label>
      <label>Season<select aria-label="Season" name="seasonOffset" defaultValue="0">{options.map((rows, offset) => <option key={offset} value={offset}>{offset === 0 ? "Upcoming" : "Following"} — {rows.map((row) => `${row.sport} ${row.seasonLabel}`).join(" · ")}</option>)}</select><span className="input-help">The selected offset applies independently to each included sport. Unknown dates remain schedule pending. Draft completion never changes your selection.</span></label>
      <label>Visibility<select name="visibility" defaultValue="PRIVATE"><option value="PRIVATE">Private · invitation only</option><option value="PUBLIC">Public · discoverable and open</option></select></label>
      <details><summary>Optional gameplay settings</summary><div className="form-grid advanced-settings">
        <label>Starting FAAB per sport<input name="startingFaab" type="number" min="0" max="100000" defaultValue="100" /></label>
        <label>Bench slots per sport<input name="benchSlots" type="number" min="0" max="20" defaultValue="5" /></label>
        <fieldset><legend>Redraft keeper limits</legend><p className="input-help">Leave at zero for traditional redraft. Dynasty ignores these values.</p>{["NFL", "NBA", "MLB", "NHL"].map((sport) => <label key={sport}>{sport}<input name={`keeper_${sport}`} type="number" min="0" max="50" defaultValue="0" /></label>)}</fieldset>
        <label className="check"><input name="fillWithComputers" type="checkbox" /> Fill vacant slots with computer-controlled franchises</label>
      </div></details>
      <SchedulePreview />
      <button className="button primary" type="submit">Create league</button>
    </form>
  </main></>;
}
