import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const derived = require('../derived-data.js');
const [baseUrl = 'http://127.0.0.1:8768/', snapshotPath, screenshotDirectory = ''] = process.argv.slice(2);

if (!snapshotPath) {
  console.error('Usage: node maintenance/validate-player-ui.mjs BASE_URL SNAPSHOT_DIRECTORY');
  process.exit(1);
}

const data = JSON.parse(await readFile(resolve(snapshotPath, 'dataset.json'), 'utf8'));
const model = derived.buildDerivedData(data);
const expectedAppearances = model.appearances.length;
assert.equal(model.playerProfiles.reduce((sum, player) => sum + player.appearancesCount, 0), expectedAppearances);
assert.equal(model.playerProfiles.reduce((sum, player) => sum + player.wins, 0), model.appearances.reduce((sum, item) => sum + item.wins, 0));
assert.equal(model.playerProfiles.reduce((sum, player) => sum + player.losses, 0), model.appearances.reduce((sum, item) => sum + item.losses, 0));

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(/firestore\.googleapis\.com/, (route) => route.abort());
  await page.goto(`${baseUrl}#jugadores`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.setLeaderboardData === 'function');
  await page.evaluate((snapshot) => window.setLeaderboardData(snapshot), data);

  assert.equal(await page.locator('#jugadores thead th').count(), 7);
  assert.equal(await page.locator('#leaderboardRows tr').count(), Math.min(5, model.playerProfiles.length));
  assert.equal(await page.locator('#jugadores thead').getByText('Video', { exact: true }).count(), 0);
  if (screenshotDirectory) {
    await page.locator('#jugadores').screenshot({ path: resolve(screenshotDirectory, 'ranking-desktop.png') });
  }

  const searchable = model.playerProfiles.find((player) => player.handle && player.commanders.length);
  await page.locator('#searchInput').fill(searchable.handle);
  assert.ok(await page.locator(`#leaderboardRows [data-player-id="${searchable.id}"]`).count() > 0);
  await page.locator('#searchInput').fill(searchable.commanders[0].commanderDisplay);
  assert.ok(await page.locator(`#leaderboardRows [data-player-id="${searchable.id}"]`).count() > 0);
  await page.locator('#searchInput').fill(searchable.name);
  const playerTrigger = page.locator(`#leaderboardRows [data-player-id="${searchable.id}"]`).first();
  await playerTrigger.focus();
  await playerTrigger.press('Enter');
  assert.ok(await page.locator('#playerDialog[open]').isVisible());

  const summary = await page.locator('#playerDialog .player-profile-stats .dialog-stat').evaluateAll((items) =>
    Object.fromEntries(items.map((item) => [item.querySelector('span')?.textContent, item.querySelector('strong')?.textContent]))
  );
  assert.equal(Number(summary.Partidas), searchable.appearancesCount);
  assert.equal(Number(summary.Wins), searchable.wins);
  assert.equal(Number(summary.Losses), searchable.losses);
  assert.equal(Number(summary.Comandantes), searchable.commanderCount);
  assert.equal(await page.locator('#playerDialog .player-commander-row').count(), searchable.commanderCount);
  assert.equal(await page.locator('#playerDialog .player-match-list > li').count(), searchable.appearancesCount);

  if (screenshotDirectory) {
    await page.locator('#playerDialog').screenshot({ path: resolve(screenshotDirectory, 'player-profile-desktop.png') });
  }

  await page.locator('#playerDialog .player-commander-row [data-commander-key]').first().click();
  assert.ok(await page.locator('#commanderDialog[open]').isVisible());
  await page.locator('#commanderDialog [data-player-id]').first().click();
  assert.ok(await page.locator('#playerDialog[open]').isVisible());
  await page.locator('#playerDialog .player-match-list [data-match-key]').first().click();
  assert.ok(await page.locator('#matchDialog[open]').isVisible());
  await page.locator('#matchDialog [data-player-id]').first().click();
  assert.ok(await page.locator('#playerDialog[open]').isVisible());
  await page.locator('#closeDialog').click();

  for (const candidate of [
    model.playerProfiles.find((player) => player.role === 'Host'),
    model.playerProfiles.find((player) => player.role !== 'Host'),
    model.playerProfiles.find((player) => !player.handle),
    model.playerProfiles.find((player) => player.appearancesCount === 1)
  ].filter(Boolean)) {
    await page.locator('#searchInput').fill(candidate.name);
    await page.locator(`#leaderboardRows [data-player-id="${candidate.id}"]`).first().click();
    assert.equal((await page.locator('#playerDialog .section-kicker').textContent()).trim(), candidate.role);
    assert.equal(await page.locator('#playerDialog .profile-handle.is-missing').count(), candidate.handle ? 0 : 1);
    await page.locator('#closeDialog').click();
  }

  await page.locator('#searchInput').fill(searchable.name);
  await page.locator(`#leaderboardRows [data-player-id="${searchable.id}"]`).first().click();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.locator('#playerDialog').evaluate((dialog) => ({
    viewport: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    clientWidth: dialog.clientWidth,
    scrollWidth: dialog.scrollWidth
  }));
  assert.ok(mobile.pageWidth <= mobile.viewport, `Mobile page overflows: ${mobile.pageWidth} > ${mobile.viewport}`);
  assert.ok(mobile.scrollWidth <= mobile.clientWidth, `Player dialog overflows: ${mobile.scrollWidth} > ${mobile.clientWidth}`);
  if (screenshotDirectory) {
    await page.locator('#playerDialog').screenshot({ path: resolve(screenshotDirectory, 'player-profile-mobile.png') });
  }
  await page.locator('#closeDialog').click();
  if (screenshotDirectory) {
    await page.locator('#jugadores').screenshot({ path: resolve(screenshotDirectory, 'ranking-mobile.png') });
  }

  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({
    ready: true,
    players: model.playerProfiles.length,
    appearances: expectedAppearances,
    searches: ['name', 'handle', 'commander'],
    crossNavigation: ['player-commander-player', 'player-match-player'],
    mobile
  }, null, 2));
} finally {
  await browser.close();
}
