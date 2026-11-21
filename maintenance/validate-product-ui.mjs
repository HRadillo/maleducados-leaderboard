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
  const wins = model.playerProfiles.reduce((counts, player) => {
    counts[player.role === 'Host' ? 'host' : 'guest'] += player.wins;
    return counts;
  }, { host: 0, guest: 0 });
  const totalWins = wins.host + wins.guest;
  const hostShare = totalWins ? 100 * wins.host / totalWins : 0;
  assert.equal(Number(await page.locator('#rivalryTotal').textContent()), totalWins);
  assert.equal(Number((await page.locator('#rivalryHostArc').getAttribute('stroke-dasharray')).split(' ')[0]), hostShare);
  assert.match(await page.locator('#rivalryHostWins').textContent(), new RegExp(`^${wins.host} · `));
  assert.match(await page.locator('#rivalryGuestWins').textContent(), new RegExp(`^${wins.guest} · `));
  assert.match(await page.locator('#seasonLabel').textContent(), /^Temporada [1-4] · \d{4} \| Actualizado /);
  assert.equal(await page.locator('[data-view]:not([hidden])').count(), 4);
  assert.equal(await page.locator('#guildPlayedStats .meta-chart-row').count(), model.colorStats.length);
  assert.equal((await page.locator('#guildPlayedStats .meta-chart-row strong').allTextContents()).reduce((sum, value) => sum + Number(value), 0), model.appearances.length);
  const more = page.locator('.meta-chart-more');
  if (await more.count()) {
    const summary = more.locator('summary');
    await summary.click();
    assert.equal(await more.evaluate((node) => node.open), true);
    await summary.click();
    assert.equal(await more.evaluate((node) => node.open), false);
    await summary.press('Enter');
    assert.equal(await more.evaluate((node) => node.open), true);
    await summary.press('Space');
    assert.equal(await more.evaluate((node) => node.open), false);
  }
  const chartRow = page.locator('#guildPlayedStats .meta-chart-row').first();
  const chartKey = await chartRow.getAttribute('data-guild-key');
  await chartRow.press('Enter');
  assert.equal(await page.locator('#guildDialog[open] .guild-deck-list .dialog-deck').count(), model.colorStats.find((stat) => stat.key === chartKey).appearances);
  await page.locator('#closeGuildDialog').click();
  const flame = page.locator('#winnerFlame');
  await flame.scrollIntoViewIfNeeded();
  const firstFrame = await flame.evaluate((canvas) => canvas.toDataURL());
  await page.waitForFunction((first) => document.querySelector('#winnerFlame').toDataURL() !== first, firstFrame);
  await page.waitForTimeout(5100);
  const laterFrame = await flame.evaluate((canvas) => canvas.toDataURL());
  await page.waitForFunction((last) => document.querySelector('#winnerFlame').toDataURL() !== last, laterFrame, { timeout: 1000 });
  assert.equal(await page.locator('.winner-fire button').count(), 0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  const stillFrame = await flame.evaluate((canvas) => canvas.toDataURL());
  const palette = await flame.evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let violet = 0;
    let coral = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const [red, green, blue, alpha] = pixels.subarray(i, i + 4);
      if (alpha < 210) continue;
      if (blue > red + 24 && red > green + 30) violet += 1;
      if (red > 220 && green > 72 && green > blue) coral += 1;
    }
    return { violet, coral };
  });
  assert.ok(palette.violet > 300 && palette.coral > 300, JSON.stringify(palette));
  await page.waitForTimeout(120);
  assert.equal(await flame.evaluate((canvas) => canvas.toDataURL()), stillFrame);
  assert.ok(await page.locator('#guildRateStats .meta-sample').count() > 0);
  const fills = await page.locator('.meta-chart-track > span, .guild-bar > span, .rate-bar > span').evaluateAll((bars) =>
    bars.map((bar) => ({
      width: parseFloat(bar.style.width),
      hue: Number(bar.getAttribute('style').match(/hsl\((\d+),/)?.[1]),
      glow: getComputedStyle(bar).boxShadow
    }))
  );
  assert.ok(fills.some(({ hue }) => hue === 138));
  assert.ok(fills.some(({ hue }) => hue < 30));
  for (const { width, hue, glow } of fills) {
    assert.equal(hue, Math.round(width / 100 * 138));
    if (width) assert.notEqual(glow, 'none');
  }
  assert.ok(await page.locator('#guildPlayedStats .mana:not(.unknown)').evaluateAll((pips) =>
    pips.length > 0 && pips.every((pip) => getComputedStyle(pip).boxShadow !== 'none')
  ));
  assert.ok(await page.locator('.rivalry-host-arc, .rivalry-guest-arc').evaluateAll((arcs) =>
    arcs.length === 2 && arcs.every((arc) => getComputedStyle(arc).filter.includes('drop-shadow'))
  ));

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
  const pair = model.commanderGroups.find((group) => group.commanders.length === 2 && group.commanders.every((card) => card.cardImage));
  if (pair) {
    await page.locator('#commanderSearchInput').fill(pair.commanders[0].name);
    const groupButton = page.locator('#commanderGrid [data-commander-key]').filter({ hasText: pair.commanders[1].name }).first();
    assert.equal(await groupButton.locator('img').first().evaluate((image) => getComputedStyle(image).objectFit), 'contain');
    await groupButton.hover();
    assert.equal(await page.locator('#cardPreview').isHidden(), true);
    await page.locator('#cardPreview img').nth(1).waitFor({ state: 'visible' });
    const preview = await page.locator('#cardPreview').boundingBox();
    assert.ok(preview.x >= 0 && preview.y >= 0 && preview.x + preview.width <= 1440 && preview.y + preview.height <= 1000);
    if (screenshotDirectory) await page.screenshot({ path: resolve(screenshotDirectory, 'partner-hover.png') });
    await groupButton.click();
    assert.ok(await page.locator('#commanderDialog[open]').isVisible());
    await page.locator('#commanderDialog .commander-art-panel').first().click();
    assert.ok(await page.locator('#cardDialog[open] .full-card-image').isVisible());
    await page.getByRole('button', { name: 'Cerrar carta' }).click();
    assert.ok(await page.locator('#commanderDialog[open]').isVisible());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#commanderDialog .commander-art-panel').last().click();
    const mobileCard = page.locator('#cardDialog[open]');
    const mobileImage = await mobileCard.locator('.full-card-image').boundingBox();
    const mobileDialog = await mobileCard.boundingBox();
    assert.ok(mobileImage.x > mobileDialog.x && mobileImage.x + mobileImage.width < mobileDialog.x + mobileDialog.width);
    if (screenshotDirectory) await page.screenshot({ path: resolve(screenshotDirectory, 'carta-mobile.png') });
    await page.getByRole('button', { name: 'Cerrar carta' }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#closeCommanderDialog').click();
  }
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

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const problems = await page.evaluate(() => {
      const issues = [];
      const inside = (outer, inner) => {
        const a = outer.getBoundingClientRect();
        const b = inner.getBoundingClientRect();
        return b.left >= a.left + 2 && b.right <= a.right - 2 && b.top >= a.top + 2 && b.bottom <= a.bottom - 2;
      };
      const overlaps = (left, right) => {
        const a = left.getBoundingClientRect();
        const b = right.getBoundingClientRect();
        return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      };
      const panel = document.querySelector('.hero-panel');
      const fire = panel.querySelector('.winner-fire');
      for (const child of panel.children) if (!inside(panel, child)) issues.push(child.className);
      for (const child of panel.children) if (child !== fire && overlaps(child, fire)) issues.push('fire overlaps ' + child.className);
      for (const icon of document.querySelectorAll('.rail-link svg, .admin-access svg')) {
        if (!inside(icon.parentElement, icon)) issues.push(icon.parentElement.className || icon.parentElement.id);
      }
      if (document.documentElement.scrollWidth > innerWidth) issues.push('horizontal scroll');
      return issues;
    });
    assert.deepEqual(problems, [], `Layout at ${width}px`);
  }

  await page.setViewportSize({ width: 320, height: 760 });
  const fitsNarrow = await page.locator('.rivalry-metric').evaluate((el) => el.scrollWidth <= el.clientWidth);
  assert.ok(fitsNarrow, 'Win breakdown overflows at 320px');
  await page.evaluate((snapshot) => window.setLeaderboardData(snapshot), { ...data, tables: [] });
  assert.equal(await page.locator('#rivalryTotal').textContent(), '0');
  assert.equal(await page.locator('.rivalry-metric').getAttribute('data-has-wins'), 'false');
  assert.equal(await page.locator('.rivalry-guest-arc').isVisible(), false);

  const health = await page.evaluate((snapshot) => window.MaleducadosDataHealth.auditData(snapshot), data);
  assert.equal(health.counts.error, 0);
  assert.equal(health.issues.some((issue) => issue.code === 'empty-moxfield'), true);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ ready: true, views: 4, globalSearch: true, commanders: model.commanderGroups.length, health: health.counts, mobile }, null, 2));
} finally {
  await browser.close();
}
