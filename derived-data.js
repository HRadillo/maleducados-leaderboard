(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MaleducadosDerivedData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const COLOR_ORDER = ["W", "U", "B", "R", "G"];
  const LEGACY_PLAYER_ALIASES = new Map([
    ["horacio radillo", "Horacio R."],
    ["horacio r", "Horacio R."],
    ["alan villegas", "Alan V."],
    ["alan v", "Alan V."]
  ]);
  const AMPERSAND_CARD_NAMES = new Map([
    ["minsc & boo, timeless heroes", "Minsc & Boo, Timeless Heroes"]
  ]);

  function cleanText(value = "") {
    return String(value).replace(/[\u200d\uFE0E\uFE0F]/g, "").trim().replace(/\s+/g, " ");
  }

  function sourceString(value = "") {
    return value === undefined || value === null ? "" : String(value);
  }

  function identityText(value = "") {
    return cleanText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\u2018\u2019]/g, "'")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function slugify(value = "") {
    return identityText(value).replace(/\s+/g, "-");
  }

  function unique(values = []) {
    return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))];
  }

  function uniqueNames(values = []) {
    const seen = new Set();
    return values.filter((value) => {
      const key = identityText(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function orderedColors(values = []) {
    const colors = values.map((value) => String(value).toUpperCase());
    return COLOR_ORDER.filter((color) => colors.includes(color));
  }

  function cloneValue(value) {
    if (value === undefined || value === null) return value;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function splitCommanderNames(commander = "") {
    let value = cleanText(commander);
    AMPERSAND_CARD_NAMES.forEach((displayName, lookupName) => {
      if (value.toLowerCase().includes(lookupName)) {
        value = value.replace(new RegExp(displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), displayName.replace("&", "__AMP__"));
      }
    });

    return value
      .replace(/\s*\/\/\s*/g, " + ")
      .split(/\s+\+\s+|\s+&\s+/)
      .map((name) => cleanText(name.replace(/__AMP__/g, "&")))
      .filter(Boolean);
  }

  function commanderParts(source = {}) {
    const rawExplicitParts = Array.isArray(source.commanders)
      ? source.commanders.map((commander) => ({
          name: cleanText(commander.name || commander.commander || ""),
          colors: orderedColors(commander.colors || []),
          cardImage: sourceString(commander.cardImage || commander.image || ""),
          cardUrl: sourceString(commander.cardUrl || commander.url || "")
        })).filter((commander) => commander.name)
      : [];
    const explicitParts = [];
    rawExplicitParts.forEach((part) => {
      const existing = explicitParts.find((candidate) => identityText(candidate.name) === identityText(part.name));
      if (!existing) {
        explicitParts.push(part);
        return;
      }
      existing.colors = orderedColors([...existing.colors, ...part.colors]);
      existing.cardImage = existing.cardImage || part.cardImage;
      existing.cardUrl = existing.cardUrl || part.cardUrl;
    });

    const rawCommander = cleanText(source.commander || "");
    const faceNames = rawCommander.split(/\s*\/\/\s*/).map(cleanText).filter(Boolean);
    const rawNames = faceNames.length > 1 ? [rawCommander] : splitCommanderNames(rawCommander);
    const explicitBackFaces = explicitParts.flatMap((part) =>
      part.name.split(/\s*\/\/\s*/).map(cleanText).filter(Boolean).slice(1)
    );
    const partnerNames = splitCommanderNames(source.partnerCommander || "").filter((partnerName) =>
      ![...faceNames.slice(1), ...explicitBackFaces]
        .some((faceName) => identityText(faceName) === identityText(partnerName))
    );
    const names = explicitParts.length
      ? uniqueNames([...explicitParts.map((part) => part.name), ...partnerNames])
      : uniqueNames([...rawNames, ...partnerNames]);
    const partsByKey = new Map(explicitParts.map((part) => [identityText(part.name), part]));

    return names.map((name, index) => {
      const explicit = partsByKey.get(identityText(name));
      return explicit || {
        name,
        colors: index === 0 ? orderedColors(source.colors || []) : [],
        cardImage: index === 0 ? sourceString(source.cardImage || "") : "",
        cardUrl: index === 0 ? sourceString(source.cardUrl || "") : ""
      };
    });
  }

  function commanderDisplay(source = {}) {
    return commanderParts(source).map((commander) => commander.name).join(" & ");
  }

  function canonicalCommanderKey(source = {}) {
    const keys = unique(commanderParts(source).map((part) => identityText(part.name))).sort();
    return keys.join("::");
  }

  function legacyCanonicalPlayerName(name = "") {
    const displayName = cleanText(name);
    return LEGACY_PLAYER_ALIASES.get(identityText(displayName)) || displayName;
  }

  function playerDirectory(data = {}) {
    const directory = new Map();
    const canonicalNames = new Map();
    (data.players || []).forEach((player) => {
      const key = identityText(legacyCanonicalPlayerName(player.name));
      if (key && !canonicalNames.has(key)) canonicalNames.set(key, player);
    });
    canonicalNames.forEach((player, key) => directory.set(key, player));
    const aliases = new Map();
    (data.players || []).forEach((player) => {
      unique(player.aliases || []).forEach((alias) => {
        const key = identityText(legacyCanonicalPlayerName(alias));
        if (!key || canonicalNames.has(key)) return;
        const existing = aliases.get(key);
        aliases.set(key, existing && existing !== player ? null : player);
      });
    });
    aliases.forEach((player, key) => {
      if (player) directory.set(key, player);
    });
    return directory;
  }

  function resolvePlayerIdentity(name, data = {}, directory = playerDirectory(data)) {
    const suppliedName = legacyCanonicalPlayerName(name);
    const directoryPlayer = directory.get(identityText(suppliedName));
    const displayedName = legacyCanonicalPlayerName(directoryPlayer?.name || suppliedName);
    const key = identityText(displayedName);
    return {
      playerKey: key,
      playerId: slugify(displayedName || "jugador"),
      directoryPlayerId: directoryPlayer?.id || "",
      displayedName,
      role: directoryPlayer?.role || (displayedName === "Horacio R." || displayedName === "Alan V." ? "Host" : "Invitado"),
      handle: directoryPlayer?.handle || ""
    };
  }

  function isTieTable(table = {}) {
    return table.resultMode === "tie" || table.isTie === true;
  }

  function tableWinnerIds(table = {}) {
    if (isTieTable(table)) return [];
    const winnerIds = Array.isArray(table.winnerIds) ? table.winnerIds : [table.winnerId];
    return unique(winnerIds);
  }

  function tableMetadata(table = {}) {
    const metadata = { ...table };
    delete metadata.participants;
    return cloneValue(metadata);
  }

  function recordedAppearances(data = {}) {
    const appearances = [];
    const directory = playerDirectory(data);
    (data.tables || []).forEach((table, tableIndex) => {
      const winnerIds = tableWinnerIds(table);
      const tied = isTieTable(table);
      (table.participants || []).forEach((participant, participantIndex) => {
        const identity = resolvePlayerIdentity(participant.name || "", data, directory);
        const parts = commanderParts(participant);
        const colors = orderedColors([...(participant.colors || []), ...parts.flatMap((part) => part.colors || [])]);
        const colorIdentityKnown = colors.length > 0 || (parts.length > 0 && parts.every((part) => part.cardImage || part.cardUrl));
        const won = !tied && winnerIds.includes(participant.id);
        const tableId = cleanText(table.id || "") || `table-${tableIndex + 1}`;
        const matchKey = `${tableId}:${tableIndex}`;
        const participantId = cleanText(participant.id || "") || `participant-${participantIndex + 1}`;
        appearances.push({
          appearanceId: `${tableId}:${participantId}:${participantIndex + 1}`,
          matchKey,
          tableId,
          tableIndex,
          tableTitle: cleanText(table.title || ""),
          date: cleanText(table.date || ""),
          videoUrl: sourceString(table.videoUrl || ""),
          participantId,
          participantIndex,
          playerKey: identity.playerKey,
          playerId: identity.playerId,
          directoryPlayerId: identity.directoryPlayerId,
          playerName: cleanText(participant.name || ""),
          displayedPlayerName: identity.displayedName,
          role: participant.role || identity.role,
          handle: participant.handle || identity.handle,
          commanderDisplay: parts.map((part) => part.name).join(" & "),
          canonicalCommanderKey: canonicalCommanderKey(participant),
          commanders: parts,
          colors,
          colorIdentityKnown,
          archetype: cleanText(participant.archetype || ""),
          moxfield: sourceString(participant.moxfield || ""),
          cardImage: sourceString(participant.cardImage || parts[0]?.cardImage || ""),
          cardUrl: sourceString(participant.cardUrl || parts[0]?.cardUrl || ""),
          result: tied ? "tie" : won ? "win" : "loss",
          wins: won ? 1 : 0,
          losses: tied || won ? 0 : 1,
          ties: tied ? 1 : 0,
          isWinner: won,
          isTie: tied,
          winnerIds,
          metadata: {
            table: tableMetadata(table),
            participant: cloneValue(participant)
          }
        });
      });
    });
    return appearances;
  }

  function recordedMatches(data = {}, inputAppearances) {
    const appearances = inputAppearances || recordedAppearances(data);
    return (data.tables || []).map((table, tableIndex) => {
      const tableId = cleanText(table.id || "") || `table-${tableIndex + 1}`;
      const matchKey = `${tableId}:${tableIndex}`;
      const matchAppearances = appearances.filter((appearance) => appearance.tableIndex === tableIndex);
      const winners = matchAppearances.filter((appearance) => appearance.isWinner);
      const tied = isTieTable(table);
      return {
        matchKey,
        tableId,
        tableIndex,
        title: cleanText(table.title || ""),
        date: cleanText(table.date || ""),
        videoUrl: sourceString(table.videoUrl || ""),
        result: tied ? "tie" : winners.length > 1 ? "multiple-winners" : winners.length === 1 ? "winner" : "unresolved",
        isTie: tied,
        winnerIds: tableWinnerIds(table),
        winners,
        appearances: matchAppearances,
        participantsCount: matchAppearances.length,
        metadata: cloneValue(table)
      };
    });
  }

  function latestDate(values = []) {
    return values.filter(Boolean).sort().at(-1) || "";
  }

  function aggregateResult(target, appearance) {
    target.wins += appearance.wins;
    target.losses += appearance.losses;
    target.ties += appearance.ties;
  }

  function finalizeResult(target) {
    const decidedGames = target.wins + target.losses;
    target.winRate = decidedGames ? Math.round((target.wins / decidedGames) * 100) : 0;
    target.lastPlayedAt = latestDate(target.appearances.map((appearance) => appearance.date));
    return target;
  }

  function recordedDeckVariants(input = {}) {
    const appearances = Array.isArray(input) ? input : recordedAppearances(input);
    const variants = new Map();
    appearances.forEach((appearance) => {
      const key = [appearance.playerKey, appearance.canonicalCommanderKey, appearance.moxfield].join("|");
      const current = variants.get(key) || {
        deckVariantKey: key,
        playerKey: appearance.playerKey,
        playerId: appearance.playerId,
        playerName: appearance.displayedPlayerName,
        commanderKey: appearance.canonicalCommanderKey,
        commanderDisplay: appearance.commanderDisplay,
        commanders: appearance.commanders,
        colors: [],
        colorIdentityKnown: false,
        colorIdentityKnown: false,
        moxfield: appearance.moxfield,
        appearances: [],
        appearancesCount: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        winRate: 0,
        lastPlayedAt: ""
      };
      current.appearances.push(appearance);
      current.appearancesCount += 1;
      current.colors = orderedColors([...current.colors, ...appearance.colors]);
      current.colorIdentityKnown ||= appearance.colorIdentityKnown;
      aggregateResult(current, appearance);
      variants.set(key, current);
    });
    return [...variants.values()].map(finalizeResult);
  }

  function mergeCommanderMetadata(current = [], incoming = []) {
    const byKey = new Map(current.map((part) => [identityText(part.name), { ...part }]));
    incoming.forEach((part) => {
      const key = identityText(part.name);
      const saved = byKey.get(key) || { name: part.name, colors: [], cardImage: "", cardUrl: "" };
      saved.colors = orderedColors([...(saved.colors || []), ...(part.colors || [])]);
      saved.cardImage = saved.cardImage || part.cardImage || "";
      saved.cardUrl = saved.cardUrl || part.cardUrl || "";
      byKey.set(key, saved);
    });
    return [...byKey.values()];
  }

  function recordedDecklistVariants(appearances = []) {
    const variants = new Map();
    appearances.filter((appearance) => appearance.moxfield).forEach((appearance) => {
      const current = variants.get(appearance.moxfield) || {
        url: appearance.moxfield,
        appearancesCount: 0,
        players: [],
        lastPlayedAt: ""
      };
      current.appearancesCount += 1;
      current.lastPlayedAt = latestDate([current.lastPlayedAt, appearance.date]);
      if (!current.players.some((player) => player.playerKey === appearance.playerKey)) {
        current.players.push({
          playerKey: appearance.playerKey,
          playerId: appearance.playerId,
          directoryPlayerId: appearance.directoryPlayerId,
          name: appearance.displayedPlayerName,
          handle: appearance.handle
        });
      }
      variants.set(appearance.moxfield, current);
    });
    return [...variants.values()].sort((a, b) =>
      b.appearancesCount - a.appearancesCount ||
      b.lastPlayedAt.localeCompare(a.lastPlayedAt) ||
      a.url.localeCompare(b.url)
    );
  }

  function recordedCommanderGroups(input = {}) {
    const appearances = Array.isArray(input) ? input : recordedAppearances(input);
    const groups = new Map();
    appearances.forEach((appearance) => {
      const key = appearance.canonicalCommanderKey || `unknown:${appearance.appearanceId}`;
      const current = groups.get(key) || {
        commanderGroupKey: key,
        commanderDisplay: appearance.commanderDisplay,
        commanders: [],
        colors: [],
        appearances: [],
        appearancesCount: 0,
        distinctPlayers: [],
        distinctPlayerCount: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        winRate: 0,
        lastPlayedAt: "",
        decklists: [],
        decklistVariants: [],
        archetypes: [],
        tables: [],
        videos: []
      };
      current.appearances.push(appearance);
      current.appearancesCount += 1;
      current.commanders = mergeCommanderMetadata(current.commanders, appearance.commanders);
      current.colors = orderedColors([...current.colors, ...appearance.colors]);
      if (appearance.moxfield && !current.decklists.includes(appearance.moxfield)) current.decklists.push(appearance.moxfield);
      if (appearance.archetype && !current.archetypes.includes(appearance.archetype)) current.archetypes.push(appearance.archetype);
      if (appearance.videoUrl && !current.videos.includes(appearance.videoUrl)) current.videos.push(appearance.videoUrl);
      if (!current.distinctPlayers.some((player) => player.playerKey === appearance.playerKey)) {
        current.distinctPlayers.push({
          playerKey: appearance.playerKey,
          playerId: appearance.playerId,
          directoryPlayerId: appearance.directoryPlayerId,
          name: appearance.displayedPlayerName,
          handle: appearance.handle
        });
      }
      if (!current.tables.some((table) => table.tableId === appearance.tableId)) {
        current.tables.push({
          tableId: appearance.tableId,
          title: appearance.tableTitle,
          date: appearance.date,
          videoUrl: appearance.videoUrl
        });
      }
      aggregateResult(current, appearance);
      groups.set(key, current);
    });
    return [...groups.values()].map((group) => {
      group.distinctPlayerCount = group.distinctPlayers.length;
      group.decklistVariants = recordedDecklistVariants(group.appearances);
      return finalizeResult(group);
    });
  }

  function recordedPlayerProfiles(data = {}, inputAppearances) {
    const appearances = inputAppearances || recordedAppearances(data);
    const directoryById = new Map((data.players || []).map((player) => [player.id || "", player]));
    const profiles = new Map();
    const commandersByPlayer = new Map();

    appearances.forEach((appearance) => {
      const directoryPlayer = directoryById.get(appearance.directoryPlayerId) || {};
      const current = profiles.get(appearance.playerKey) || {
        playerKey: appearance.playerKey,
        id: appearance.playerId,
        directoryPlayerId: appearance.directoryPlayerId,
        name: appearance.displayedPlayerName,
        handle: appearance.handle || directoryPlayer.handle || "",
        role: directoryPlayer.role || appearance.role || "Invitado",
        signature: directoryPlayer.signature || "",
        aliases: [],
        appearances: [],
        appearancesCount: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        winRate: 0,
        lastPlayedAt: "",
        colors: [],
        commanders: [],
        commanderCount: 0,
        insights: {
          mostPlayedCommander: null,
          mostWinningCommander: null
        }
      };
      const aliasNames = [appearance.playerName, ...(directoryPlayer.aliases || [])];
      aliasNames.forEach((alias) => {
        const cleanAlias = cleanText(alias);
        if (cleanAlias && identityText(cleanAlias) !== appearance.playerKey && !current.aliases.some((saved) => identityText(saved) === identityText(cleanAlias))) {
          current.aliases.push(cleanAlias);
        }
      });
      current.handle = current.handle || appearance.handle || "";
      current.appearances.push(appearance);
      current.appearancesCount += 1;
      current.colors = orderedColors([...current.colors, ...appearance.colors]);
      aggregateResult(current, appearance);
      profiles.set(appearance.playerKey, current);

      const playerCommanders = commandersByPlayer.get(appearance.playerKey) || new Map();
      const commanderKey = appearance.canonicalCommanderKey || `unknown:${appearance.appearanceId}`;
      const commander = playerCommanders.get(commanderKey) || {
        commanderGroupKey: commanderKey,
        commanderDisplay: appearance.commanderDisplay,
        commanders: [],
        colors: [],
        appearances: [],
        appearancesCount: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        winRate: 0,
        lastPlayedAt: ""
      };
      commander.commanders = mergeCommanderMetadata(commander.commanders, appearance.commanders);
      commander.colors = orderedColors([...commander.colors, ...appearance.colors]);
      commander.colorIdentityKnown ||= appearance.colorIdentityKnown;
      commander.appearances.push(appearance);
      commander.appearancesCount += 1;
      aggregateResult(commander, appearance);
      playerCommanders.set(commanderKey, commander);
      commandersByPlayer.set(appearance.playerKey, playerCommanders);
    });

    return [...profiles.values()].map((profile) => {
      profile.commanders = [...(commandersByPlayer.get(profile.playerKey)?.values() || [])]
        .map(finalizeResult)
        .sort((a, b) =>
          b.appearancesCount - a.appearancesCount ||
          b.wins - a.wins ||
          b.lastPlayedAt.localeCompare(a.lastPlayedAt) ||
          a.commanderDisplay.localeCompare(b.commanderDisplay)
        );
      profile.commanderCount = profile.commanders.length;
      const winningCommanders = [...profile.commanders].sort((a, b) =>
        b.wins - a.wins || b.appearancesCount - a.appearancesCount || a.commanderDisplay.localeCompare(b.commanderDisplay)
      );
      profile.insights = {
        mostPlayedCommander: profile.commanders[0] || null,
        mostWinningCommander: winningCommanders[0]?.wins ? winningCommanders[0] : null
      };
      return finalizeResult(profile);
    });
  }

  function recordedColorStats(input = {}) {
    const appearances = Array.isArray(input) ? input : recordedAppearances(input);
    const stats = new Map();
    appearances.forEach((appearance) => {
      const key = appearance.colors.length ? appearance.colors.join("") : appearance.colorIdentityKnown ? "C" : "?";
      const current = stats.get(key) || {
        key,
        colors: appearance.colors,
        appearances: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        decidedGames: 0,
        winRate: 0
      };
      current.appearances += 1;
      aggregateResult(current, appearance);
      current.decidedGames = current.wins + current.losses;
      current.winRate = current.decidedGames ? Math.round((current.wins / current.decidedGames) * 100) : 0;
      stats.set(key, current);
    });
    return [...stats.values()];
  }

  function playerAliasCandidates(data = {}) {
    return (data.players || []).map((player) => ({
      playerId: player.id || "",
      canonicalName: legacyCanonicalPlayerName(player.name || ""),
      aliases: unique([player.name, ...(player.aliases || [])].map(cleanText))
    }));
  }

  function buildDerivedData(data = {}) {
    const appearances = recordedAppearances(data);
    return {
      appearances,
      matches: recordedMatches(data, appearances),
      deckVariants: recordedDeckVariants(appearances),
      commanderGroups: recordedCommanderGroups(appearances),
      playerProfiles: recordedPlayerProfiles(data, appearances),
      colorStats: recordedColorStats(appearances),
      playerAliasCandidates: playerAliasCandidates(data)
    };
  }

  return {
    COLOR_ORDER,
    cleanText,
    sourceString,
    identityText,
    splitCommanderNames,
    commanderParts,
    commanderDisplay,
    canonicalCommanderKey,
    legacyCanonicalPlayerName,
    resolvePlayerIdentity,
    recordedAppearances,
    recordedMatches,
    recordedDeckVariants,
    recordedDecklistVariants,
    recordedCommanderGroups,
    recordedPlayerProfiles,
    recordedColorStats,
    playerAliasCandidates,
    buildDerivedData
  };
});
