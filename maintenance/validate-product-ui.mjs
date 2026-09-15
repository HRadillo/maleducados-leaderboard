import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const derived = require('../derived-data.js');
const [baseUrl = 'http://127.0.0.1:8769/', snapshotPath, screenshotDirectory = ''] = process.argv.slice(2);
if (!snapshotPath) throw new Error('Usage: node maintenance/validate-product-ui.mjs BASE_URL SNAPSHOT_DIRECTORY [SCREENSHOT_DIRECTORY]');

const data = JSON.parse(await readFile(resolve(snapshotPath, 'dataset.json'), 'utf8'));
const model = derived.buildDerivedData(data);
if (screenshotDirectory) await mkdir(resolve(screenshotDirectory), { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(/firestore\.googleapis\.com/, (route) => route.abort());
  await page.goto(`${baseUrl}#inicio`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.setLeaderboardData === 'function');
  await page.evaluate((snapshot) => window.setLeaderboardData(snapshot), data);

  assert.equal(Number(await page.locator('#totalGames').textContent()), data.tables.length);
  assert.equal(Number(await page.locator('#uniquePlayerCount').textContent()), model.playerProfiles.length);
  assert.equal(Number(await page.locator('#uniqueCommanderCount').textContent()), model.commanderGroups.length);
  assert.equal(await page.locator('[data-view]:not([hidden])').count(), 4);
  assert.ok(await page.locator('#guildPlayedStats .guild-stat-card').count() > 0);
  assert.ok(await page.locator('#guildRateStats .meta-sample').count() > 0);

  const searchable = model.commanderGroups.find((group) => group.distinctPlayers.length && group.commanderDisplay);
  await page.locator('#globalSearchInput').fill(searchable.commanderDisplay);
  assert.ok(await page.locator('#globalSearchResults [data-commander-key]').count() > 0);
  assert.ok(await page.locator('#globalSearchResults [data-player-id]').count() > 0);
  assert.ok(await page.locator('#globalSearchResults [data-match-key]').count() > 0);
  await page.locator('#globalSearchResults [data-commander-key]').first().click();
  assert.ok(await page.locator('#commanderDialog[open]').isVisible());
  await page.locator('#closeCommanderDialog').click();

  await page.locator('.rail-link[href="#comandantes"]').click();
  await page.waitForFunction(() => document.querySelector('[data-view="comandantes"]')?.hidden === false);
  const commanderPilot = searchable.distinctPlayers[0].name;
  await page.locator('#commanderSearchInput').fill(commanderPilot);
  assert.ok(await page.locator('#commanderGrid .commander-card').count() > 0);
  await page.locator('#commanderSearchInput').fill('comandante-que-no-existe-xyz');
  assert.ok(await page.locator('#commanderGrid .commander-empty').isVisible());
  await page.locator('#commanderSearchInput').fill('');
  await page.locator('#commanderSortSelect').selectOption('played');
  const topPlayedKey = [...model.commanderGroups].sort((a, b) => b.appearancesCount - a.appearancesCount || (b.lastPlayedAt || '').localeCompare(a.lastPlayedAt || '') || a.commanderDisplay.localeCompare(b.commanderDisplay))[0].commanderGroupKey;
  assert.equal(await page.locator('#commanderGrid [data-commander-key]').first().getAttribute('data-commander-key'), topPlayedKey);
  const coloredGroup = model.commanderGroups.find((group) => group.colors.length === 1);
  if (coloredGroup) {
    const colorInput = page.locator(`.deck-color-filter input[value="${coloredGroup.colors[0]}"]`);
    await colorInput.focus();
    await colorInput.press('Space');
    assert.equal(await colorInput.isChecked(), true);
    await page.locator('#commanderColorMode').selectOption('exact');
    assert.ok(await page.locator('#commanderGrid .commander-card').count() > 0);
    await colorInput.press('Space');
  }

  for (const route of ['jugadores', 'comandantes', 'partidas', 'inicio']) {
    await page.locator(`.rail-link[href="#${route}"]`).click();
    await page.waitForFunction((nextRoute) => document.querySelector(`[data-view="${nextRoute}"]`)?.hidden === false, route);
    assert.ok(await page.locator(`[data-view="${route}"]:not([hidden])`).count() > 0, `${route} did not open`);
    assert.equal(await page.locator('.rail-link[aria-current="page"]').getAttribute('href'), `#${route}`);
  }

  await page.locator('.admin-access').click();
  await page.waitForFunction(() => document.querySelector('[data-view="admin"]')?.hidden === false);
  assert.ok(await page.locator('#adminLocked').isVisible());
  assert.ok(await page.locator('#adminPanel').isHidden());
  await page.locator('.rail-link[href="#inicio"]').click();
  await page.waitForFunction(() => document.querySelector('[data-view="inicio"]')?.hidden === false);

  if (screenshotDirectory) await page.screenshot({ path: resolve(screenshotDirectory, 'inicio-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, pageWidth: document.documentElement.scrollWidth }));
  assert.ok(mobile.pageWidth <= mobile.viewport, `Mobile home overflows: ${mobile.pageWidth} > ${mobile.viewport}`);
  if (screenshotDirectory) await page.screenshot({ path: resolve(screenshotDirectory, 'inicio-mobile.png'), fullPage: true });

  const health = await page.evaluate((snapshot) => window.MaleducadosDataHealth.auditData(snapshot), data);
  assert.equal(health.counts.error, 0);
  assert.equal(health.issues.some((issue) => issue.code === 'empty-moxfield'), true);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ ready: true, views: 4, globalSearch: true, commanders: model.commanderGroups.length, health: health.counts, mobile }, null, 2));
} finally {
  await browser.close();
}
