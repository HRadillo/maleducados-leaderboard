import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonical, verifySnapshot } from './snapshot.mjs';

const [snapshotPath] = process.argv.slice(2);
if (!snapshotPath) throw new Error('Usage: node maintenance/refresh-youtube-titles.mjs SNAPSHOT_DIRECTORY');

function videoId(value = '') {
  try {
    const url = new URL(value);
    if (url.hostname.includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] || '';
    if (url.searchParams.get('v')) return url.searchParams.get('v');
    return url.pathname.match(/\/(?:shorts|embed)\/([^/?#]+)/)?.[1] || '';
  } catch {
    return '';
  }
}

function withoutRefreshableTitles(data) {
  const copy = structuredClone(data);
  for (const table of copy.tables || []) delete table.title;
  if (copy.latestTable) delete copy.latestTable.title;
  return copy;
}

const snapshot = await verifySnapshot(resolve(snapshotPath));
const data = JSON.parse(await readFile(resolve(snapshotPath, 'dataset.json'), 'utf8'));
const apiKey = data.channelStats?.youtubeApiKey;
assert.ok(apiKey, 'The production snapshot does not contain the configured YouTube API key');

const ids = [...new Set((data.tables || []).map((table) => videoId(table.videoUrl)).filter(Boolean))];
const titles = new Map();
for (let offset = 0; offset < ids.length; offset += 50) {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('id', ids.slice(offset, offset + 50).join(','));
  url.searchParams.set('key', apiKey);
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Referer: 'https://maleducados-leaderboard.web.app/' },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    throw new Error(`YouTube Data API returned HTTP ${response.status}: ${failure.error?.errors?.[0]?.reason || failure.error?.message || 'unknown error'}`);
  }
  const payload = await response.json();
  for (const item of payload.items || []) if (item.id && item.snippet?.title) titles.set(item.id, item.snippet.title);
}

const nextData = structuredClone(data);
const changes = [];
for (const [index, table] of (nextData.tables || []).entries()) {
  const id = videoId(table.videoUrl);
  const nextTitle = titles.get(id);
  if (!nextTitle || nextTitle === table.title) continue;
  changes.push({ tableIndex: index, tableId: table.id || '', videoId: id, before: table.title || '', after: nextTitle });
  table.title = nextTitle;
}

const latestId = videoId(nextData.latestTable?.videoUrl);
const latestTitle = titles.get(latestId);
if (latestTitle && latestTitle !== nextData.latestTable?.title) {
  changes.push({ field: 'latestTable.title', videoId: latestId, before: nextData.latestTable?.title || '', after: latestTitle });
  nextData.latestTable.title = latestTitle;
}

assert.equal(canonical(withoutRefreshableTitles(nextData)), canonical(withoutRefreshableTitles(data)), 'A non-title field changed');
assert.equal(nextData.tables.length, data.tables.length, 'Table count changed');
assert.equal((nextData.tables || []).flatMap((table) => table.participants || []).length, (data.tables || []).flatMap((table) => table.participants || []).length, 'Participant count changed');

const directory = resolve(snapshotPath, '..', `youtube-title-refresh-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(directory, { recursive: false, mode: 0o700 });
await writeFile(resolve(directory, 'dataset.json'), `${JSON.stringify(nextData, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
await writeFile(resolve(directory, 'changes.json'), `${JSON.stringify(changes, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
await writeFile(resolve(directory, 'manifest.json'), `${JSON.stringify({
  sourceSnapshot: resolve(snapshotPath),
  sourceUpdateTime: snapshot.manifest.updateTime,
  videosRequested: ids.length,
  videosFound: titles.size,
  titleChanges: changes.length,
  invariant: 'Only tables[].title and latestTable.title may differ'
}, null, 2)}\n`, { mode: 0o600, flag: 'wx' });

console.log(JSON.stringify({ directory, videosRequested: ids.length, videosFound: titles.size, changes }, null, 2));
