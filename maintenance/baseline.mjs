import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { canonical, sha256, verifySnapshot } from './snapshot.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function publicModel(data) {
  const source = await readFile(resolve(root, 'app.js'), 'utf8');
  const derivedSource = await readFile(resolve(root, 'derived-data.js'), 'utf8');
  const marker = '  init();';
  assert.equal(source.split(marker).length, 2, 'App entrypoint changed; review characterization harness');
  const node = { addEventListener() {} };
  const context = { MALEDucadosData: structuredClone(data), addEventListener() {}, document: { querySelector: () => node, querySelectorAll: () => [], addEventListener() {} }, console };
  context.window = context;
  // Execute the actual declarations in an isolated VM, without initialization/network/render.
  vm.runInNewContext(derivedSource, context, { timeout: 5000 });
  vm.runInNewContext(source.replace(marker, '  window.auditModel = { recordedDecks, recordedPlayers, guildStats, winRate, leaderboardCompare, canonicalPlayerName, commanderParts };'), context, { timeout: 5000 });
  return { model: context.auditModel, sourceSha256: sha256(source) };
}

export async function captureBaseline(snapshot) {
  const { model, sourceSha256 } = await publicModel(snapshot.data);
  const result = JSON.parse(JSON.stringify({
    players: model.recordedPlayers().sort(model.leaderboardCompare),
    decks: model.recordedDecks(),
    guilds: model.guildStats()
  }));
  return { sourceSha256, documentFieldsSha256: snapshot.manifest.fieldsSha256, resultSha256: sha256(canonical(result)), result };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 3, 'Usage: node maintenance/baseline.mjs SNAPSHOT_DIR');
    const directory = resolve(process.argv[2]);
    const baseline = await captureBaseline(await verifySnapshot(directory));
    await writeFile(resolve(directory, 'public-baseline.json'), JSON.stringify(baseline, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ players: baseline.result.players.length, decks: baseline.result.decks.length, resultSha256: baseline.resultSha256 }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
