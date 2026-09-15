import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const documentName = 'projects/maleducados-leaderboard/databases/(default)/documents/site/leaderboard';
const endpoint = `https://firestore.googleapis.com/v1/${documentName}`;
export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

// Sort object keys only: array order and Firestore type tags are historical data.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function decode(value) {
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('integerValue' in value) {
    const number = Number(value.integerValue);
    return Number.isSafeInteger(number) ? number : { $firestore: value };
  }
  for (const type of ['stringValue', 'booleanValue', 'nullValue', 'doubleValue']) {
    if (type in value) return value[type];
  }
  // Keep timestamps, references, bytes, geopoints and future types tagged in the preview.
  return { $firestore: value };
}

export function validateDocument(document) {
  assert.equal(document.name, documentName, 'Wrong Firestore document/project');
  assert.equal(typeof document.updateTime, 'string', 'Missing server updateTime');
  assert.ok(!Number.isNaN(Date.parse(document.updateTime)), 'Invalid updateTime');
  assert.ok(document.fields?.data?.mapValue?.fields, 'Missing data map; no fallback used');
  return decode(document.fields.data);
}

const list = (value) => Array.isArray(value) ? value : [];
const keysOf = (rows) => [...new Set(rows.flatMap((row) => Object.keys(row || {})))].sort();

export function inspectDataset(data) {
  const tables = list(data.tables);
  const players = list(data.players);
  const participants = tables.flatMap((table) => list(table.participants));
  const issues = [];
  const issue = (path, reason) => issues.push({ path, reason });
  const duplicateGroups = (rows, key) => {
    const groups = new Map();
    rows.forEach((row, index) => {
      const value = key(row);
      if (value) groups.set(value, [...(groups.get(value) || []), index]);
    });
    return [...groups.values()].filter((group) => group.length > 1);
  };
  if (!Array.isArray(data.tables)) issue('tables', 'Missing/non-array tables');
  if (!Array.isArray(data.players)) issue('players', 'Missing/non-array players');
  tables.forEach((table, ti) => {
    const path = `tables[${ti}]`;
    for (const key of ['id', 'title', 'date', 'videoUrl']) if (!table[key]) issue(`${path}.${key}`, 'Empty or absent');
    if (!Array.isArray(table.participants) || !table.participants.length) issue(`${path}.participants`, 'Missing/empty participants');
    const rows = list(table.participants);
    const winners = Array.isArray(table.winnerIds) ? table.winnerIds : [table.winnerId].filter(Boolean);
    const tie = table.resultMode === 'tie' || table.isTie === true;
    if (tie && winners.length) issue(path, 'Tie also contains winner IDs');
    if (!tie && !winners.length) issue(path, 'Non-tie has no winners');
    if (new Set(winners).size !== winners.length) issue(path, 'Repeated winner ID');
    if (table.winnerId && winners[0] !== table.winnerId) issue(path, 'winnerId differs from first winnerIds item');
    if (winners.some((id) => !rows.some((row) => row.id === id))) issue(path, 'Winner not found among participants');
    if (winners.length > 2) issue(path, 'More winners than editor supports');
    if (table.isTie && !table.resultMode) issue(path, 'Legacy tie: editor does not hydrate isTie');
    for (const group of duplicateGroups(rows, (row) => row.id)) issue(path, `Repeated participant ID at indices ${group}`);
    rows.forEach((row, pi) => {
      const rp = `${path}.participants[${pi}]`;
      for (const key of ['id', 'name', 'commander']) if (!row[key]) issue(`${rp}.${key}`, 'Empty or absent');
      for (const key of ['handle', 'moxfield', 'cardImage', 'cardUrl']) if (!row[key]) issue(`${rp}.${key}`, 'Optional metadata empty/absent; do not invent');
      if (!Array.isArray(row.colors) || !row.colors.length) issue(`${rp}.colors`, 'Unknown OR colorless; requires verification');
      if (list(row.colors).some((color) => !'WUBRG'.split('').includes(color))) issue(`${rp}.colors`, 'Non-WUBRG value');
      if (row.partnerCommander && !list(row.commanders).length) issue(rp, 'Separate partner without structured commanders; public fallback ignores partnerCommander');
      if (/\s[&+]\s|\/\//.test(row.commander || '')) issue(rp, 'Combined name: inspect partner/background/double-faced card manually');
      if (list(row.commanders).some((card) => !card.name)) issue(`${rp}.commanders`, 'Structured card missing name');
    });
  });
  players.forEach((player, index) => {
    if (!player.handle) issue(`players[${index}].handle`, 'Optional social tag missing');
  });
  return {
    counts: { tables: tables.length, participants: participants.length, players: players.length, storedDecks: players.reduce((sum, player) => sum + list(player.decks).length, 0) },
    fields: { dataset: Object.keys(data).sort(), table: keysOf(tables), participant: keysOf(participants), player: keysOf(players), deck: keysOf(players.flatMap((player) => list(player.decks))), commander: keysOf(participants.flatMap((row) => list(row.commanders))) },
    possibleDuplicates: {
      tableIds: duplicateGroups(tables, (table) => table.id),
      exactTableTriples: duplicateGroups(tables, (table) => JSON.stringify([table.title, table.date, table.videoUrl])),
      playerIds: duplicateGroups(players, (player) => player.id),
      playerNames: duplicateGroups(players, (player) => player.name?.trim().toLowerCase())
    },
    issues,
    note: 'Observational only. Does not resolve identities, validate URLs remotely, verify card rules or certify historical completeness.'
  };
}

async function privateDirectory(prefix) {
  const directory = resolve(root, '.backups', `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return directory;
}

async function writeExclusive(path, text) {
  await writeFile(path, text, { flag: 'wx', mode: 0o600 });
}

export async function saveSnapshot(raw, directory, source = 'public-firestore-rest') {
  const document = JSON.parse(raw);
  const data = validateDocument(document);
  const preview = `${JSON.stringify(data, null, 2)}\n`;
  const audit = `${JSON.stringify(inspectDataset(data), null, 2)}\n`;
  await writeExclusive(resolve(directory, 'document.json'), raw);
  await writeExclusive(resolve(directory, 'dataset.json'), preview);
  await writeExclusive(resolve(directory, 'audit.json'), audit);
  const manifest = {
    format: 1, source, capturedAt: new Date().toISOString(), documentName,
    updateTime: document.updateTime,
    hashes: { 'document.json': sha256(raw), 'dataset.json': sha256(preview), 'audit.json': sha256(audit) },
    fieldsSha256: sha256(canonical(document.fields)),
    counts: inspectDataset(data).counts
  };
  // A missing manifest marks an interrupted/incomplete backup as invalid.
  await writeExclusive(resolve(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function verifySnapshot(directory) {
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.format, 1, 'Unsupported snapshot format');
  assert.equal(manifest.documentName, documentName, 'Wrong manifest project/document');
  for (const file of ['document.json', 'dataset.json', 'audit.json']) {
    const raw = await readFile(resolve(directory, file), 'utf8');
    assert.equal(sha256(raw), manifest.hashes[file], `Checksum mismatch: ${file}`);
  }
  const document = JSON.parse(await readFile(resolve(directory, 'document.json'), 'utf8'));
  const data = validateDocument(document);
  assert.equal(manifest.updateTime, document.updateTime);
  assert.equal(manifest.fieldsSha256, sha256(canonical(document.fields)));
  assert.deepEqual(JSON.parse(await readFile(resolve(directory, 'dataset.json'), 'utf8')), data);
  assert.deepEqual(manifest.counts, inspectDataset(data).counts);
  return { document, data, manifest };
}

export function compareSnapshots(before, after) {
  const fields = (snapshot) => snapshot.document.fields;
  const map = (snapshot) => fields(snapshot).data.mapValue.fields;
  return {
    sameDocument: before.document.name === after.document.name,
    sameFields: canonical(fields(before)) === canonical(fields(after)),
    sameDataset: canonical(fields(before).data) === canonical(fields(after).data),
    sameTablesIncludingAllMetadata: canonical(map(before).tables ?? null) === canonical(map(after).tables ?? null),
    samePlayersIncludingAliasesAndDecks: canonical(map(before).players ?? null) === canonical(map(after).players ?? null),
    before: before.manifest.counts, after: after.manifest.counts
  };
}

export function restoreRequest(target, guard) {
  validateDocument(target.document);
  validateDocument(guard.document);
  // No update mask: restore all user fields, guarded against concurrent changes.
  return { writes: [{ update: { name: documentName, fields: target.document.fields }, currentDocument: { updateTime: guard.document.updateTime } }] };
}

async function main(args) {
  const [command, first, second] = args;
  if (command === 'backup' && args.length === 1) {
    // No credentials, no API keys, no auth/config discovery and no fallback to data.js.
    const response = await fetch(endpoint, { method: 'GET', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Firestore GET returned HTTP ${response.status}. No snapshot created. Verify access in Firebase Console.`);
    const raw = await response.text();
    validateDocument(JSON.parse(raw));
    const directory = await privateDirectory('snapshot');
    const manifest = await saveSnapshot(raw, directory);
    await verifySnapshot(directory);
    console.log(JSON.stringify({ directory, updateTime: manifest.updateTime, fieldsSha256: manifest.fieldsSha256, counts: manifest.counts }, null, 2));
  } else if (command === 'verify' && args.length === 2) {
    const { manifest } = await verifySnapshot(first);
    console.log(JSON.stringify({ verified: true, updateTime: manifest.updateTime, counts: manifest.counts }, null, 2));
  } else if (command === 'compare' && args.length === 3) {
    const result = compareSnapshots(await verifySnapshot(first), await verifySnapshot(second));
    console.log(JSON.stringify(result, null, 2));
    if (!result.sameFields) process.exitCode = 2;
  } else if (command === 'plan-restore' && args.length === 3) {
    const target = await verifySnapshot(first);
    const guard = await verifySnapshot(second);
    const directory = await privateDirectory('restore-plan');
    const request = JSON.stringify(restoreRequest(target, guard), null, 2);
    await writeExclusive(resolve(directory, 'request.json'), request);
    await writeExclusive(resolve(directory, 'review.json'), JSON.stringify({
      target: resolve(first), guard: resolve(second), requestSha256: sha256(request),
      expectedUpdateTime: guard.document.updateTime,
      comparison: compareSnapshots(target, guard),
      warning: 'LOCAL PLAN ONLY. Replaces all document fields. Requires reviewed approval, paused editing, fresh guard and authenticated operator. No request has been sent.'
    }, null, 2));
    console.log(`Local plan only: ${directory}. No Firestore write performed.`);
  } else {
    throw new Error('Usage: node maintenance/snapshot.mjs backup | verify SNAPSHOT_DIR | compare BEFORE_DIR AFTER_DIR | plan-restore TARGET_DIR FRESH_GUARD_DIR');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
