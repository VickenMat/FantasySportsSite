import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { getDatabase } from '../../src/lib/db';
import { createLeague, sports } from '../../src/server/league';
import { assertIsolatedIngestionDatabase } from '../../src/ingestion/persist';

test('real imported four-sport populations render in Waivers with preserved unknown values', async ({ page }) => {
  test.skip(process.env.REAL_SOURCE_POPULATION_ACCEPTANCE !== 'true', 'Requires the populated disposable-copy command.');
  assertIsolatedIngestionDatabase();
  test.setTimeout(90000);
  const db = getDatabase(), email = `real-source-${randomUUID()}@example.test`;
  let leagueId: string | undefined;
  try {
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': '198.51.100.249' });
    await page.goto('/sign-up');
    await page.getByLabel('Name', { exact: true }).fill('Isolated real-source reviewer');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('isolated-review-12!');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL('/dashboard');
    const owner = await db.user.findUniqueOrThrow({ where: { email } });
    const league = await createLeague(owner.id, { name: `Real population ${randomUUID()}`, sports: [...sports], historical: false, maxTeams: 2, format: 'REDRAFT' });
    leagueId = league.id;
    for (const sport of sports) {
      const count = await db.player.count({ where: { sport, isDemo: false, isSynthetic: false, gameStats: { some: { game: { season: { startYear: 2026 } } } } } });
      expect(count).toBeGreaterThan(400);
      const sample = await db.player.findFirstOrThrow({ where: { sport, isDemo: false, isSynthetic: false, gameStats: { some: { game: { season: { startYear: 2026 } } } } }, orderBy: { displayName: 'asc' } });
      await page.goto(`/leagues/${league.id}/waivers?sport=${sport}&q=${encodeURIComponent(sample.displayName)}`);
      await expect(page.locator('main')).toContainText(sample.displayName);
      await expect(page.locator('table thead th')).toHaveText(['Player', 'Position', 'Team', 'PROJ', 'Total', 'Average', 'GP', 'Manager']);
      await expect(page.locator('table tbody')).toContainText('N/A');
      await expect(page.getByText("This page couldn't load.", { exact: true })).toHaveCount(0);
    }
    for (const path of ['draft', 'team']) {
      const response = await page.goto(`/leagues/${league.id}/${path}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByText("This page couldn't load.", { exact: true })).toHaveCount(0);
    }
    await page.screenshot({ path: test.info().outputPath('real-player-waivers.png'), fullPage: true });
  } finally {
    if (leagueId) await db.league.delete({ where: { id: leagueId } });
    await db.user.deleteMany({ where: { email } });
    await db.$disconnect();
  }
});
