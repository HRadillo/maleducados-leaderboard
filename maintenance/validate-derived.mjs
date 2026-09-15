import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { captureBaseline } from './baseline.mjs';
import { verifySnapshot } from './snapshot.mjs';

const require = createRequire(import.meta.url);
const derived = require('../derived-data.js');
const [snapshotPath] = process.argv.slice(2);

if (!snapshotPath) {
  console.error('Usage: node maintenance/validate-derived.mjs SNAPSHOT_DIRECTORY');
  process.exit(1);
}

const snapshot = await verifySnapshot(resolve(snapshotPath));
const data = JSON.parse(await readFile(resolve(snapshotPath, 'dataset.json'), 'utf8'));
const original = structuredClone(data);
const model = derived.buildDerivedData(data);
const expectedAppearances = (data.tables || []).reduce((sum, table) => sum + (table.participants || []).length, 0);

assert.equal(data.tables.length, original.tables.length, 'Table count changed while deriving data');
assert.equal(model.matches.length, data.tables.length, 'Public match count does not match table count');
assert.equal(model.appearances.length, expectedAppearances, 'Appearance count does not match participant count');
assert.deepEqual(data, original, 'Derived layer mutated the source dataset');

const approvedBaseline = JSON.parse(await readFile(resolve(snapshotPath, 'public-baseline.json'), 'utf8'));
const currentBaseline = await captureBaseline(snapshot);
assert.deepEqual(currentBaseline.result.decks, approvedBaseline.result.decks, 'Legacy deck calculations changed');
assert.deepEqual(currentBaseline.result.guilds, approvedBaseline.result.guilds, 'Metagame calculations changed');
const approvedPlayers = approvedBaseline.result.players.map((player) => ({
  name: player.name,
  wins: player.wins,
  losses: player.losses,
  appearances: player.appearances
})).sort((a, b) => a.name.localeCompare(b.name));
const currentPlayers = model.playerProfiles.map((player) => ({
  name: player.name,
  wins: player.wins,
  losses: player.losses,
  appearances: player.appearancesCount
})).sort((a, b) => a.name.localeCompare(b.name));
assert.deepEqual(currentPlayers, approvedPlayers, 'Player results changed while deriving profiles');
const oldDecks = currentBaseline.result.decks;
const oldTotals = oldDecks.reduce((totals, deck) => ({
  wins: totals.wins + Number(deck.wins || 0),
  losses: totals.losses + Number(deck.losses || 0),
  appearances: totals.appearances + Number(deck.appearances || 0)
}), { wins: 0, losses: 0, appearances: 0 });
const newTotals = model.appearances.reduce((totals, appearance) => ({
  wins: totals.wins + appearance.wins,
  losses: totals.losses + appearance.losses,
  ties: totals.ties + appearance.ties,
  appearances: totals.appearances + 1
}), { wins: 0, losses: 0, ties: 0, appearances: 0 });
assert.equal(newTotals.wins, oldTotals.wins, 'Historical wins changed');
assert.equal(newTotals.losses, oldTotals.losses, 'Historical losses changed');
assert.equal(newTotals.appearances, oldTotals.appearances, 'Historical appearance count changed');

const sourceRows = (data.tables || []).flatMap((table, tableIndex) =>
  (table.participants || []).map((participant, participantIndex) => ({ table, tableIndex, participant, participantIndex }))
);
sourceRows.forEach(({ table, participant }, index) => {
  const appearance = model.appearances[index];
  assert.equal(appearance.videoUrl, table.videoUrl || '', `Video URL changed at appearance ${index}`);
  assert.equal(appearance.moxfield, participant.moxfield || '', `Moxfield URL changed at appearance ${index}`);
  assert.equal(appearance.cardImage, participant.cardImage || appearance.commanders[0]?.cardImage || '', `Card image changed at appearance ${index}`);
  assert.equal(appearance.cardUrl, participant.cardUrl || appearance.commanders[0]?.cardUrl || '', `Card URL changed at appearance ${index}`);
  assert.deepEqual(appearance.metadata.participant, participant, `Participant metadata changed at appearance ${index}`);
});

const anomalies = {
  missingCommander: model.appearances.filter((appearance) => !appearance.canonicalCommanderKey).length,
  emptyMoxfield: model.appearances.filter((appearance) => !appearance.moxfield).length,
  missingCardMetadata: model.appearances.filter((appearance) =>
    !appearance.commanders.length || appearance.commanders.some((commander) => !commander.cardImage && !commander.cardUrl)
  ).length,
  multiCommanderAppearances: model.appearances.filter((appearance) => appearance.commanders.length > 1).length
};

console.log(JSON.stringify({
  ready: true,
  tables: data.tables.length,
  matches: model.matches.length,
  appearances: model.appearances.length,
  deckVariants: model.deckVariants.length,
  commanderGroups: model.commanderGroups.length,
  approvedPublicResultSha256: approvedBaseline.resultSha256,
  currentProfileResultSha256: currentBaseline.resultSha256,
  totals: newTotals,
  anomalies
}, null, 2));
