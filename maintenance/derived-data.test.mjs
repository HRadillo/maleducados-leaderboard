import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const derived = require('../derived-data.js');

const participant = (id, name, commander, extra = {}) => ({
  id,
  name,
  commander,
  colors: ['U'],
  moxfield: '',
  ...extra
});

const fixture = () => ({
  players: [
    { id: 'horacio-directory', name: 'Horacio R.', role: 'Host', handle: '@horacio' },
    { id: 'chris-directory', name: 'Chris', role: 'Invitado', handle: '@chris' }
  ],
  tables: [
    {
      id: 'single',
      title: 'Single commander',
      date: '2026-01-01',
      videoUrl: 'https://youtu.be/single',
      winnerId: 'h1',
      participants: [
        participant('h1', 'Horacio Radillo', 'Mothman', { moxfield: 'https://moxfield.com/decks/a', cardImage: 'https://img/a.jpg' }),
        participant('c1', 'Chris', 'Other Commander')
      ]
    },
    {
      id: 'partner-a',
      title: 'Partners A',
      date: '2026-01-02',
      videoUrl: 'https://youtu.be/partner-a',
      winnerId: 'c2',
      participants: [
        participant('h2', 'Horacio R.', 'Tana & Tymna', { moxfield: 'https://moxfield.com/decks/partners-a' }),
        participant('c2', 'Chris', 'Mothman', { moxfield: 'https://moxfield.com/decks/b' })
      ]
    },
    {
      id: 'partner-b',
      title: 'Partners B',
      date: '2026-01-03',
      videoUrl: '',
      resultMode: 'tie',
      winnerIds: [],
      participants: [
        participant('h3', 'Horacio R.', 'Tymna + Tana', { moxfield: '', cardImage: '', cardUrl: '' }),
        participant('c3', 'Chris', 'MOTHMAN', { moxfield: 'https://moxfield.com/decks/c' })
      ]
    }
  ]
});

test('canonical commander identity ignores case, spacing, separators and partner order', () => {
  assert.equal(derived.canonicalCommanderKey({ commander: ' Mothman ' }), derived.canonicalCommanderKey({ commander: 'mOtHmAn' }));
  assert.equal(derived.canonicalCommanderKey({ commander: 'Tana & Tymna' }), derived.canonicalCommanderKey({ commander: ' Tymna  +  Tana ' }));
  assert.equal(derived.commanderDisplay({ commander: 'Tymna + Tana' }), 'Tymna & Tana');
  assert.equal(derived.commanderParts({ commander: 'Solo' }).length, 1);
});

test('structured partner/background fields preserve both commanders and metadata', () => {
  const source = {
    commander: 'Burakos, Party Leader',
    partnerCommander: 'Folk Hero',
    commanders: [
      { name: 'Burakos, Party Leader', colors: ['B'], cardImage: 'burakos.jpg' },
      { name: 'Folk Hero', colors: ['W'], cardUrl: 'folk-hero' }
    ]
  };
  const parts = derived.commanderParts(source);
  assert.deepEqual(parts.map((part) => part.name), ['Burakos, Party Leader', 'Folk Hero']);
  assert.equal(derived.canonicalCommanderKey(source), 'burakos party leader::folk hero');
  assert.equal(parts[0].cardImage, 'burakos.jpg');
  assert.equal(parts[1].cardUrl, 'folk-hero');

  const duplicateFace = derived.commanderParts({
    commander: 'Miles Morales',
    partnerCommander: 'Ultimate Spider-Man',
    commanders: [
      { name: 'Miles Morales // Ultimate Spider-Man', cardImage: 'front.jpg' },
      { name: 'Miles Morales // Ultimate Spider-Man', cardUrl: 'card-url' }
    ]
  });
  assert.equal(duplicateFace.length, 1);
  assert.equal(duplicateFace[0].cardImage, 'front.jpg');
  assert.equal(duplicateFace[0].cardUrl, 'card-url');
  assert.equal(duplicateFace[0].name, 'Miles Morales // Ultimate Spider-Man');
});

test('appearances preserve every participant and current win/loss/tie semantics', () => {
  const data = fixture();
  const original = structuredClone(data);
  const appearances = derived.recordedAppearances(data);
  assert.equal(appearances.length, data.tables.reduce((sum, table) => sum + table.participants.length, 0));
  assert.deepEqual(
    appearances.reduce((totals, appearance) => ({
      wins: totals.wins + appearance.wins,
      losses: totals.losses + appearance.losses,
      ties: totals.ties + appearance.ties
    }), { wins: 0, losses: 0, ties: 0 }),
    { wins: 2, losses: 2, ties: 2 }
  );
  assert.equal(appearances.find((appearance) => appearance.participantId === 'h1').displayedPlayerName, 'Horacio R.');
  assert.equal(appearances.find((appearance) => appearance.participantId === 'h3').moxfield, '');
  assert.equal(appearances.find((appearance) => appearance.participantId === 'h3').cardImage, '');
  assert.deepEqual(data, original);
});

test('recorded matches project every table without duplicating or mutating it', () => {
  const data = fixture();
  const original = structuredClone(data);
  const model = derived.buildDerivedData(data);
  assert.equal(model.matches.length, data.tables.length);
  assert.deepEqual(model.matches.map((match) => match.participantsCount), [2, 2, 2]);
  assert.equal(model.matches[0].result, 'winner');
  assert.equal(model.matches[1].result, 'winner');
  assert.equal(model.matches[2].result, 'tie');
  assert.equal(model.matches[2].appearances.every((appearance) => appearance.result === 'tie'), true);
  assert.deepEqual(model.matches[0].metadata, data.tables[0]);
  assert.deepEqual(data, original);
});

test('recorded matches preserve multiple winners as one match result', () => {
  const data = fixture();
  data.tables.push({
    id: 'shared-win',
    title: 'Shared win',
    date: '2026-01-04',
    winnerIds: ['h4', 'c4'],
    participants: [
      participant('h4', 'Horacio R.', 'Mothman'),
      participant('c4', 'Chris', 'Other Commander')
    ]
  });
  const match = derived.buildDerivedData(data).matches.at(-1);
  assert.equal(match.result, 'multiple-winners');
  assert.deepEqual(match.winners.map((winner) => winner.participantId), ['h4', 'c4']);
  assert.equal(match.appearances.every((appearance) => appearance.result === 'win'), true);
});

test('commander groups ignore player and Moxfield while deck variants preserve both', () => {
  const model = derived.buildDerivedData(fixture());
  const mothmanKey = derived.canonicalCommanderKey({ commander: 'Mothman' });
  const mothman = model.commanderGroups.find((group) => group.commanderGroupKey === mothmanKey);
  assert.equal(mothman.appearancesCount, 3);
  assert.equal(mothman.distinctPlayerCount, 2);
  assert.equal(mothman.decklistVariants.length, 3);
  assert.equal(mothman.decklistVariants.reduce((sum, variant) => sum + variant.appearancesCount, 0), 3);
  assert.deepEqual(mothman.decklists.sort(), [
    'https://moxfield.com/decks/a',
    'https://moxfield.com/decks/b',
    'https://moxfield.com/decks/c'
  ]);
  assert.equal(model.deckVariants.filter((variant) => variant.commanderKey === mothmanKey).length, 3);

  const partnerGroups = model.commanderGroups.filter((group) => group.commanderGroupKey.includes('tana'));
  assert.equal(partnerGroups.length, 1);
  assert.equal(partnerGroups[0].appearancesCount, 2);
});

test('player profiles aggregate appearances and unique commander groups', () => {
  const model = derived.buildDerivedData(fixture());
  const horacio = model.playerProfiles.find((player) => player.name === 'Horacio R.');
  assert.equal(horacio.role, 'Host');
  assert.equal(horacio.handle, '@horacio');
  assert.equal(horacio.appearancesCount, 3);
  assert.deepEqual({ wins: horacio.wins, losses: horacio.losses, ties: horacio.ties, winRate: horacio.winRate }, {
    wins: 1,
    losses: 1,
    ties: 1,
    winRate: 50
  });
  assert.equal(horacio.commanderCount, 2);
  assert.equal(horacio.lastPlayedAt, '2026-01-03');
  assert.equal(horacio.insights.mostPlayedCommander.commanderDisplay, 'Tana & Tymna');
  assert.equal(horacio.insights.mostWinningCommander.commanderDisplay, 'Mothman');
});

test('declared aliases merge visually through central player identity', () => {
  const data = fixture();
  data.players[1].aliases = ['Pepe'];
  data.tables.push({
    id: 'alias',
    title: 'Alias appearance',
    date: '2026-01-04',
    winnerId: 'p4',
    participants: [participant('p4', 'Pepe', 'Alias Commander')]
  });
  const model = derived.buildDerivedData(data);
  assert.equal(model.playerProfiles.length, 2);
  const chris = model.playerProfiles.find((player) => player.name === 'Chris');
  assert.equal(chris.appearancesCount, 4);
  assert.ok(chris.aliases.includes('Pepe'));
  assert.equal(model.appearances.at(-1).playerId, chris.id);
});

test('conflicting aliases never override canonical player names or merge unrelated players', () => {
  const data = fixture();
  data.players.push({ id: 'pepe-directory', name: 'Pepe', role: 'Invitado', handle: '@pepe' });
  data.players[1].aliases = ['Pepe', 'Shared Alias'];
  data.players[2].aliases = ['Shared Alias'];
  data.tables.push({
    id: 'conflict',
    title: 'Alias conflict',
    date: '2026-01-04',
    winnerId: 'p4',
    participants: [
      participant('p4', 'Pepe', 'Pepe Commander'),
      participant('s4', 'Shared Alias', 'Unknown Commander')
    ]
  });
  const model = derived.buildDerivedData(data);
  assert.equal(model.appearances.at(-2).displayedPlayerName, 'Pepe');
  assert.equal(model.appearances.at(-1).displayedPlayerName, 'Shared Alias');
  assert.equal(model.playerProfiles.length, 4);
});

test('single-appearance players and missing handles remain valid profiles', () => {
  const data = fixture();
  data.tables.push({
    id: 'solo-player',
    title: 'One appearance',
    date: '2026-01-04',
    winnerId: 's1',
    participants: [participant('s1', 'Solo Guest', 'Solo Commander')]
  });
  const solo = derived.buildDerivedData(data).playerProfiles.find((player) => player.name === 'Solo Guest');
  assert.equal(solo.role, 'Invitado');
  assert.equal(solo.handle, '');
  assert.equal(solo.appearancesCount, 1);
  assert.equal(solo.wins, 1);
  assert.equal(solo.losses, 0);
  assert.equal(solo.commanderCount, 1);
});

test('color stats distinguish appearances, wins and win rate sample size', () => {
  const data = fixture();
  data.tables[0].participants[0].colors = [];
  data.tables[0].participants[0].commanders = [{ name: data.tables[0].participants[0].commander, colors: [], cardUrl: 'https://scryfall.com/card/colorless' }];
  data.tables[0].participants[1].colors = [];
  data.tables[0].participants[1].commanders = [];
  const stats = derived.buildDerivedData(data).colorStats;
  const blue = stats.find((item) => item.key === 'U');
  const colorless = stats.find((item) => item.key === 'C');
  const unknown = stats.find((item) => item.key === '?');
  assert.equal(colorless.appearances, 1);
  assert.equal(colorless.wins, 1);
  assert.equal(unknown.appearances, 1);
  assert.deepEqual({ appearances: blue.appearances, wins: blue.wins, losses: blue.losses, ties: blue.ties, decidedGames: blue.decidedGames }, {
    appearances: 4,
    wins: 1,
    losses: 1,
    ties: 2,
    decidedGames: 2
  });
  assert.equal(blue.winRate, 50);
});

test('repeated appearances and missing optional metadata remain represented', () => {
  const data = fixture();
  data.tables.push({
    id: 'repeat',
    date: '2026-01-04',
    winnerId: 'h4',
    participants: [participant('h4', 'Horacio R.', 'Mothman', { moxfield: '' })]
  });
  const model = derived.buildDerivedData(data);
  const mothman = model.commanderGroups.find((group) => group.commanderGroupKey === 'mothman');
  assert.equal(mothman.appearancesCount, 4);
  assert.equal(mothman.distinctPlayerCount, 2);
  assert.equal(mothman.lastPlayedAt, '2026-01-04');
  assert.equal(model.appearances.at(-1).commanders[0].cardUrl, '');
});
