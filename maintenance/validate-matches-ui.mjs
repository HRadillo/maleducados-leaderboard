import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [baseUrl = 'http://127.0.0.1:8767/', snapshotPath, screenshotDirectory = ''] = process.argv.slice(2);

if (!snapshotPath) {
  console.error('Usage: node maintenance/validate-matches-ui.mjs BASE_URL SNAPSHOT_DIRECTORY');
  process.exit(1);
}

const data = JSON.parse(await readFile(resolve(snapshotPath, 'dataset.json'), 'utf8'));
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(/firestore\.googleapis\.com/, (route) => route.abort());
  await page.goto(`${baseUrl}#partidas`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.setLeaderboardData === 'function');
  await page.evaluate((snapshot) => window.setLeaderboardData(snapshot), data);

  assert.equal(await page.locator('#matchCount').textContent(), `${data.tables.length} partidas`);
  assert.equal(await page.locator('#matchGrid .match-card').count(), Math.min(8, data.tables.length));
  assert.equal(await page.locator('#matchGrid .match-thumbnail').count(), Math.min(8, data.tables.length));
  assert.ok((await page.locator('#matchGrid .match-thumbnail').first().getAttribute('src')).startsWith('https://i.ytimg.com/vi/'));
  assert.equal(await page.locator('#matchGrid .match-thumbnail').first().getAttribute('loading'), 'lazy');

  for (const thumbnail of await page.locator('#matchGrid .match-thumbnail').all()) {
    await thumbnail.scrollIntoViewIfNeeded();
    await thumbnail.evaluate((image) => image.complete || new Promise((resolve) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    }));
  }
  await page.locator('#partidas').scrollIntoViewIfNeeded();

  const expectedNewest = [...data.tables]
    .map((table, tableIndex) => ({ table, tableIndex }))
    .sort((a, b) => (b.table.date || '').localeCompare(a.table.date || '') || b.tableIndex - a.tableIndex)[0].table.title;
  assert.equal((await page.locator('#matchGrid .match-link').first().textContent()).trim(), expectedNewest);
  if (screenshotDirectory) {
    await page.locator('#partidas').screenshot({ path: resolve(screenshotDirectory, 'partidas-desktop.png') });
  }

  const sampleTable = data.tables.find((table) => table.title && table.participants?.some((participant) => participant.name && participant.commander));
  for (const query of [sampleTable.title, sampleTable.participants[0].name, sampleTable.participants[0].commander]) {
    await page.locator('#matchSearchInput').fill(query);
    assert.ok(await page.locator('#matchGrid .match-card').count() > 0, `Search returned no matches for ${query}`);
  }
  await page.locator('#matchSearchInput').fill('partida-que-no-existe-xyz');
  assert.ok(await page.locator('#matchGrid .match-empty').isVisible());
  await page.locator('#matchSearchInput').fill('');

  const seenMatches = new Set();
  while (true) {
    for (const key of await page.locator('#matchGrid [data-match-key]').evaluateAll((nodes) => nodes.map((node) => node.dataset.matchKey))) {
      seenMatches.add(key);
    }
    const next = page.locator('#matchPagination > button').last();
    if (await next.isDisabled()) break;
    await next.click();
  }
  assert.equal(seenMatches.size, data.tables.length);
  await page.locator('#matchSortSelect').selectOption('title');
  assert.ok(await page.locator('#matchGrid .match-card').count() > 0);
  await page.locator('#matchSortSelect').selectOption('date-desc');

  await page.locator('#matchGrid .match-detail-button').first().click();
  assert.ok(await page.locator('#matchDialog[open]').isVisible());
  assert.ok(await page.locator('#matchDialog .match-participant').count() > 0);
  await page.locator('#matchDialog [data-player-id]').first().click();
  assert.ok(await page.locator('#playerDialog[open]').isVisible());
  assert.ok(await page.locator('#playerDialog .player-match-list [data-match-key]').count() > 0);
  await page.locator('#playerDialog .player-match-list [data-match-key]').first().click();
  assert.ok(await page.locator('#matchDialog[open]').isVisible());
  await page.locator('#matchDialog [data-commander-key]').first().click();
  assert.ok(await page.locator('#commanderDialog[open]').isVisible());
  assert.ok(await page.locator('#commanderDialog .commander-history-list [data-match-key]').count() > 0);
  await page.locator('#commanderDialog .commander-history-list [data-match-key]').first().click();
  assert.ok(await page.locator('#matchDialog[open]').isVisible());
  await page.locator('#closeMatchDialog').click();

  assert.ok(await page.locator('#leaderboardRows tr').count() > 0);
  assert.ok(await page.locator('#commanderGrid .commander-card').count() > 0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#partidas').scrollIntoViewIfNeeded();
  const mobile = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    cardColumns: getComputedStyle(document.querySelector('#matchGrid')).gridTemplateColumns,
    mediaRatio: document.querySelector('.match-card-media').clientWidth / document.querySelector('.match-card-media').clientHeight,
    navItems: document.querySelectorAll('.rail-nav .rail-link').length
  }));
  assert.ok(mobile.pageWidth <= mobile.viewport, `Mobile page overflows: ${mobile.pageWidth} > ${mobile.viewport}`);
  assert.equal(mobile.navItems, 4);
  assert.equal(mobile.cardColumns.split(' ').length, 1);
  assert.ok(Math.abs(mobile.mediaRatio - (16 / 9)) < 0.02, `Unexpected thumbnail ratio: ${mobile.mediaRatio}`);
  if (screenshotDirectory) {
    await page.locator('#partidas').screenshot({ path: resolve(screenshotDirectory, 'partidas-mobile.png') });
  }
  await page.locator('#matchGrid .match-detail-button').first().click();
  const dialogWidths = await page.locator('#matchDialog').evaluate((dialog) => ({ client: dialog.clientWidth, scroll: dialog.scrollWidth }));
  assert.ok(dialogWidths.scroll <= dialogWidths.client, `Mobile dialog overflows: ${dialogWidths.scroll} > ${dialogWidths.client}`);

  const missingVideoData = structuredClone(data);
  missingVideoData.tables.forEach((table) => { table.videoUrl = ''; });
  await page.evaluate((snapshot) => window.setLeaderboardData(snapshot), missingVideoData);
  assert.ok(await page.locator('#matchGrid .match-card-media.is-unavailable').count() > 0);

  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({
    ready: true,
    matches: seenMatches.size,
    searches: 3,
    crossNavigation: ['match-player-match', 'match-commander-match'],
    mobile
  }, null, 2));
} finally {
  await browser.close();
}
