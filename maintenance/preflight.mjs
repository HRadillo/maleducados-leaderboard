import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { captureBaseline } from './baseline.mjs';
import { compareSnapshots, verifySnapshot } from './snapshot.mjs';

const [referencePath, freshPath] = process.argv.slice(2);

if (!referencePath || !freshPath) {
  console.error('Usage: node maintenance/preflight.mjs REFERENCE_SNAPSHOT FRESH_SNAPSHOT');
  process.exit(1);
}

try {
  const reference = await verifySnapshot(resolve(referencePath));
  const fresh = await verifySnapshot(resolve(freshPath));
  const comparison = compareSnapshots(reference, fresh);
  assert.ok(comparison.sameFields, 'Production fields changed since the approved reference snapshot');

  const approvedBaseline = JSON.parse(await readFile(resolve(referencePath, 'public-baseline.json'), 'utf8'));
  const currentBaseline = await captureBaseline(fresh);
  assert.equal(currentBaseline.sourceSha256, approvedBaseline.sourceSha256, 'app.js changed since the approved baseline');
  assert.equal(currentBaseline.resultSha256, approvedBaseline.resultSha256, 'Public derived output changed since the approved baseline');

  console.log(JSON.stringify({
    ready: true,
    updateTime: fresh.manifest.updateTime,
    counts: fresh.manifest.counts,
    fieldsSha256: fresh.manifest.fieldsSha256,
    publicResultSha256: currentBaseline.resultSha256
  }, null, 2));
} catch (error) {
  console.error(`NOT READY: ${error.message}`);
  process.exitCode = 2;
}
