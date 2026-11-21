import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
globalThis.MaleducadosDerivedData = require('../derived-data.js');
const health = require('../data-health.js');

test('confirmed identity links preserve both historical names, results, decks and URLs', () => {
  const data = { players: [
    { id: 'alan', name: 'Alan V.', handle: '@alan.vica', decks: [{ videoUrl: 'old' }] },
    { id: 'variant', name: 'Alan V', handle: '@alternate', decks: [{ moxfield: 'old-list' }] }
  ], tables: [
    { id: 'one', videoUrl: 'https://youtu.be/one', winnerId: 'a', participants: [{ id: 'a', name: 'Alan V', commander: 'Tana', moxfield: 'https://moxfield.com/decks/one' }] },
    { id: 'two', resultMode: 'tie', participants: [{ id: 'b', name: 'Alan V.', commander: 'Tymna' }] }
  ] };
  const before = structuredClone(data);
  assert.ok(health.auditData(data).issues.some((item) => item.playerNames?.join('|') === 'Alan V.|Alan V'));
  health.linkPlayerIdentity(data, 'Alan V.', 'Alan V');
  assert.deepEqual(data.tables, before.tables);
  assert.deepEqual(data.players[1].decks, before.players[1].decks);
  const [profile, ...rest] = globalThis.MaleducadosDerivedData.recordedPlayerProfiles(data);
  assert.equal(rest.length, 0);
  assert.deepEqual([profile.name, profile.handle, profile.wins, profile.ties], ['Alan V.', '@alan.vica', 1, 1]);
  assert.ok(!health.auditData(data).issues.some((item) => item.playerNames?.includes('Alan V')));
  const overlap = structuredClone(before);
  overlap.tables[0].participants.push(overlap.tables[1].participants[0]);
  assert.throws(() => health.linkPlayerIdentity(overlap, 'Alan V.', 'Alan V'), /misma mesa/);
});

test('health locates exact table fields and proposes players only found in history', () => {
  const data = { players: [{ id: 'a', name: 'Chris R.' }], tables: [
    { id: 't', participants: [{ name: 'Chris R', commander: 'Tana' }] }
  ] };
  const { issues } = health.auditData(data);
  assert.ok(issues.some((item) => item.code === 'possible-player-duplicate' && item.playerNames.includes('Chris R')));
  const link = issues.find((item) => item.code === 'empty-moxfield');
  assert.deepEqual([link.tableIndex, link.participantIndex], [0, 0]);
});

test('admin identity lookup inherits a unique profile handle and leaves ambiguous matches open', () => {
  const derived = globalThis.MaleducadosDerivedData;
  const data = { players: [
    { id: 'a', name: 'Chris R.', handle: '@chris', aliases: ['Christopher R.'] }
  ] };
  assert.equal(derived.reviewPlayerIdentity('Chris R', data)?.handle, '@chris');
  assert.equal(derived.reviewPlayerIdentity('Christopher R.', data)?.handle, '@chris');
  data.players.push({ id: 'b', name: 'Chris R', handle: '@another' });
  assert.equal(derived.reviewPlayerIdentity('Chris R!', data), null);
  assert.equal(derived.reviewPlayerIdentity('Chris R', data)?.handle, '@another');
});

test('health check classifies incomplete and malformed records without mutation', () => {
  const data = {
    players: [{ name: 'Pepe', handle: '@same' }, { name: 'PEPE', handle: '@same' }],
    tables: [{
      id: 't1', title: 'Mesa', date: '', videoUrl: 'not-a-url', winnerId: 'p1',
      participants: [{ id: 'p1', name: 'Pepe', commander: '', moxfield: 'bad-url', cardImage: 'bad-image' }]
    }]
  };
  const original = structuredClone(data);
  const report = health.auditData(data);
  assert.equal(report.healthy, false);
  assert.ok(report.counts.error >= 2);
  assert.ok(report.counts.warning >= 4);
  assert.ok(report.issues.some((item) => item.code === 'possible-player-duplicate'));
  assert.deepEqual(data, original);
});

test('health check reports commander variants and inverted partners as info', () => {
  const data = { players: [], tables: [
    { id: 'a', title: 'A', date: '2026-01-01', videoUrl: 'https://youtu.be/a', winnerId: 'a1', participants: [{ id: 'a1', name: 'A', commander: 'Tana & Tymna', moxfield: '' }] },
    { id: 'b', title: 'B', date: '2026-01-02', videoUrl: 'https://youtu.be/b', winnerId: 'b1', participants: [{ id: 'b1', name: 'B', commander: 'Tymna + Tana', moxfield: '' }] }
  ] };
  const report = health.auditData(data);
  assert.ok(report.issues.some((item) => item.code === 'commander-name-variants'));
  assert.ok(report.issues.some((item) => item.code === 'inverted-partners'));
  assert.equal(report.counts.error, 0);
});
