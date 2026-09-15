import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonical, documentName, validateDocument, verifySnapshot } from './snapshot.mjs';

const require = createRequire(import.meta.url);
const firebaseAuth = require('/usr/local/lib/node_modules/firebase-tools/lib/auth.js');
const [snapshotPath, refreshPath, confirmation] = process.argv.slice(2);
if (!snapshotPath || !refreshPath || confirmation !== '--apply') {
  throw new Error('Usage: node maintenance/apply-youtube-title-refresh.mjs SNAPSHOT_DIRECTORY REFRESH_DIRECTORY --apply');
}

const endpoint = `https://firestore.googleapis.com/v1/${documentName}`;
const commitEndpoint = 'https://firestore.googleapis.com/v1/projects/maleducados-leaderboard/databases/(default)/documents:commit';
const source = await verifySnapshot(resolve(snapshotPath));
const candidate = JSON.parse(await readFile(resolve(refreshPath, 'dataset.json'), 'utf8'));
const changes = JSON.parse(await readFile(resolve(refreshPath, 'changes.json'), 'utf8'));
assert.ok(changes.length > 0, 'No title changes to apply');

const liveResponse = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
if (!liveResponse.ok) throw new Error(`Fresh Firestore read returned HTTP ${liveResponse.status}`);
const liveDocument = await liveResponse.json();
assert.equal(liveDocument.updateTime, source.document.updateTime, 'Firestore changed after the backup; refresh cancelled');
assert.equal(canonical(liveDocument.fields), canonical(source.document.fields), 'Firestore fields changed after the backup; refresh cancelled');

const update = structuredClone(source.document);
for (const change of changes) {
  if (Number.isInteger(change.tableIndex)) {
    const tableFields = update.fields.data.mapValue.fields.tables.arrayValue.values[change.tableIndex].mapValue.fields;
    assert.equal(tableFields.title?.stringValue || '', change.before, `Unexpected source title at table ${change.tableIndex}`);
    tableFields.title = { stringValue: change.after };
  } else if (change.field === 'latestTable.title') {
    const latestFields = update.fields.data.mapValue.fields.latestTable.mapValue.fields;
    assert.equal(latestFields.title?.stringValue || '', change.before, 'Unexpected latestTable.title');
    latestFields.title = { stringValue: change.after };
  } else {
    throw new Error(`Unsupported change entry: ${JSON.stringify(change)}`);
  }
}
assert.equal(canonical(validateDocument(update)), canonical(candidate), 'Typed Firestore update does not match the reviewed candidate');

const account = firebaseAuth.getGlobalDefaultAccount();
assert.ok(account?.tokens?.refresh_token, 'Firebase CLI has no refresh token; run firebase login --reauth');
const token = await firebaseAuth.getAccessToken(account.tokens.refresh_token, []);
const response = await fetch(commitEndpoint, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ writes: [{
    update: { name: documentName, fields: update.fields },
    currentDocument: { updateTime: source.document.updateTime }
  }] }),
  signal: AbortSignal.timeout(30000)
});
const result = await response.json();
if (!response.ok) throw new Error(`Firestore commit returned HTTP ${response.status}: ${result.error?.message || 'unknown error'}`);
console.log(JSON.stringify({ applied: true, account: account.user?.email || 'unknown', titleChanges: changes.length, updateTime: result.writeResults?.[0]?.updateTime, commitTime: result.commitTime }, null, 2));
