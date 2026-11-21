(function (root, factory) {
  const api = factory(root?.MaleducadosDerivedData);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MaleducadosDataHealth = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (derived) {
  "use strict";

  function validHttpUrl(value = "") {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }

  function normalizedUrl(value = "") {
    if (!validHttpUrl(value)) return "";
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  }

  function hostMatches(value, domains = []) {
    if (!validHttpUrl(value)) return false;
    const host = new URL(value).hostname.toLowerCase();
    return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  }

  function issue(severity, code, title, detail, location = {}) {
    return { severity, code, title, detail, ...location };
  }

  function playerNameRecords(data) {
    const records = new Map();
    function record(name, handle = "", table) {
      const key = derived.exactPlayerName(name);
      if (!key) return;
      const entry = records.get(key) || { name: derived.cleanText(name), handles: new Set(), tables: [] };
      const username = derived.cleanText(handle ?? "");
      if (username) entry.handles.add(username);
      if (table) entry.tables.push(table);
      records.set(key, entry);
    }
    (data.players || []).forEach((player) => record(player.name, player.handle));
    (data.tables || []).forEach((table, index) => {
      (table.participants || []).forEach((participant) => record(participant.name, participant.handle, { index, title: table.title, date: table.date }));
    });
    return records;
  }

  function linkPlayerIdentity(data, targetName, sourceName) {
    const key = derived.exactPlayerName;
    const targetKey = key(targetName);
    const sourceKey = key(sourceName);
    const records = playerNameRecords(data);
    if (!targetKey || targetKey === sourceKey || !records.has(targetKey) || !records.has(sourceKey)) {
      throw new Error("Selecciona dos perfiles distintos y vuelve a revisar.");
    }
    const links = derived.linkedPlayerDirectory(data);
    const players = data.players || [];
    const targetMatches = players.filter((player) => key(player.name) === targetKey);
    const sourceMatches = players.filter((player) => key(player.name) === sourceKey);
    if (targetMatches.length > 1 || sourceMatches.length > 1 ||
        [targetKey, sourceKey].some((name) => links.has(name) && key(links.get(name)?.name) !== name)) {
      throw new Error("Hay perfiles duplicados o enlaces previos. Revisa la identidad antes de fusionar.");
    }
    const target = targetMatches[0];
    const source = sourceMatches[0];
    const belongsTo = (participant, name, player) => {
      const participantKey = key(participant.name);
      return participantKey === name ||
        (player && links.get(participantKey)?.id === player.id) ||
        (player?.aliases || []).some((alias) => key(alias) === participantKey);
    };
    if ((data.tables || []).some((table) =>
      (table.participants || []).some((participant) => belongsTo(participant, targetKey, target)) &&
      (table.participants || []).some((participant) => belongsTo(participant, sourceKey, source)))) {
      throw new Error("Ambos perfiles aparecen en una misma mesa. Revisa esas participaciones antes de fusionar.");
    }
    if ([target, source].some((player) => player?.id && players.filter((item) => item.id === player.id).length !== 1)) {
      throw new Error("Hay IDs de jugador repetidos. Revisa los perfiles antes de fusionar.");
    }
    data.players = players;
    function ensureProfile(profile, name, nameKey) {
      const handles = [...records.get(nameKey).handles];
      const next = profile || { name, handle: handles.length === 1 ? handles[0] : "", decks: [] };
      if (!next.id) {
        const prefix = `player-${derived.slugify(name) || "registro"}`;
        let id = prefix;
        for (let suffix = 2; players.some((item) => item.id === id); suffix += 1) id = `${prefix}-${suffix}`;
        next.id = id;
      }
      if (!profile) players.push(next);
      return next;
    }
    const destination = ensureProfile(target, targetName, targetKey);
    const original = ensureProfile(source, sourceName, sourceKey);
    original.mergedInto = destination.id;
  }

  function auditData(data = {}, suppliedModel) {
    if (!derived) throw new Error("MaleducadosDerivedData is required");
    const model = suppliedModel || derived.buildDerivedData(data);
    const issues = [];
    const tables = data.tables || [];
    const expectedAppearances = tables.reduce((sum, table) => sum + (table.participants || []).length, 0);

    if (model.matches.length !== tables.length) {
      issues.push(issue("error", "match-count", "Conteo de partidas inconsistente", `${model.matches.length} partidas derivadas para ${tables.length} mesas.`));
    }
    if (model.appearances.length !== expectedAppearances) {
      issues.push(issue("error", "appearance-count", "Conteo de apariciones inconsistente", `${model.appearances.length} apariciones derivadas para ${expectedAppearances} participantes.`));
    }
    const resultTotals = model.appearances.reduce((totals, appearance) => {
      totals.wins += appearance.wins;
      totals.losses += appearance.losses;
      totals.ties += appearance.ties;
      return totals;
    }, { wins: 0, losses: 0, ties: 0 });
    if (resultTotals.wins + resultTotals.losses + resultTotals.ties !== model.appearances.length) {
      issues.push(issue("error", "result-count", "Conteo de resultados inconsistente", `${resultTotals.wins} wins + ${resultTotals.losses} losses + ${resultTotals.ties} empates para ${model.appearances.length} apariciones.`));
    }

    const tableKeys = new Map();
    const tableIds = new Map();
    tables.forEach((table, tableIndex) => {
      const tableId = table.id || `table-${tableIndex + 1}`;
      const tableTitle = table.title || "Partida sin título";
      const tableLocation = { tableId, tableIndex, tableTitle };
      const tableKey = [derived.identityText(table.title), table.date || "", normalizedUrl(table.videoUrl)].join("|");
      if (tableKey !== "||") tableKeys.set(tableKey, [...(tableKeys.get(tableKey) || []), tableId]);
      if (table.id) tableIds.set(table.id, [...(tableIds.get(table.id) || []), tableIndex]);
      if (!table.date) issues.push(issue("warning", "missing-date", "Mesa sin fecha", tableTitle, tableLocation));
      if (!table.videoUrl) {
        issues.push(issue("warning", "missing-youtube", "Mesa sin YouTube", tableTitle, tableLocation));
      } else if (!validHttpUrl(table.videoUrl)) {
        issues.push(issue("error", "invalid-youtube-url", "URL de YouTube mal formada", table.videoUrl, tableLocation));
      } else if (!hostMatches(table.videoUrl, ["youtube.com", "youtu.be"])) {
        issues.push(issue("warning", "unexpected-video-host", "El enlace de video no es de YouTube", table.videoUrl, tableLocation));
      }

      (table.participants || []).forEach((participant, participantIndex) => {
        const location = { ...tableLocation, participantIndex, playerName: participant.name || "Jugador sin nombre" };
        const commanderKey = derived.canonicalCommanderKey(participant);
        if (!commanderKey) issues.push(issue("error", "missing-commander", "Participante sin comandante", `${tableTitle}: ${location.playerName}`, location));
        if (!participant.moxfield) {
          issues.push(issue("info", "empty-moxfield", "Moxfield vacío", `${tableTitle}: ${location.playerName}`, location));
        } else if (!validHttpUrl(participant.moxfield)) {
          issues.push(issue("warning", "invalid-moxfield-url", "URL de Moxfield mal formada", participant.moxfield, location));
        } else if (!hostMatches(participant.moxfield, ["moxfield.com"])) {
          issues.push(issue("warning", "unexpected-moxfield-host", "El enlace de deck no es de Moxfield", participant.moxfield, location));
        }
        const commanders = derived.commanderParts(participant);
        if (commanders.length && commanders.some((commander) => !commander.cardImage && !commander.cardUrl)) {
          issues.push(issue("warning", "missing-commander-metadata", "Comandante sin metadata", `${tableTitle}: ${derived.commanderDisplay(participant)}`, location));
        }
        [participant.cardImage, participant.cardUrl].filter(Boolean).forEach((url) => {
          if (!validHttpUrl(url)) issues.push(issue("warning", "invalid-card-url", "URL de carta mal formada", url, location));
        });
      });
      const declaredWinners = table.resultMode === "tie" ? [] : [...new Set([...(table.winnerIds || []), table.winnerId].filter(Boolean))];
      const participantIds = new Set((table.participants || []).map((participant) => participant.id).filter(Boolean));
      declaredWinners.filter((winnerId) => !participantIds.has(winnerId)).forEach((winnerId) => {
        issues.push(issue("error", "unknown-winner", "Ganador fuera de participantes", `${tableTitle}: ${winnerId}`, tableLocation));
      });
    });

    tableKeys.forEach((ids) => {
      if (ids.length > 1) issues.push(issue("warning", "possible-table-duplicate", "Posible mesa duplicada", ids.join(", ")));
    });
    tableIds.forEach((indexes, id) => {
      if (indexes.length > 1) issues.push(issue("error", "duplicate-table-id", "ID de mesa duplicado", `${id}: posiciones ${indexes.join(", ")}`));
    });

    const playerNames = new Map();
    const handles = new Map();
    const linkedPlayers = derived.linkedPlayerDirectory(data);
    const directory = derived.playerDirectory(data);
    playerNameRecords(data).forEach((player, key) => {
      const linked = linkedPlayers.get(key);
      if (linked && derived.exactPlayerName(linked.name) !== key) return;
      if (!player.handles.size && !derived.resolvePlayerIdentity(player.name, data, directory).handle) {
        issues.push(issue("info", "missing-player-handle", "Jugador sin username", player.name, { playerNames: [player.name] }));
      }
      const nameKey = derived.identityText(derived.legacyCanonicalPlayerName(player.name));
      if (nameKey) playerNames.set(nameKey, [...(playerNames.get(nameKey) || []), player.name]);
      player.handles.forEach((handle) => {
        const handleKey = handle.toLowerCase().replace(/^@/, "");
        handles.set(handleKey, [...new Set([...(handles.get(handleKey) || []), player.name])]);
      });
    });
    (data.players || []).filter((player) => !player.mergedInto).forEach((player, index, players) => {
      if (players.findIndex((item) => derived.exactPlayerName(item.name) === derived.exactPlayerName(player.name)) < index) {
        issues.push(issue("warning", "possible-player-duplicate", "El mismo nombre figura en varios perfiles", player.name));
      }
    });
    playerNames.forEach((names) => {
      if (names.length > 1) issues.push(issue("warning", "possible-player-duplicate", "Posibles jugadores duplicados", names.join(" / "), { playerNames: names }));
    });
    handles.forEach((names) => {
      if (names.length > 1) issues.push(issue("warning", "shared-handle", "Handle compartido", names.join(" / "), { playerNames: names }));
    });

    const commanderVariants = new Map();
    model.appearances.forEach((appearance) => {
      if (!appearance.canonicalCommanderKey) return;
      const current = commanderVariants.get(appearance.canonicalCommanderKey) || { displays: new Set(), orders: new Set() };
      current.displays.add(appearance.commanderDisplay);
      current.orders.add(appearance.commanders.map((commander) => derived.identityText(commander.name)).join("::"));
      commanderVariants.set(appearance.canonicalCommanderKey, current);
    });
    commanderVariants.forEach((variants) => {
      if (variants.displays.size > 1) {
        issues.push(issue("info", "commander-name-variants", "Variantes del mismo comandante", [...variants.displays].join(" / ")));
      }
      if (variants.orders.size > 1) {
        issues.push(issue("info", "inverted-partners", "Partners en orden distinto", [...variants.displays].join(" / ")));
      }
    });

    const severityOrder = { error: 0, warning: 1, info: 2 };
    issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.title.localeCompare(b.title) || a.detail.localeCompare(b.detail));
    const counts = issues.reduce((totals, item) => {
      totals[item.severity] += 1;
      return totals;
    }, { error: 0, warning: 0, info: 0 });
    return { counts, issues, healthy: counts.error === 0, checkedAt: new Date().toISOString() };
  }

  return { validHttpUrl, normalizedUrl, hostMatches, auditData, playerNameRecords, linkPlayerIdentity };
});
