import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getDatabase } from "../../src/lib/db";
import { createLeague } from "../../src/server/league";

test("commissioner pauses and corrects a reversible selection while preserving its original recap", async ({ page }) => {
  const db = getDatabase();
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.DEMO_EMAIL } });
  const league = await createLeague(user.id, { name: `Correction browser fixture ${randomUUID()}`, historical: true, seasonYear: 2087, sports: ["NFL"], maxTeams: 2, fillWithComputers: true });
  try {
    await db.leagueSport.updateMany({ where: { leagueId: league.id }, data: { draftRounds: 2 } });
    await page.goto("/sign-in"); await page.getByLabel("Email").fill(process.env.DEMO_EMAIL!); await page.getByLabel("Password", { exact: true }).fill(process.env.DEMO_PASSWORD!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL("/dashboard");
    await page.goto(`/leagues/${league.id}/draft`);
    await page.getByRole("button", { name: "Start Draft Now (testing)", exact: true }).click();
    await page.getByRole("button", { name: "Auto-pick current team", exact: true }).click();
    await expect.poll(() => db.draftPick.count({ where: { draft: { leagueId: league.id } } })).toBe(1);
    await page.reload(); await page.getByRole("button", { name: "Pause draft", exact: true }).click();
    await expect(page.getByRole("button", { name: "Resume draft", exact: true })).toBeVisible();
    const pick = await db.draftPick.findFirstOrThrow({ where: { draft: { leagueId: league.id } } });
    const original = await db.draftSelectionSnapshot.findUniqueOrThrow({ where: { pickId: pick.id } });
    const replacement = await db.player.findFirstOrThrow({ where: { sport: "NFL", isDemo: true, id: { not: pick.playerId } } });
    await page.getByText("Correct the last selection", { exact: true }).click();
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Replace last selection atomically", exact: true }) });
    await form.getByRole("combobox", { name: "Replacement player" }).selectOption(replacement.id);
    await form.getByLabel("Reason").fill("Commissioner corrected an explicit mistaken selection fixture");
    await form.getByRole("button", { name: "Replace last selection atomically", exact: true }).click();
    await expect.poll(() => db.draftPick.findUniqueOrThrow({ where: { id: pick.id } }).then(({ playerId }) => playerId)).toBe(replacement.id);
    expect(await db.draftSelectionSnapshot.findUniqueOrThrow({ where: { pickId: pick.id } })).toEqual(original);
    await page.goto(`/leagues/${league.id}/draft?view=board`);
    await expect(page.locator(".draft-board-scroll")).toContainText(replacement.displayName);
    await page.goto(`/leagues/${league.id}/settings/audit`);
    await expect(page.getByText(/^Replacement selection after audited undo/)).toBeVisible();
  } finally { await db.league.delete({ where: { id: league.id } }); }
});
