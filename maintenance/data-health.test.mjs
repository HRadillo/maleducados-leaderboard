import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
globalThis.MaleducadosDerivedData = require('../derived-data.js');
const health = require('../data-health.js');

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
