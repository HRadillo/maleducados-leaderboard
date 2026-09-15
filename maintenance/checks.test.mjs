import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { canonical, compareSnapshots, documentName, inspectDataset, restoreRequest, saveSnapshot, validateDocument, verifySnapshot } from './snapshot.mjs';
import { publicModel } from './baseline.mjs';

const fixture = () => ({
  name: documentName, updateTime: '2026-09-14T10:00:00.123456Z',
  fields: {
    data: { mapValue: { fields: { tables: { arrayValue: { values: [] } }, players: { arrayValue: { values: [] } } } } },
    unknownMetadata: { mapValue: { fields: {
      integer: { integerValue: '9223372036854775807' }, time: { timestampValue: '2026-09-14T10:00:00.123456Z' },
      bytes: { bytesValue: 'AAEC' }, point: { geoPointValue: { latitude: 12.5, longitude: -7 } },
      reference: { referenceValue: `${documentName}/other/document` },
      values: { arrayValue: { values: [{ nullValue: null }, { booleanValue: true }, { doubleValue: 'NaN' }] } }
    } } }
  }
});

test('snapshot and local restore plan preserve all typed fields; updateTime guards concurrent writes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'leaderboard-snapshot-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const document = fixture();
  await saveSnapshot(JSON.stringify(document), directory, 'synthetic-test');
  const target = await verifySnapshot(directory);
  const guard = structuredClone(target);
  guard.document.updateTime = '2026-09-14T11:00:00.654321Z';
  const request = restoreRequest(target, guard);
  assert.deepEqual(request.writes[0].update.fields, document.fields);
  assert.equal(request.writes[0].currentDocument.updateTime, guard.document.updateTime);
  assert.equal(request.writes[0].update.updateTime, undefined);
  assert.equal(request.writes[0].updateMask, undefined);
  await assert.rejects(saveSnapshot(JSON.stringify(document), directory), { code: 'EEXIST' });
  await writeFile(join(directory, 'document.json'), '{}');
  await assert.rejects(verifySnapshot(directory), /Checksum mismatch/);
});

test('reject wrong project, missing data and invalid server timestamp', () => {
  const document = fixture();
  assert.throws(() => validateDocument({ ...document, name: 'projects/other/documents/site/leaderboard' }));
  assert.throws(() => validateDocument({ ...document, fields: {} }));
  assert.throws(() => validateDocument({ ...document, updateTime: '' }));
});

test('invariant comparison detects metadata/URL/result changes even when counts stay equal', () => {
  const before = { document: fixture(), manifest: { counts: { tables: 1 } } };
  before.document.fields.data.mapValue.fields.tables.arrayValue.values = [{ mapValue: { fields: { videoUrl: { stringValue: 'https://youtu.be/original' }, winnerId: { stringValue: 'p1' } } } }];
  const after = structuredClone(before);
  assert.ok(compareSnapshots(before, after).sameFields);
  after.document.fields.data.mapValue.fields.tables.arrayValue.values[0].mapValue.fields.videoUrl.stringValue = '';
  assert.equal(compareSnapshots(before, after).sameTablesIncludingAllMetadata, false);
  assert.equal(compareSnapshots(before, after).sameDataset, false);
  assert.equal(canonical({ a: 1, b: 2 }), canonical({ b: 2, a: 1 }));
  assert.notEqual(canonical([1, 2]), canonical([2, 1]));
});

test('read-only inventory reports duplicates without removing them', () => {
  const data = { players: [], tables: [{ id: 'same', participants: [] }, { id: 'same', participants: [] }] };
  const original = structuredClone(data);
  const audit = inspectDataset(data);
  assert.deepEqual(data, original);
  assert.equal(audit.counts.tables, 2);
  assert.deepEqual(audit.possibleDuplicates.tableIds, [[0, 1]]);
});

test('current public behavior: single/two winners, ties, partners and empty URLs', async () => {
  const rows = [
    { id: 'a', name: 'A', commander: 'First', commanders: [{ name: 'First', colors: ['U'] }, { name: 'Second', colors: ['R'] }], colors: [], moxfield: '' },
    { id: 'b', name: 'B', commander: 'Third', colors: ['G'], moxfield: '' },
    { id: 'c', name: 'C', commander: 'Fourth', colors: ['W'], moxfield: '' }
  ];
  const data = { players: [], socials: [{ url: 'https://youtube.com/channel' }], tables: [
    { id: 'single', participants: rows, winnerId: 'a' },
    { id: 'two', participants: rows, winnerIds: ['a', 'b'], resultMode: 'two' },
    { id: 'tie', participants: rows, resultMode: 'tie', winnerIds: [] }
  ] };
  const original = structuredClone(data);
  const { model } = await publicModel(data);
  const players = model.recordedPlayers();
  assert.deepEqual(JSON.parse(JSON.stringify(players.map(({ name, wins, losses, appearancesCount }) => ({ name, wins, losses, appearances: appearancesCount })))), [
    { name: 'A', wins: 2, losses: 0, appearances: 3 }, { name: 'B', wins: 1, losses: 1, appearances: 3 }, { name: 'C', wins: 0, losses: 2, appearances: 3 }
  ]);
  assert.equal(model.winRate(players[0]), 100); // Existing denominator excludes ties.
  assert.equal(model.guildStats().find((guild) => guild.key === 'UR').played, 2);
  assert.equal(model.recordedDecks()[0].commanders.length, 2);
  assert.equal(model.recordedDecks()[0].videoUrl, data.socials[0].url);
  assert.match(model.recordedDecks()[0].moxfield, /moxfield.com\/users\//);
  assert.deepEqual(data, original);
});

test('editor preserves partner identity and commander names when metadata lookup fails', async () => {
  const source = await readFile(new URL('../admin.js', import.meta.url), 'utf8');
  const node = { dataset: {}, addEventListener() {}, elements: { resultMode: { addEventListener() {} }, videoUrl: { addEventListener() {} } } };
  const participant = { id: 'a', name: 'A', handle: '', commander: 'First', colors: ['U'], moxfield: 'https://moxfield.com/decks/a' };
  const data = { players: [{ id: 'a', name: 'A', decks: [{ ...participant, wins: 1, losses: 0 }] }], tables: [{ id: 't', participants: [participant], winnerId: 'a' }] };
  const context = { window: { MALEDucadosFirebaseConfig: { enabled: false }, getLeaderboardData: () => structuredClone(data) }, document: { querySelector: () => node }, console, URL, fetch: async () => { throw new Error('offline'); } };
  vm.createContext(context);
  vm.runInContext(source, context, { timeout: 5000 });
  assert.equal(vm.runInContext('playerDirectory()[0].decks[0].wins', context), 2);
  assert.equal(vm.runInContext('mergeDeckEntries([...getCurrentData().players[0].decks, ...playerDirectory()[0].decks])[0].wins', context), 3);
  assert.equal(vm.runInContext('parsePlayerLine("A - Burakos, Party Leader + Folk Hero").commander', context), 'Burakos, Party Leader');
  vm.runInContext('hydrateDraftParticipants({participants:[{commander:"First & Second"}]})', context);
  assert.equal(vm.runInContext('commanderDisplayFromParticipant(draftParticipants[0])', context), 'First & Second');
  const failure = await vm.runInContext('fetchCommanderCards("First")', context);
  assert.equal(failure.cards[0].name, 'First');
  assert.ok(source.indexOf('await firebaseApi.setDoc') < source.indexOf('window.setLeaderboardData(nextData)'), 'The public view must update only after Firestore confirms the save');
});
