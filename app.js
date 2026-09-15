(function () {
  let data = window.MALEDucadosData;
  let derivedDataCache = {};
  let lastPlayerTrigger = null;
  let lastCommanderTrigger = null;
  let lastMatchTrigger = null;
  const scryfallImageCache = new Map();
  const state = {
    query: "",
    role: "all",
    color: "all",
    sort: "score",
    commanderQuery: "",
    commanderColors: [],
    commanderColorMode: "exact",
    commanderSort: "date",
    matchQuery: "",
    matchSort: "date-desc",
    sortDirection: "desc",
    rankingPage: 1,
    commanderPage: 1,
    matchPage: 1
  };

  const pageSize = 5;
  const commanderPageSize = 12;
  const matchPageSize = 8;

  const colorNames = {
    W: "Blanco",
    U: "Azul",
    B: "Negro",
    R: "Rojo",
    G: "Verde"
  };

  const colorOrder = ["W", "U", "B", "R", "G"];
  const colorOptions = [
    ["all", "Todos"],
    ["W", "Mono White"],
    ["U", "Mono Blue"],
    ["B", "Mono Black"],
    ["R", "Mono Red"],
    ["G", "Mono Green"],
    ["WU", "Azorius"],
    ["UB", "Dimir"],
    ["BR", "Rakdos"],
    ["RG", "Gruul"],
    ["WG", "Selesnya"],
    ["WB", "Orzhov"],
    ["UR", "Izzet"],
    ["BG", "Golgari"],
    ["WR", "Boros"],
    ["UG", "Simic"],
    ["WUB", "Esper"],
    ["UBR", "Grixis"],
    ["BRG", "Jund"],
    ["WRG", "Naya"],
    ["WUG", "Bant"],
    ["WBG", "Abzan"],
    ["URG", "Temur"],
    ["WUR", "Jeskai"],
    ["WBR", "Mardu"],
    ["UBG", "Sultai"],
    ["WUBR", "Yore-Tiller"],
    ["UBRG", "Glint-Eye"],
    ["WBRG", "Dune-Brood"],
    ["WURG", "Ink-Treader"],
    ["WUBG", "Witch-Maw"],
    ["WUBRG", "Five Color"]
  ];
  const colorOptionLabels = Object.fromEntries(colorOptions);

  const elements = {
    seasonLabel: document.querySelector("#seasonLabel"),
    latestTableTitle: document.querySelector("#latestTableTitle"),
    latestTableMeta: document.querySelector("#latestTableMeta"),
    latestTableWinner: document.querySelector("#latestTableWinner"),
    latestTableDeck: document.querySelector("#latestTableDeck"),
    latestTableDeckColors: document.querySelector("#latestTableDeckColors"),
    latestTableVideo: document.querySelector("#latestTableVideo"),
    totalGames: document.querySelector("#totalGames"),
    uniquePlayerCount: document.querySelector("#uniquePlayerCount"),
    uniqueCommanderCount: document.querySelector("#uniqueCommanderCount"),
    hostGuestScore: document.querySelector("#hostGuestScore"),
    hostGuestRate: document.querySelector("#hostGuestRate"),
    topCommanderMetric: document.querySelector("#topCommanderMetric"),
    topCommanderName: document.querySelector("#topCommanderName"),
    topCommanderMeta: document.querySelector("#topCommanderMeta"),
    leaderPlayerMetric: document.querySelector("#leaderPlayerMetric"),
    leaderPlayerName: document.querySelector("#leaderPlayerName"),
    leaderPlayerMeta: document.querySelector("#leaderPlayerMeta"),
    globalSearch: document.querySelector("#globalSearchInput"),
    globalResults: document.querySelector("#globalSearchResults"),
    socialLinks: document.querySelector("#socialLinks"),
    guildPlayedStats: document.querySelector("#guildPlayedStats"),
    guildWinStats: document.querySelector("#guildWinStats"),
    guildRateStats: document.querySelector("#guildRateStats"),
    rows: document.querySelector("#leaderboardRows"),
    rankingPagination: document.querySelector("#rankingPagination"),
    matchCount: document.querySelector("#matchCount"),
    matchGrid: document.querySelector("#matchGrid"),
    matchPagination: document.querySelector("#matchPagination"),
    matchSearch: document.querySelector("#matchSearchInput"),
    matchSort: document.querySelector("#matchSortSelect"),
    commanderGrid: document.querySelector("#commanderGrid"),
    commanderPagination: document.querySelector("#commanderPagination"),
    commanderSearch: document.querySelector("#commanderSearchInput"),
    commanderColorMode: document.querySelector("#commanderColorMode"),
    commanderSort: document.querySelector("#commanderSortSelect"),
    search: document.querySelector("#searchInput"),
    role: document.querySelector("#roleFilter"),
    color: document.querySelector("#colorFilter"),
    dialog: document.querySelector("#playerDialog"),
    dialogContent: document.querySelector("#dialogContent"),
    closeDialog: document.querySelector("#closeDialog"),
    guildDialog: document.querySelector("#guildDialog"),
    guildDialogContent: document.querySelector("#guildDialogContent"),
    closeGuildDialog: document.querySelector("#closeGuildDialog"),
    commanderDialog: document.querySelector("#commanderDialog"),
    commanderDialogContent: document.querySelector("#commanderDialogContent"),
    closeCommanderDialog: document.querySelector("#closeCommanderDialog"),
    matchDialog: document.querySelector("#matchDialog"),
    matchDialogContent: document.querySelector("#matchDialogContent"),
    closeMatchDialog: document.querySelector("#closeMatchDialog"),
    cardPreview: document.querySelector("#cardPreview"),
    playerPreview: document.querySelector("#playerPreview")
  };

  function updateActiveNav() {
    const routeAliases = { "#leaderboard": "inicio", "#registro": "jugadores", "#decks": "comandantes", "#estadisticas": "inicio" };
    const hash = window.location.hash || "#inicio";
    const route = routeAliases[hash] || hash.slice(1);
    const activeView = ["inicio", "jugadores", "comandantes", "partidas", "admin"].includes(route) ? route : "inicio";
    document.querySelectorAll("[data-view]").forEach((section) => {
      section.hidden = section.dataset.view !== activeView;
    });
    document.querySelectorAll(".rail-link").forEach((link) => {
      const isActive = link.getAttribute("href") === `#${activeView}`;
      link.classList.toggle("is-active", isActive);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    const adminLink = document.querySelector(".admin-access");
    adminLink?.classList.toggle("is-active", activeView === "admin");
    if (activeView === "admin") adminLink?.setAttribute("aria-current", "page");
    else adminLink?.removeAttribute("aria-current");
    document.title = `${activeView === "inicio" ? "Inicio" : activeView === "jugadores" ? "Jugadores" : activeView === "comandantes" ? "Comandantes" : activeView === "partidas" ? "Partidas" : "Editor"} | Los Maleducados del Magic`;
    window.scrollTo(0, 0);
  }

  function initials(name) {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join("");
  }

  function commanderInitials(name = "") {
    const firstWord = name.trim().split(/[\s,/]+/).filter(Boolean)[0] || "C";
    return firstWord.slice(0, 2).toUpperCase();
  }

  function games(player) {
    return player.wins + player.losses;
  }

  function winRate(player) {
    const total = games(player);
    return total === 0 ? 0 : Math.round((player.wins / total) * 100);
  }

  function normalizeColors(colors) {
    return colorOrder.filter((color) => colors.includes(color)).join("");
  }

  function realColorIdentity(colors = []) {
    return colorOrder.filter((color) => colors.includes(color));
  }

  function slugify(value) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function escapeAttribute(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function deckWinRate(deck) {
    const total = deck.wins + deck.losses;
    return total === 0 ? 0 : Math.round((deck.wins / total) * 100);
  }

  function derivedModel() {
    if (derivedDataCache.model) return derivedDataCache.model;
    derivedDataCache.model = window.MaleducadosDerivedData?.buildDerivedData(data) || {
      appearances: [],
      matches: [],
      commanderGroups: [],
      playerProfiles: []
    };
    return derivedDataCache.model;
  }

  function commanderGroups() {
    return derivedModel().commanderGroups;
  }

  function recordedMatches() {
    return derivedModel().matches;
  }

  function safeExternalUrl(value = "") {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function splitCommanderNames(commander = "") {
    const protectedNames = new Map([
      ["Minsc & Boo, Timeless Heroes", "Minsc __AMP__ Boo, Timeless Heroes"]
    ]);
    let value = String(commander);
    protectedNames.forEach((replacement, name) => {
      value = value.replaceAll(name, replacement);
    });

    return value
      .replace(/\s*\/\/\s*/g, " + ")
      .split(/\s+\+\s+|\s+&\s+/)
      .map((name) => name.trim())
      .map((name) => name.replace(/__AMP__/g, "&").replace(/[\u200d\uFE0E\uFE0F]/g, "").trim())
      .filter(Boolean);
  }

  function normalizeCommanderDisplay(commander = "") {
    const names = splitCommanderNames(commander);
    return names.length > 1 ? names.join(" & ") : commander.trim();
  }

  function commanderParts(source = {}) {
    const explicitParts = Array.isArray(source.commanders)
      ? source.commanders
          .map((commander) => ({
            name: normalizeCommanderDisplay(commander.name || commander.commander || ""),
            colors: commander.colors || [],
            cardImage: commander.cardImage || commander.image || "",
            cardUrl: commander.cardUrl || commander.url || ""
          }))
          .filter((commander) => commander.name)
      : [];

    if (explicitParts.length) return explicitParts;

    const names = splitCommanderNames(source.commander || "");
    return (names.length ? names : [source.commander || "Commander"])
      .map((name, index) => ({
        name,
        colors: index === 0 ? source.colors || [] : [],
        cardImage: index === 0 ? source.cardImage || "" : "",
        cardUrl: index === 0 ? source.cardUrl || "" : ""
      }))
      .filter((commander) => commander.name);
  }

  function commanderDisplay(source = {}) {
    return commanderParts(source).map((commander) => commander.name).join(" & ");
  }

  function commanderColorIdentity(source = {}) {
    return realColorIdentity([
      ...(source.colors || []),
      ...commanderParts(source).flatMap((commander) => commander.colors || []),
      ...knownCommanderColors(commanderDisplay(source))
    ]);
  }

  function deckColorIdentity(deck = {}) {
    return realColorIdentity([
      ...(deck.colors || []),
      ...commanderParts(deck).flatMap((commander) => commander.colors || []),
      ...knownCommanderColors(commanderDisplay(deck))
    ]);
  }

  function guildKeyForDeck(deck = {}) {
    return normalizeColors(deckColorIdentity(deck)) || "C";
  }

  function knownCommanderColors(commander = "") {
    const hints = {
      "pako, arcane retriever": ["R", "G"],
      "haldan, avid arcanist": ["U", "G"],
      "rograkh, son of rohgahh": ["R"],
      "silas renn, seeker adept": ["U", "B"],
      "thrasios, triton hero": ["U", "G"],
      "malcolm, keen-eyed navigator": ["U"],
      "vial smasher the fierce": ["B", "R"],
      "kydele, chosen of kruphix": ["U", "G"],
      "tymna the weaver": ["W", "B"],
      "kraum, ludevic's opus": ["U", "R"],
      "burakos, party leader": ["B"],
      "folk hero": ["W"]
    };

    return splitCommanderNames(commander).reduce((colors, name) => {
      (hints[name.toLowerCase()] || []).forEach((color) => {
        if (!colors.includes(color)) colors.push(color);
      });
      return colors;
    }, []);
  }

  function normalizedCommanderColors(commander = "", colors = []) {
    return colorOrder.filter((color) => [...(colors || []), ...knownCommanderColors(commander)].includes(color));
  }

  function compareRecentDate(left = "", right = "") {
    if (!left && !right) return 0;
    if (!left) return 1;
    if (!right) return -1;
    return right.localeCompare(left);
  }

  function currentSeasonLabel(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
      month: "numeric",
      year: "numeric",
      timeZone: "America/Mexico_City"
    }).formatToParts(date);
    const month = Number(parts.find((part) => part.type === "month")?.value || 1);
    const year = parts.find((part) => part.type === "year")?.value || date.getFullYear();
    return `Temporada ${Math.floor((month - 1) / 3) + 1} · ${year}`;
  }

  function shortColorLabel(colors) {
    return normalizeColors(colors) || "C";
  }

  function rateColor(rate) {
    const hue = Math.round((rate / 100) * 138);
    return `hsl(${hue}, 72%, 64%)`;
  }

  function progressColor(rate) {
    const clamped = Math.min(100, Math.max(0, rate));
    const hue = Math.round((clamped / 100) * 138);
    return `hsl(${hue}, 78%, 64%)`;
  }

  function clampPage(page, totalItems, size = pageSize) {
    const totalPages = Math.max(1, Math.ceil(totalItems / size));
    return Math.min(Math.max(1, page), totalPages);
  }

  function pageItems(items, page, size = pageSize) {
    const currentPage = clampPage(page, items.length, size);
    const start = (currentPage - 1) * size;
    return {
      currentPage,
      start,
      totalPages: Math.max(1, Math.ceil(items.length / size)),
      items: items.slice(start, start + size)
    };
  }

  function compactPages(currentPage, totalPages) {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const visible = new Set([1, totalPages, currentPage]);

    if (currentPage <= 3) {
      [2, 3, 4].forEach((page) => visible.add(page));
    } else if (currentPage >= totalPages - 2) {
      [totalPages - 3, totalPages - 2, totalPages - 1].forEach((page) => visible.add(page));
    } else {
      [currentPage - 1, currentPage + 1].forEach((page) => visible.add(page));
    }

    const pages = [...visible]
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((a, b) => a - b);

    return pages.reduce((items, page, index) => {
      if (index && page - pages[index - 1] > 1) items.push("ellipsis");
      items.push(page);
      return items;
    }, []);
  }

  function renderPagination(container, target, totalItems, currentPage, size = pageSize) {
    if (!container) return;
    const totalPages = Math.ceil(totalItems / size);

    if (totalPages <= 1) {
      container.innerHTML = "";
      return;
    }

    const pages = compactPages(currentPage, totalPages);
    container.innerHTML = `
      <button type="button" data-page-target="${target}" data-page="${Math.max(1, currentPage - 1)}" ${currentPage === 1 ? "disabled" : ""}>← Prev</button>
      <span>${pages.map((page) => `
        ${page === "ellipsis"
          ? '<i aria-hidden="true">...</i>'
          : `<button class="${page === currentPage ? "is-active" : ""}" type="button" data-page-target="${target}" data-page="${page}" aria-label="Página ${page}">${page}</button>`}
      `).join("")}</span>
      <button type="button" data-page-target="${target}" data-page="${Math.min(totalPages, currentPage + 1)}" ${currentPage === totalPages ? "disabled" : ""}>Next →</button>
    `;
  }

  function commanderLink(deck) {
    const parts = commanderParts(deck);
    const links = parts.map((part) => {
      const href = part.cardUrl || `https://scryfall.com/search?as=grid&order=name&q=!%22${encodeURIComponent(part.name || "Commander")}%22`;
      return `<a class="commander-link" href="${href}" target="_blank" rel="noreferrer" data-card-image="${escapeAttribute(part.cardImage)}" data-card-url="${escapeAttribute(part.cardUrl)}" data-card-name="${escapeAttribute(part.name)}" title="Ver carta en Scryfall">${escapeAttribute(part.name)}</a>`;
    }).join('<span class="partner-plus" aria-hidden="true">+</span>');
    return `<span class="commander-stack ${parts.length > 1 ? "is-partner" : ""}">${links}${parts.length > 1 ? '<span class="partner-chip">Partner</span>' : ""}</span>`;
  }

  function deckCommanderLink(deck) {
    const parts = commanderParts(deck);
    const links = parts.map((part) => {
      const href = part.cardUrl || deck.moxfield || "#";
      return `<a class="commander-link" href="${href}" target="_blank" rel="noreferrer" data-card-image="${escapeAttribute(part.cardImage)}" data-card-url="${escapeAttribute(part.cardUrl)}" data-card-name="${escapeAttribute(part.name)}" title="Abrir carta o lista">${escapeAttribute(part.name)}</a>`;
    }).join('<span class="partner-plus" aria-hidden="true">+</span>');
    return `<span class="commander-stack ${parts.length > 1 ? "is-partner" : ""}">${links}${parts.length > 1 ? '<span class="partner-chip">Partner</span>' : ""}</span>`;
  }

  function imageFromScryfallPayload(payload) {
    if (payload.image_uris?.large) return payload.image_uris.large;
    if (payload.image_uris?.normal) return payload.image_uris.normal;

    const face = payload.card_faces?.find((cardFace) => cardFace.image_uris?.large || cardFace.image_uris?.normal);
    return face?.image_uris?.large || face?.image_uris?.normal || "";
  }

  async function getScryfallCard(cardName) {
    if (!cardName) return { image: "", url: "" };
    if (scryfallImageCache.has(cardName)) return scryfallImageCache.get(cardName);
    const request = (async () => {
      try {
        const url = new URL("https://api.scryfall.com/cards/named");
        url.searchParams.set("exact", cardName);
        let response = await fetch(url);
        if (!response.ok) {
          url.searchParams.delete("exact");
          url.searchParams.set("fuzzy", cardName);
          response = await fetch(url);
        }
        if (!response.ok) return { image: "", url: "" };
        const payload = await response.json();
        return { image: imageFromScryfallPayload(payload), url: payload.scryfall_uri || "" };
      } catch (error) {
        console.warn(`No se pudo consultar Scryfall para ${cardName}.`, error);
        return { image: "", url: "" };
      }
    })();
    scryfallImageCache.set(cardName, request);
    const card = await request;
    scryfallImageCache.set(cardName, card);
    return card;
  }

  function findDeckByCommander(commander) {
    const normalized = normalizeCommanderDisplay(commander || "").toLowerCase();
    if (!normalized) return null;

    return recordedDecks().find((deck) => commanderDisplay(deck).toLowerCase() === normalized) ||
      data.players
        .flatMap((player) => player.decks)
        .find((deck) => commanderDisplay(deck).toLowerCase() === normalized);
  }

  function canonicalPlayerName(name = "") {
    const normalized = name.trim().toLowerCase();
    if (["horacio radillo", "horacio r", "horacio r."].includes(normalized)) return "Horacio R.";
    if (["alan villegas", "alan v", "alan v."].includes(normalized)) return "Alan V.";
    return name.trim();
  }

  function canonicalPlayerKey(name = "") {
    return canonicalPlayerName(name).toLowerCase();
  }

  function playerRoleByName(playerName) {
    const canonicalName = canonicalPlayerName(playerName);
    if (canonicalName === "Horacio R." || canonicalName === "Alan V.") return "Host";
    const player = data.players.find((item) => canonicalPlayerName(item.name).toLowerCase() === canonicalName.toLowerCase());
    return player?.role || "Invitado";
  }

  function isTieTable(table = {}) {
    return table.resultMode === "tie" || table.isTie === true;
  }

  function tableWinnerIds(table = {}) {
    if (isTieTable(table)) return [];
    const ids = Array.isArray(table.winnerIds) ? table.winnerIds : [table.winnerId];
    return [...new Set(ids.filter(Boolean))];
  }

  function tableWinners(table = {}) {
    const winnerIds = tableWinnerIds(table);
    return (table.participants || []).filter((participant) => winnerIds.includes(participant.id));
  }

  function tableWinnerSummary(table = {}) {
    if (isTieTable(table)) return "Empate";
    const names = tableWinners(table).map((participant) => participant.name).filter(Boolean);
    if (!names.length) return "Sin ganador";
    return names.join(" y ");
  }

  function todayKey() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  }

  function dateKey(value = "") {
    const match = String(value).match(/\d{4}-\d{2}-\d{2}/);
    return match?.[0] || "";
  }

  function latestRecordedTable() {
    const tableRows = (data.tables || []).filter((table) => dateKey(table.date));
    if (!tableRows.length) return null;
    const today = todayKey();
    const playableTables = tableRows.filter((table) => dateKey(table.date) <= today);
    const candidates = playableTables.length ? playableTables : tableRows;
    return [...candidates].sort((a, b) => compareRecentDate(dateKey(a.date), dateKey(b.date)))[0] || null;
  }

  function tablePayload(table) {
    if (!table) return null;
    const winners = tableWinners(table);
    const primaryWinner = winners[0];

    return {
      title: table.title || "Última mesa",
      date: table.date || "Último estreno",
      winner: tableWinnerSummary(table),
      winners: winners.map((winner) => ({
        id: slugify(canonicalPlayerName(winner.name || "jugador")),
        name: canonicalPlayerName(winner.name || "")
      })),
      deck: primaryWinner ? commanderDisplay(primaryWinner) : "",
      videoUrl: table.videoUrl || data.socials[0].url,
      colors: primaryWinner ? commanderColorIdentity(primaryWinner) : [],
      commanders: primaryWinner ? commanderParts(primaryWinner) : [],
      cardImage: primaryWinner?.cardImage || "",
      cardUrl: primaryWinner?.cardUrl || ""
    };
  }

  function latestTablePayload() {
    const recordedPayload = tablePayload(latestRecordedTable());
    const manualPayload = data.latestTable || {};
    const manualDate = dateKey(manualPayload.date);
    const recordedDate = dateKey(recordedPayload?.date);

    if (!recordedPayload) return manualPayload;
    if (manualPayload.manualOverride && (!manualDate || !recordedDate || manualDate >= recordedDate)) {
      return manualPayload;
    }
    if (!manualPayload.manualOverride && manualDate && manualDate > recordedDate) {
      return manualPayload;
    }
    return recordedPayload;
  }

  function recordedDecks() {
    if (derivedDataCache.decks) return derivedDataCache.decks;

    const tableRows = data.tables || [];
    const decks = new Map();

    tableRows.forEach((table) => {
      (table.participants || []).forEach((participant) => {
        const commanders = commanderParts(participant);
        const commander = commanderDisplay(participant);
        const colors = normalizedCommanderColors(commander, commanderColorIdentity(participant));
        const key = [
          canonicalPlayerKey(participant.name || ""),
          commander.toLowerCase(),
          participant.moxfield || ""
        ].join("|");

        if (!participant.name || !participant.commander) return;

        const current = decks.get(key) || {
          commander,
          commanders,
          archetype: participant.archetype || "Commander",
          colors,
          wins: 0,
          losses: 0,
          moxfield: participant.moxfield || "https://moxfield.com/users/LosMaleducadosDelMagic",
          videoUrl: table.videoUrl || data.socials[0].url,
          tableTitle: table.title || "",
          tableDate: table.date || "",
          lastPlayedAt: table.date || "",
          cardImage: participant.cardImage || "",
          cardUrl: participant.cardUrl || "",
          player: canonicalPlayerName(participant.name),
          playerId: slugify(canonicalPlayerName(participant.name || "jugador")),
          role: playerRoleByName(participant.name),
          tables: new Set()
        };

        const winnerIds = tableWinnerIds(table);
        if (isTieTable(table)) {
          current.wins += 0;
          current.losses += 0;
        } else if (winnerIds.includes(participant.id)) {
          current.wins += 1;
        } else {
          current.losses += 1;
        }

        if (!current.lastPlayedAt || compareRecentDate(table.date || "", current.lastPlayedAt) < 0) {
          current.videoUrl = table.videoUrl || current.videoUrl;
          current.tableTitle = table.title || current.tableTitle;
          current.tableDate = table.date || current.tableDate;
          current.lastPlayedAt = table.date || current.lastPlayedAt;
        }
        current.commander = commander || current.commander;
        current.commanders = commanders.length ? commanders : current.commanders;
        current.colors = colors.length ? colors : current.colors;
        current.cardImage = participant.cardImage || current.cardImage;
        current.cardUrl = participant.cardUrl || current.cardUrl;
        current.tables.add(table.id || table.title);
        decks.set(key, current);
      });
    });

    derivedDataCache.decks = [...decks.values()].map((deck) => ({
      ...deck,
      appearances: deck.tables.size,
      tables: [...deck.tables]
    }));
    return derivedDataCache.decks;
  }

  function recordedPlayers() {
    return derivedModel().playerProfiles;
  }

  function recordedPlayer(playerId) {
    return recordedPlayers().find((player) => player.id === playerId);
  }

  function playerNameButton(player, className = "") {
    if (!player?.id || !player?.name) return escapeAttribute(player?.name || "-");
    return `<button class="person-button player-name-trigger ${className}" type="button" data-player-id="${escapeAttribute(player.id)}" data-player-preview aria-label="Ver perfil de ${escapeAttribute(player.name)}">${escapeAttribute(player.name)}</button>`;
  }

  function playerNamesList(players = []) {
    return players.map((player) => playerNameButton(player)).join('<span class="player-name-separator"> y </span>');
  }

  function leaderboardCompare(a, b) {
    return winRate(b) - winRate(a) ||
      b.appearancesCount - a.appearancesCount ||
      compareRecentDate(a.lastPlayedAt, b.lastPlayedAt) ||
      b.wins - a.wins ||
      a.name.localeCompare(b.name);
  }

  function matchingCommanders(player) {
    const query = state.query;

    return player.commanders.filter((commander) => {
      const matchesQuery =
        !query ||
        playerSearchText(player).includes(query) ||
        window.MaleducadosDerivedData.identityText(commander.commanderDisplay).includes(query);
      const matchesColor = state.color === "all" || normalizeColors(commander.colors) === state.color;

      return matchesQuery && matchesColor;
    });
  }

  function manaPips(colors) {
    return `<span class="mana-row">${colors
      .map((color) => `<span class="mana ${color}" title="${colorNames[color]}">${color}</span>`)
      .join("")}</span>`;
  }

  function manaIdentity(source) {
    if (source.colors?.length) return manaPips(source.colors);
    if (source.colorIdentityKnown) return '<span class="mana-row"><span class="mana">C</span></span>';
    return '<span class="mana-row"><span class="mana unknown" title="Identidad pendiente">?</span></span>';
  }

  function guildName(guildKey) {
    if (guildKey === "?") return "Identidad pendiente";
    return colorOptionLabels[guildKey] || colorNames[guildKey] || "Colorless";
  }

  function guildStats() {
    const stats = new Map();

    recordedDecks().forEach((deck) => {
      const guildKey = guildKeyForDeck(deck);
      const current = stats.get(guildKey) || {
        key: guildKey,
        played: 0,
        wins: 0,
        losses: 0,
        decks: 0
      };

      current.played += (Number(deck.wins) || 0) + (Number(deck.losses) || 0);
      current.wins += Number(deck.wins) || 0;
      current.losses += Number(deck.losses) || 0;
      current.decks += 1;
      stats.set(guildKey, current);
    });

    return [...stats.values()].map((stat) => ({
      ...stat,
      winRate: stat.played ? Math.round((stat.wins / stat.played) * 100) : 0
    }));
  }

  function guildRankClass(index) {
    return index < 3 ? `rank-${index + 1}` : "";
  }

  function renderGuildStatList(items, metric, label) {
    const filteredItems = items.filter((item) => metric === "rate" ? item.decidedGames > 0 : item[metric] > 0);
    const visibleItems = filteredItems.slice(0, 3);
    const max = Math.max(...filteredItems.map((item) => metric === "rate" ? item.winRate : item[metric]), 1);

    if (!visibleItems.length) {
      return '<p class="empty-state">Todavía no hay datos suficientes.</p>';
    }

    const pageOffset = 0;
    return visibleItems
      .map((item, index) => {
        const value = metric === "rate" ? item.winRate : item[metric];
        const width = metric === "rate" ? item.winRate : Math.round((value / max) * 100);
        return `
          <article class="guild-stat-card ${guildRankClass(pageOffset + index)}">
            <div class="guild-rank ${guildRankClass(pageOffset + index)}">${pageOffset + index + 1}</div>
            <div class="guild-stat-body">
              <div class="guild-stat-topline">
                <div>
                  <h4>${item.key === "?" ? `<span class="guild-link-static">${guildName(item.key)}</span>` : `<button class="guild-link" type="button" data-guild-key="${item.key}">${guildName(item.key)}</button>`}</h4>
                  <p>${item.key === "C" ? "Sin color" : item.key === "?" ? "Falta metadata" : item.key} | ${item.appearances} apariciones · ${item.wins}-${item.losses} · ${item.ties} empates</p>
                </div>
                <strong>${metric === "rate" ? `${value}%` : value}</strong>
              </div>
              ${item.key === "C" ? '<span class="mana-row"><span class="mana">C</span></span>' : item.key === "?" ? '<span class="mana-row"><span class="mana unknown">?</span></span>' : manaPips(item.key.split(""))}
              <div class="guild-bar" aria-label="${guildName(item.key)} ${label}: ${value}${metric === "rate" ? "%" : ""}">
                <span style="width: ${width}%; background: ${progressColor(width)}"></span>
              </div>
              ${metric === "rate" ? `<small class="meta-sample">${item.decidedGames} resultados decididos</small>` : ""}
            </div>
          </article>
        `;
      })
      .join("");
  }

  function playerSearchText(player) {
    return window.MaleducadosDerivedData.identityText([
      player.name,
      player.handle,
      ...(player.aliases || []),
      ...player.commanders.map((commander) => commander.commanderDisplay)
    ].join(" "));
  }

  function rankedPlayers(players = data.players) {
    return [...players].sort((a, b) => {
      const sorters = {
        score: leaderboardCompare(a, b),
        player: a.name.localeCompare(b.name),
        wins: b.wins - a.wins || leaderboardCompare(a, b),
        losses: b.losses - a.losses || leaderboardCompare(a, b),
        winrate: leaderboardCompare(a, b),
        appearances: b.appearances - a.appearances || leaderboardCompare(a, b),
        commanders: b.commanderCount - a.commanderCount || leaderboardCompare(a, b)
      };

      const result = sorters[state.sort] || sorters.score;
      return state.sortDirection === "asc" ? -result : result;
    });
  }

  function filteredPlayers() {
    return recordedPlayers().filter((player) => {
      const matchesQuery = playerSearchText(player).includes(state.query);
      const matchesRole = state.role === "all" || player.role === state.role;
      const matchesColor = state.color === "all" || matchingCommanders(player).length > 0;
      return matchesQuery && matchesRole && matchesColor;
    });
  }

  function filteredCommanderGroups() {
    return commanderGroups().filter((group) => {
      const searchText = [
        group.commanderDisplay,
        ...group.commanders.map((commander) => commander.name),
        ...group.distinctPlayers.map((player) => player.name),
        ...(group.archetypes || [])
      ].join(" ").toLowerCase();
      const matchesQuery = !state.commanderQuery || searchText.includes(state.commanderQuery);
      const groupColors = normalizeColors(group.colors || []);
      const selectedColors = state.commanderColors.join("");
      const matchesColor =
        !state.commanderColors.length ||
        (state.commanderColorMode === "exact" && groupColors === selectedColors) ||
        (state.commanderColorMode === "includes" && state.commanderColors.every((color) => groupColors.includes(color))) ||
        (state.commanderColorMode === "any" && state.commanderColors.some((color) => groupColors.includes(color)));

      return matchesQuery && matchesColor;
    });
  }

  function matchSearchText(match) {
    return window.MaleducadosDerivedData.identityText([
      match.title,
      ...match.appearances.flatMap((appearance) => [
        appearance.displayedPlayerName,
        appearance.playerName,
        appearance.commanderDisplay,
        ...appearance.commanders.map((commander) => commander.name)
      ])
    ].join(" "));
  }

  function filteredMatches() {
    return recordedMatches().filter((match) =>
      !state.matchQuery || matchSearchText(match).includes(state.matchQuery)
    );
  }

  function renderColorOptions() {
    elements.color.innerHTML = colorOptions
      .map(([value, label]) => {
        const suffix = value === "all" ? "" : ` (${value})`;
        return `<option value="${value}">${label}${suffix}</option>`;
      })
      .join("");
  }

  function renderMetrics() {
    const tableRows = data.tables || [];
    const players = recordedPlayers();
    const commanders = commanderGroups();
    const hostWins = players.filter((player) => player.role === "Host").reduce((total, player) => total + player.wins, 0);
    const guestWins = players.filter((player) => player.role !== "Host").reduce((total, player) => total + player.wins, 0);
    const rivalryTotal = hostWins + guestWins;
    const hostRate = rivalryTotal ? Math.round((hostWins / rivalryTotal) * 100) : 0;
    const guestRate = rivalryTotal ? 100 - hostRate : 0;
    const latestTable = latestTablePayload();
    const topCommander = [...commanders].sort((a, b) => b.appearancesCount - a.appearancesCount)[0];
    const leader = [...players].sort(leaderboardCompare)[0];
    const latestMatch = recordedMatches().find((match) => match.title === latestTable.title && match.date === latestTable.date);

    elements.seasonLabel.textContent = `${currentSeasonLabel()} | Actualizado ${data.lastUpdated}`;
    elements.latestTableTitle.textContent = latestTable.title || "Última mesa";
    elements.latestTableTitle.dataset.matchKey = latestMatch?.matchKey || "";
    elements.latestTableTitle.disabled = !latestMatch;
    elements.latestTableMeta.textContent = latestTable.date || "";
    elements.latestTableWinner.innerHTML = latestTable.winners?.length
      ? playerNamesList(latestTable.winners)
      : escapeAttribute(latestTable.winner || "-");
    const latestDeck = findDeckByCommander(latestTable.deck) || {
      commander: latestTable.deck || "-",
      commanders: latestTable.commanders || [],
      cardImage: latestTable.cardImage || "",
      cardUrl: latestTable.cardUrl || "",
      colors: latestTable.colors || []
    };
    elements.latestTableDeck.innerHTML = commanderLink(latestDeck);
    elements.latestTableDeckColors.innerHTML = latestDeck.colors?.length ? manaPips(latestDeck.colors) : "";
    elements.latestTableVideo.href = safeExternalUrl(latestTable.videoUrl) || data.socials?.[0]?.url || "#";
    elements.totalGames.textContent = tableRows.length;
    elements.uniquePlayerCount.textContent = players.length;
    elements.uniqueCommanderCount.textContent = commanders.length;
    elements.hostGuestScore.textContent = `${hostWins}-${guestWins}`;
    elements.hostGuestRate.textContent = `Hosts ${hostRate}% | Invitados ${guestRate}%`;
    elements.topCommanderName.textContent = topCommander?.commanderDisplay || "Sin registro";
    elements.topCommanderMeta.textContent = topCommander ? `${topCommander.appearancesCount} apariciones` : "";
    elements.topCommanderMetric.dataset.commanderKey = topCommander?.commanderGroupKey || "";
    elements.leaderPlayerName.textContent = leader?.name || "Sin registro";
    elements.leaderPlayerMeta.textContent = leader ? `${leader.wins} victorias · ${leader.appearancesCount} partidas` : "";
    elements.leaderPlayerMetric.dataset.playerId = leader?.id || "";

    elements.socialLinks.innerHTML = (data.socials || [])
      .filter((social) => safeExternalUrl(social.url))
      .map((social) => `<a href="${escapeAttribute(social.url)}" target="_blank" rel="noreferrer">${escapeAttribute(social.label)}</a>`)
      .join("");
  }

  function renderGuildStats() {
    const stats = derivedModel().colorStats || [];
    const byPlayed = [...stats].sort((a, b) => b.appearances - a.appearances || b.wins - a.wins || guildName(a.key).localeCompare(guildName(b.key)));
    const byWins = [...stats].sort((a, b) => b.wins - a.wins || b.appearances - a.appearances || guildName(a.key).localeCompare(guildName(b.key)));
    const byRate = [...stats].filter((item) => item.decidedGames > 0).sort((a, b) => b.winRate - a.winRate || b.decidedGames - a.decidedGames || guildName(a.key).localeCompare(guildName(b.key)));

    elements.guildPlayedStats.innerHTML = renderGuildStatList(byPlayed, "appearances", "apariciones");
    elements.guildWinStats.innerHTML = renderGuildStatList(byWins, "wins", "victorias");
    elements.guildRateStats.innerHTML = renderGuildStatList(byRate, "rate", "win rate");
  }

  function renderGlobalSearch() {
    const query = window.MaleducadosDerivedData?.identityText(elements.globalSearch.value) || elements.globalSearch.value.trim().toLowerCase();
    if (!query) {
      elements.globalResults.hidden = true;
      elements.globalResults.innerHTML = "";
      return;
    }

    const model = derivedModel();
    const players = model.playerProfiles.filter((player) => playerSearchText(player).includes(query)).slice(0, 5);
    const commanders = model.commanderGroups.filter((group) => window.MaleducadosDerivedData.identityText([
      group.commanderDisplay,
      ...group.commanders.map((commander) => commander.name),
      ...group.distinctPlayers.map((player) => player.name)
    ].join(" ")).includes(query)).slice(0, 5);
    const matches = model.matches.filter((match) => matchSearchText(match).includes(query)).slice(0, 5);
    const section = (title, items) => items.length ? `
      <section class="global-result-group">
        <h3>${title}</h3>
        ${items.join("")}
      </section>
    ` : "";

    elements.globalResults.innerHTML = [
      section("Jugadores", players.map((player) => `<button type="button" data-player-id="${escapeAttribute(player.id)}"><strong>${escapeAttribute(player.name)}</strong><span>${player.appearancesCount} partidas · ${player.wins} victorias</span></button>`)),
      section("Comandantes", commanders.map((group) => `<button type="button" data-commander-key="${escapeAttribute(group.commanderGroupKey)}"><strong>${escapeAttribute(group.commanderDisplay)}</strong><span>${group.appearancesCount} apariciones · ${group.distinctPlayerCount} pilotos</span></button>`)),
      section("Partidas", matches.map((match) => `<button type="button" data-match-key="${escapeAttribute(match.matchKey)}"><strong>${escapeAttribute(match.title || "Partida sin título")}</strong><span>${escapeAttribute(match.date || "Sin fecha")} · ${match.participantsCount} participantes</span></button>`))
    ].join("") || '<p class="empty-state">No encontramos jugadores, comandantes ni partidas.</p>';
    elements.globalResults.hidden = false;
  }

  function renderRows() {
    const filtered = filteredPlayers();
    const players = rankedPlayers(filtered);
    const leaderboardRanks = new Map(
      [...filtered]
        .sort(leaderboardCompare)
        .map((player, index) => [player.id, index + 1])
    );
    const page = pageItems(players, state.rankingPage);
    state.rankingPage = page.currentPage;

    if (!players.length) {
      elements.rows.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state">No hay resultados con esos filtros.</td>
        </tr>
      `;
      renderPagination(elements.rankingPagination, "ranking", 0, 1);
      return;
    }

    elements.rows.innerHTML = page.items
      .map((player, index) => {
        const rate = winRate(player);
        const color = rateColor(rate);
        const rank = leaderboardRanks.get(player.id) || page.start + index + 1;
        return `
          <tr class="rank-row ${guildRankClass(rank - 1)}">
            <td data-label="Rank"><span class="rank-pill">${rank}</span></td>
            <td>
              <div class="player-cell">
                <span class="avatar alt-${index % 3}">${initials(player.name)}</span>
                <span>
                  ${playerNameButton(player, "cell-title")}
                  <span class="cell-sub">${player.handle || "Sin tag"} | ${player.role}</span>
                </span>
              </div>
            </td>
            <td data-label="Partidas"><strong>${player.appearancesCount}</strong></td>
            <td data-label="Wins"><strong>${player.wins}</strong></td>
            <td data-label="Losses"><strong>${player.losses}</strong></td>
            <td data-label="Win rate">
              <strong>${rate}%</strong>
              <div class="rate-bar" aria-hidden="true"><span style="width: ${rate}%; background: ${color}"></span></div>
            </td>
            <td data-label="Comandantes">${player.commanderCount}</td>
          </tr>
        `;
      })
      .join("");
    renderPagination(elements.rankingPagination, "ranking", players.length, page.currentPage);
  }

  function matchResultLabel(match) {
    if (match.isTie) return "Empate";
    const winnerNames = match.winners.map((winner) => winner.displayedPlayerName).filter(Boolean);
    if (!winnerNames.length) return "Resultado pendiente";
    return winnerNames.length === 1 ? `Ganó ${winnerNames[0]}` : `Ganaron ${winnerNames.join(" y ")}`;
  }

  function matchResultClass(match) {
    if (match.isTie) return "result-tie";
    return match.winners.length ? "result-win" : "result-pending";
  }

  function matchLinkButton(match, className = "") {
    return `<button class="match-link ${className}" type="button" data-match-key="${escapeAttribute(match.matchKey)}">${escapeAttribute(match.title || "Partida sin título")}</button>`;
  }

  function commanderGroupButton(source, className = "") {
    const commanderKey = source.commanderGroupKey || source.canonicalCommanderKey;
    if (!commanderKey) return '<span class="metadata-missing">Sin comandante</span>';
    return `<button class="commander-inline-button ${className}" type="button" data-commander-key="${escapeAttribute(commanderKey)}">${escapeAttribute(source.commanderDisplay || "Comandante")}</button>`;
  }

  function renderMatchGrid() {
    const sorters = {
      "date-desc": (a, b) => (b.date || "").localeCompare(a.date || "") || b.tableIndex - a.tableIndex,
      "date-asc": (a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.tableIndex - b.tableIndex,
      title: (a, b) => (a.title || "").localeCompare(b.title || "") || (b.date || "").localeCompare(a.date || "")
    };
    const allMatches = recordedMatches();
    const matches = filteredMatches().sort(sorters[state.matchSort] || sorters["date-desc"]);
    const page = pageItems(matches, state.matchPage, matchPageSize);
    state.matchPage = page.currentPage;
    elements.matchCount.textContent = state.matchQuery
      ? `${matches.length} de ${allMatches.length} partidas`
      : `${allMatches.length} ${allMatches.length === 1 ? "partida" : "partidas"}`;

    if (!matches.length) {
      elements.matchGrid.innerHTML = '<p class="empty-state match-empty">No encontramos partidas con esa búsqueda.</p>';
      renderPagination(elements.matchPagination, "matches", 0, 1, matchPageSize);
      return;
    }

    elements.matchGrid.innerHTML = page.items.map((match) => {
      const videoUrl = safeExternalUrl(match.videoUrl);
      const visiblePlayers = match.appearances.slice(0, 4);
      const remainingPlayers = match.appearances.length - visiblePlayers.length;
      return `
        <article class="match-card">
          <div class="match-card-head">
            <div>
              <time datetime="${escapeAttribute(match.date)}">${escapeAttribute(match.date || "Sin fecha")}</time>
              <h3>${matchLinkButton(match)}</h3>
            </div>
            <span class="result-badge ${matchResultClass(match)}">${escapeAttribute(matchResultLabel(match))}</span>
          </div>
          <div class="match-roster" aria-label="${match.participantsCount} participantes">
            ${visiblePlayers.map((appearance) => `
              <div class="match-roster-row">
                <span>${escapeAttribute(appearance.displayedPlayerName || "Jugador sin nombre")}</span>
                <small>${escapeAttribute(appearance.commanderDisplay || "Sin comandante")}</small>
              </div>
            `).join("")}
            ${remainingPlayers > 0 ? `<p>+${remainingPlayers} participantes</p>` : ""}
          </div>
          <div class="match-card-actions">
            ${videoUrl ? `<a class="deck-link compact-link" href="${escapeAttribute(videoUrl)}" target="_blank" rel="noreferrer">Ver en YouTube</a>` : '<span class="link-unavailable">Video no disponible</span>'}
            <button class="match-detail-button" type="button" data-match-key="${escapeAttribute(match.matchKey)}">Ver partida <span aria-hidden="true">›</span></button>
          </div>
        </article>
      `;
    }).join("");
    renderPagination(elements.matchPagination, "matches", matches.length, page.currentPage, matchPageSize);
  }

  function showMatch(matchKey, trigger) {
    const match = recordedMatches().find((item) => item.matchKey === matchKey);
    if (!match) return;

    lastMatchTrigger = trigger || null;
    hidePlayerPreview();
    if (elements.dialog.open) elements.dialog.close();
    if (elements.guildDialog.open) elements.guildDialog.close();
    if (elements.commanderDialog.open) elements.commanderDialog.close();
    const videoUrl = safeExternalUrl(match.videoUrl);

    elements.matchDialogContent.innerHTML = `
      <div class="match-dialog-hero">
        <div>
          <span class="section-kicker">Partida</span>
          <h2 id="matchDialogTitle">${escapeAttribute(match.title || "Partida sin título")}</h2>
          <p>${escapeAttribute(match.date || "Fecha no registrada")} · ${match.participantsCount} ${match.participantsCount === 1 ? "participante" : "participantes"}</p>
        </div>
        <div class="match-dialog-result">
          <span class="result-badge ${matchResultClass(match)}">${escapeAttribute(matchResultLabel(match))}</span>
          ${videoUrl ? `<a class="deck-link" href="${escapeAttribute(videoUrl)}" target="_blank" rel="noreferrer">Ver en YouTube</a>` : '<span class="link-unavailable">Video no disponible</span>'}
        </div>
      </div>
      <div class="match-dialog-body">
        <div class="dialog-section-heading">
          <h3 class="dialog-section-title">Participantes</h3>
          <span>${match.appearances.length} registros</span>
        </div>
        <div class="match-participant-list">
          ${match.appearances.map((appearance) => {
            const moxfieldUrl = safeExternalUrl(appearance.moxfield);
            const cardUrl = safeExternalUrl(appearance.cardUrl);
            return `
              <article class="match-participant">
                <div class="match-participant-player">
                  <span class="avatar alt-${appearance.participantIndex % 3}">${initials(appearance.displayedPlayerName || "Jugador")}</span>
                  <div>
                    ${playerNameButton({ id: appearance.playerId, name: appearance.displayedPlayerName || "Jugador sin nombre" }, "cell-title")}
                    <p>${escapeAttribute(appearance.handle || "Sin handle")} · ${escapeAttribute(appearance.role || "Invitado")}</p>
                  </div>
                </div>
                <div class="match-participant-deck">
                  ${commanderGroupButton(appearance)}
                  ${manaIdentity(appearance)}
                  ${appearance.archetype ? `<small>${escapeAttribute(appearance.archetype)}</small>` : ""}
                </div>
                <span class="result-badge result-${appearance.result}">${appearance.result === "win" ? "Victoria" : appearance.result === "tie" ? "Empate" : "Derrota"}</span>
                <div class="match-participant-links">
                  ${moxfieldUrl ? `<a class="deck-link compact-link" href="${escapeAttribute(moxfieldUrl)}" target="_blank" rel="noreferrer">Moxfield</a>` : '<span class="link-unavailable">Sin Moxfield</span>'}
                  ${cardUrl ? `<a class="deck-link compact-link" href="${escapeAttribute(cardUrl)}" target="_blank" rel="noreferrer">Scryfall</a>` : ""}
                </div>
              </article>
            `;
          }).join("") || '<p class="empty-state">No hay participantes registrados en esta partida.</p>'}
        </div>
      </div>
    `;

    elements.matchDialog.showModal();
    elements.closeMatchDialog.focus();
  }

  function commanderArtwork(group, context = "card") {
    const commanders = group.commanders.length
      ? group.commanders
      : [{ name: group.commanderDisplay || "Comandante", cardImage: "" }];
    return `
      <div class="commander-art commander-art-${context} ${commanders.length > 1 ? "is-pair" : ""}" aria-label="${escapeAttribute(group.commanderDisplay)}">
        ${commanders.map((commander) => {
          const image = safeExternalUrl(commander.cardImage);
          return `
            <span class="commander-art-panel">
              <span class="commander-art-fallback" aria-hidden="true">${commanderInitials(commander.name)}</span>
              ${image ? `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(commander.name)}" loading="lazy">` : ""}
            </span>
          `;
        }).join("")}
      </div>
    `;
  }

  function commanderNames(group) {
    const commanders = group.commanders.length
      ? group.commanders
      : [{ name: group.commanderDisplay || "Comandante" }];
    return commanders.map((commander) => `<span>${escapeAttribute(commander.name)}</span>`).join('<i aria-hidden="true">+</i>');
  }

  function renderCommanderGrid() {
    const sorters = {
      date: (a, b) => (b.lastPlayedAt || "").localeCompare(a.lastPlayedAt || "") || a.commanderDisplay.localeCompare(b.commanderDisplay),
      played: (a, b) => b.appearancesCount - a.appearancesCount || (b.lastPlayedAt || "").localeCompare(a.lastPlayedAt || "") || a.commanderDisplay.localeCompare(b.commanderDisplay),
      winrate: (a, b) => b.winRate - a.winRate || (b.wins + b.losses) - (a.wins + a.losses) || b.appearancesCount - a.appearancesCount || a.commanderDisplay.localeCompare(b.commanderDisplay),
      wins: (a, b) => b.wins - a.wins || b.appearancesCount - a.appearancesCount || a.commanderDisplay.localeCompare(b.commanderDisplay),
      name: (a, b) => a.commanderDisplay.localeCompare(b.commanderDisplay)
    };
    const groups = filteredCommanderGroups().sort(sorters[state.commanderSort] || sorters.date);
    const page = pageItems(groups, state.commanderPage, commanderPageSize);
    state.commanderPage = page.currentPage;

    if (!groups.length) {
      elements.commanderGrid.innerHTML = '<p class="empty-state commander-empty">No encontramos comandantes con esa búsqueda y combinación de colores.</p>';
      renderPagination(elements.commanderPagination, "commanders", 0, 1, commanderPageSize);
      return;
    }

    elements.commanderGrid.innerHTML = page.items.map((group) => {
      const decidedGames = group.wins + group.losses;
      return `
          <article class="commander-card">
            <button class="commander-card-open" type="button" data-commander-key="${escapeAttribute(group.commanderGroupKey)}" aria-label="Ver historial de ${escapeAttribute(group.commanderDisplay)}">
              ${commanderArtwork(group)}
              <span class="commander-card-body">
                <span class="commander-card-heading">
                  <span class="commander-card-names">${commanderNames(group)}</span>
                  ${manaIdentity(group)}
                </span>
                <span class="commander-card-stats">
                  <span><b>${group.appearancesCount}</b> ${group.appearancesCount === 1 ? "aparición" : "apariciones"}</span>
                  <span><b>${group.distinctPlayerCount}</b> ${group.distinctPlayerCount === 1 ? "piloto" : "pilotos"}</span>
                  <span><b>${group.wins}-${group.losses}</b> W-L</span>
                </span>
                <span class="commander-card-footer">
                  <span><b>WR ${group.winRate}%</b> en ${decidedGames} ${decidedGames === 1 ? "partida decidida" : "partidas decididas"}</span>
                  <span>${escapeAttribute(group.lastPlayedAt || "Sin fecha")}</span>
                </span>
                <span class="commander-card-cta">Ver historial <span aria-hidden="true">›</span></span>
              </span>
            </button>
          </article>
      `;
    }).join("");
    renderPagination(elements.commanderPagination, "commanders", groups.length, page.currentPage, commanderPageSize);
  }

  function commanderHistoryLinks(appearance) {
    const videoUrl = safeExternalUrl(appearance.videoUrl);
    const moxfieldUrl = safeExternalUrl(appearance.moxfield);
    return `
      <span class="commander-history-links">
        ${videoUrl ? `<a class="deck-link compact-link" href="${escapeAttribute(videoUrl)}" target="_blank" rel="noreferrer">Ver video</a>` : '<span class="link-unavailable">Sin video</span>'}
        ${moxfieldUrl ? `<a class="deck-link compact-link" href="${escapeAttribute(moxfieldUrl)}" target="_blank" rel="noreferrer">Moxfield</a>` : '<span class="link-unavailable">Sin Moxfield</span>'}
      </span>
    `;
  }

  function showCommander(commanderKey, trigger) {
    const group = commanderGroups().find((item) => item.commanderGroupKey === commanderKey);
    if (!group) return;

    lastCommanderTrigger = trigger || null;
    hidePlayerPreview();
    if (elements.dialog.open) elements.dialog.close();
    if (elements.guildDialog.open) elements.guildDialog.close();
    if (elements.matchDialog.open) elements.matchDialog.close();
    const appearances = [...group.appearances].sort((a, b) =>
      (b.date || "").localeCompare(a.date || "") || a.tableTitle.localeCompare(b.tableTitle)
    );
    const decidedGames = group.wins + group.losses;
    const tiesStat = group.ties
      ? `<div class="dialog-stat"><span>Empates</span><strong>${group.ties}</strong></div>`
      : "";

    elements.commanderDialogContent.innerHTML = `
      <div class="commander-dialog-hero">
        ${commanderArtwork(group, "detail")}
        <div>
          <span class="section-kicker">Commander Group</span>
          <h2 id="commanderDialogTitle" class="commander-detail-title">${commanderNames(group)}</h2>
          ${manaIdentity(group)}
          <p>${group.appearancesCount} apariciones con ${group.distinctPlayerCount} ${group.distinctPlayerCount === 1 ? "piloto" : "pilotos"}.</p>
        </div>
      </div>
      <div class="commander-dialog-body">
        <section aria-labelledby="commanderSummaryTitle">
          <h3 id="commanderSummaryTitle" class="dialog-section-title">Resumen</h3>
          <div class="dialog-stats commander-dialog-stats">
            <div class="dialog-stat"><span>Apariciones</span><strong>${group.appearancesCount}</strong></div>
            <div class="dialog-stat"><span>Pilotos</span><strong>${group.distinctPlayerCount}</strong></div>
            <div class="dialog-stat"><span>Wins</span><strong>${group.wins}</strong></div>
            <div class="dialog-stat"><span>Losses</span><strong>${group.losses}</strong></div>
            ${tiesStat}
            <div class="dialog-stat"><span>Win rate</span><strong>${group.winRate}%</strong><small>${decidedGames} ${decidedGames === 1 ? "partida decidida" : "partidas decididas"}</small></div>
            <div class="dialog-stat"><span>Última partida</span><strong class="dialog-stat-date">${escapeAttribute(group.lastPlayedAt || "Sin fecha")}</strong></div>
          </div>
        </section>
        <section aria-labelledby="commanderHistoryTitle">
          <div class="dialog-section-heading">
            <h3 id="commanderHistoryTitle" class="dialog-section-title">Historial</h3>
            <span>${appearances.length} ${appearances.length === 1 ? "aparición" : "apariciones"}</span>
          </div>
          <ol class="commander-history-list">
            ${appearances.map((appearance) => `
              <li class="commander-history-item">
                <div class="commander-history-main">
                  <time datetime="${escapeAttribute(appearance.date)}">${escapeAttribute(appearance.date || "Sin fecha")}</time>
                  <strong>${matchLinkButton({ matchKey: appearance.matchKey, title: appearance.tableTitle || "Mesa guardada" }, "match-link-compact")}</strong>
                  <span>${playerNameButton({ id: appearance.playerId, name: appearance.displayedPlayerName })}</span>
                </div>
                <span class="result-badge result-${appearance.result}">${appearance.result === "win" ? "Victoria" : appearance.result === "tie" ? "Empate" : "Derrota"}</span>
                ${commanderHistoryLinks(appearance)}
              </li>
            `).join("")}
          </ol>
        </section>
        <section aria-labelledby="commanderDecklistsTitle">
          <div class="dialog-section-heading">
            <h3 id="commanderDecklistsTitle" class="dialog-section-title">Decklists</h3>
            <span>${group.decklistVariants.length} ${group.decklistVariants.length === 1 ? "lista única" : "listas únicas"}</span>
          </div>
          ${group.decklistVariants.length ? `
            <div class="commander-decklists">
              ${group.decklistVariants.map((variant, index) => {
                const url = safeExternalUrl(variant.url);
                return `
                  <article class="commander-decklist">
                    <div>
                      <strong>Lista ${index + 1}</strong>
                      <p>${variant.appearancesCount} ${variant.appearancesCount === 1 ? "aparición" : "apariciones"} · ${variant.players.map((player) => playerNameButton({ id: player.playerId, name: player.name })).join(", ")}</p>
                    </div>
                    ${url ? `<a class="deck-link compact-link" href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">Abrir Moxfield</a>` : '<span class="link-unavailable">Link inválido</span>'}
                  </article>
                `;
              }).join("")}
            </div>
          ` : '<p class="empty-state commander-detail-empty">No hay links de Moxfield registrados para este comandante.</p>'}
        </section>
      </div>
    `;

    elements.commanderDialog.showModal();
    elements.closeCommanderDialog.focus();
  }

  function showPlayer(playerId, trigger) {
    const player = recordedPlayer(playerId);
    if (!player) return;

    lastPlayerTrigger = trigger || null;
    hidePlayerPreview();
    if (elements.guildDialog.open) elements.guildDialog.close();
    if (elements.commanderDialog.open) elements.commanderDialog.close();
    if (elements.matchDialog.open) elements.matchDialog.close();
    const appearances = [...player.appearances].sort((a, b) =>
      (b.date || "").localeCompare(a.date || "") || b.tableIndex - a.tableIndex
    );
    const tiesStat = player.ties
      ? `<div class="dialog-stat"><span>Empates</span><strong>${player.ties}</strong></div>`
      : "";
    const mostPlayed = player.insights.mostPlayedCommander;
    const mostWinning = player.insights.mostWinningCommander;

    elements.dialogContent.innerHTML = `
      <div class="dialog-hero player-profile-hero">
        <span class="avatar">${initials(player.name)}</span>
        <div>
          <span class="section-kicker">${escapeAttribute(player.role)}</span>
          <h2>${escapeAttribute(player.name)}</h2>
          ${player.handle ? `<p class="profile-handle">${escapeAttribute(player.handle)}</p>` : '<p class="profile-handle is-missing">Sin handle registrado</p>'}
          ${player.signature ? `<p class="empty-state">${escapeAttribute(player.signature)}</p>` : ""}
        </div>
      </div>
      <div class="dialog-body player-profile-body">
        <section aria-labelledby="playerSummaryTitle">
          <h3 id="playerSummaryTitle" class="dialog-section-title">Resumen</h3>
          <div class="dialog-stats player-profile-stats">
          <div class="dialog-stat"><span>Partidas</span><strong>${player.appearancesCount}</strong></div>
          <div class="dialog-stat"><span>Wins</span><strong>${player.wins}</strong></div>
          <div class="dialog-stat"><span>Losses</span><strong>${player.losses}</strong></div>
          ${tiesStat}
          <div class="dialog-stat"><span>Win rate</span><strong>${winRate(player)}%</strong></div>
          <div class="dialog-stat"><span>Comandantes</span><strong>${player.commanderCount}</strong></div>
          <div class="dialog-stat"><span>Última aparición</span><strong class="dialog-stat-date">${escapeAttribute(player.lastPlayedAt || "Sin fecha")}</strong></div>
          </div>
        </section>
        ${mostPlayed || mostWinning ? `
          <section aria-labelledby="playerInsightsTitle">
            <h3 id="playerInsightsTitle" class="dialog-section-title">Insights</h3>
            <div class="player-insights">
              ${mostPlayed ? `<div><span>Más utilizado</span><strong>${commanderGroupButton(mostPlayed)}</strong><small>${mostPlayed.appearancesCount} apariciones</small></div>` : ""}
              ${mostWinning ? `<div><span>Más victorias</span><strong>${commanderGroupButton(mostWinning)}</strong><small>${mostWinning.wins} ${mostWinning.wins === 1 ? "win" : "wins"}</small></div>` : ""}
            </div>
          </section>
        ` : ""}
        ${player.commanders.length ? `
          <section aria-labelledby="playerCommandersTitle">
            <div class="dialog-section-heading">
              <h3 id="playerCommandersTitle" class="dialog-section-title">Comandantes</h3>
              <span>${player.commanderCount} ${player.commanderCount === 1 ? "configuración" : "configuraciones"}</span>
            </div>
            <div class="player-commander-list">
              ${player.commanders.map((commander) => `
                <article class="player-commander-row">
                  <div>
                    ${commanderGroupButton(commander)}
                    ${manaIdentity(commander)}
                  </div>
                  <span><b>${commander.appearancesCount}</b> ${commander.appearancesCount === 1 ? "aparición" : "apariciones"}</span>
                  <span><b>${commander.wins}-${commander.losses}</b> W-L${commander.ties ? ` · ${commander.ties} E` : ""}</span>
                  <span><b>${commander.winRate}%</b> WR</span>
                </article>
              `).join("")}
            </div>
          </section>
        ` : ""}
        <section class="player-match-history" aria-labelledby="playerMatchHistoryTitle">
          <div class="dialog-section-heading">
            <h3 id="playerMatchHistoryTitle" class="dialog-section-title">Partidas</h3>
            <span>${appearances.length} ${appearances.length === 1 ? "aparición" : "apariciones"}</span>
          </div>
          <ol class="player-match-list">
            ${appearances.map((appearance) => {
              const videoUrl = safeExternalUrl(appearance.videoUrl);
              const moxfieldUrl = safeExternalUrl(appearance.moxfield);
              return `
              <li>
                <time datetime="${escapeAttribute(appearance.date)}">${escapeAttribute(appearance.date || "Sin fecha")}</time>
                <div class="player-match-main">
                  ${matchLinkButton({ matchKey: appearance.matchKey, title: appearance.tableTitle || "Partida sin título" }, "match-link-compact")}
                  ${commanderGroupButton(appearance, "player-match-commander")}
                </div>
                <span class="result-badge result-${appearance.result}">${appearance.result === "win" ? "Victoria" : appearance.result === "tie" ? "Empate" : "Derrota"}</span>
                <span class="player-match-links">
                  ${videoUrl ? `<a class="deck-link compact-link" href="${escapeAttribute(videoUrl)}" target="_blank" rel="noreferrer">Video</a>` : '<span class="link-unavailable">Sin video</span>'}
                  ${moxfieldUrl ? `<a class="deck-link compact-link" href="${escapeAttribute(moxfieldUrl)}" target="_blank" rel="noreferrer">Moxfield</a>` : '<span class="link-unavailable">Sin Moxfield</span>'}
                </span>
              </li>
            `;}).join("") || '<li class="empty-state">No hay partidas registradas para este jugador.</li>'}
          </ol>
        </section>
      </div>
    `;

    elements.dialog.showModal();
  }

  function showGuild(guildKey) {
    if (elements.commanderDialog.open) elements.commanderDialog.close();
    if (elements.matchDialog.open) elements.matchDialog.close();
    const decks = recordedDecks()
      .filter((deck) => guildKeyForDeck(deck) === guildKey)
      .sort((a, b) => b.wins - a.wins || deckWinRate(b) - deckWinRate(a) || commanderDisplay(a).localeCompare(commanderDisplay(b)));

    elements.guildDialogContent.innerHTML = `
      <div class="dialog-hero">
        <span class="guild-rank rank-1">${shortColorLabel(guildKey === "C" ? [] : guildKey.split(""))}</span>
        <div>
          <span class="section-kicker">Guild</span>
          <h2>${guildName(guildKey)}</h2>
          <p class="empty-state">${guildKey === "C" ? "Sin color" : guildKey} | ${decks.length} decks registrados</p>
          ${guildKey === "C" ? '<span class="mana-row"><span class="mana">C</span></span>' : manaPips(guildKey.split(""))}
        </div>
      </div>
      <div class="dialog-body guild-deck-list">
        ${decks.length ? decks.map((deck) => `
          <article class="dialog-deck">
            <div>
              <h3>${deckCommanderLink(deck)}</h3>
              <p class="empty-state">${playerNameButton({ id: deck.playerId, name: deck.player })} | ${deck.archetype} | ${deck.wins}-${deck.losses}</p>
              ${manaPips(deck.colors)}
            </div>
            <div class="deck-actions">
              <a class="deck-link" href="${deck.moxfield}" target="_blank" rel="noreferrer">Moxfield</a>
              <a class="deck-link" href="${deck.videoUrl || data.socials[0].url}" target="_blank" rel="noreferrer">Watch Video</a>
            </div>
          </article>
        `).join("") : '<p class="empty-state">Todavía no hay decks registrados con estos colores.</p>'}
      </div>
    `;

    elements.guildDialog.showModal();
  }

  function render() {
    renderMetrics();
    renderGuildStats();
    renderRows();
    renderMatchGrid();
    renderCommanderGrid();
    renderGlobalSearch();
  }

  function mergeRemoteData(nextData) {
    const existingStats = data.channelStats || {};
    nextData.channelStats = {
      ...existingStats,
      ...(nextData.channelStats || {}),
      youtubeApiKey: nextData.channelStats?.youtubeApiKey || existingStats.youtubeApiKey,
      youtubeChannelId: nextData.channelStats?.youtubeChannelId || existingStats.youtubeChannelId
    };
    data = nextData;
    derivedDataCache = {};
    window.MALEDucadosData = nextData;
  }

  async function loadRemoteLeaderboardData() {
    const firebaseSetup = window.MALEDucadosFirebaseConfig;
    if (!firebaseSetup?.enabled) return;

    try {
      const [{ initializeApp, getApp, getApps }, firestoreModule] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js")
      ]);
      const appName = "leaderboard-public";
      const app = getApps().some((firebaseApp) => firebaseApp.name === appName)
        ? getApp(appName)
        : initializeApp(firebaseSetup.firebase, appName);
      const db = firestoreModule.getFirestore(app);
      const docRef = firestoreModule.doc(db, firebaseSetup.collectionName, firebaseSetup.documentId);
      const snapshot = firestoreModule.getDocFromServer
        ? await firestoreModule.getDocFromServer(docRef)
        : await firestoreModule.getDoc(docRef);
      const remoteData = snapshot.exists() ? snapshot.data()?.data : null;

      if (remoteData && typeof remoteData === "object") {
        mergeRemoteData(remoteData);
      }
    } catch (error) {
      console.warn("No se pudo cargar la data pública desde Firebase antes de pintar.", error);
    }
  }

  elements.search.addEventListener("input", (event) => {
    state.query = window.MaleducadosDerivedData?.identityText(event.target.value) || event.target.value.trim().toLowerCase();
    state.rankingPage = 1;
    renderRows();
  });

  elements.role.addEventListener("change", (event) => {
    state.role = event.target.value;
    state.rankingPage = 1;
    renderRows();
  });

  elements.color.addEventListener("change", (event) => {
    state.color = event.target.value;
    state.rankingPage = 1;
    renderRows();
  });

  elements.globalSearch.addEventListener("input", renderGlobalSearch);

  document.querySelectorAll(".table-sort").forEach((button) => {
    button.addEventListener("click", () => {
      const nextSort = button.dataset.sort;
      if (state.sort === nextSort) {
        state.sortDirection = state.sortDirection === "desc" ? "asc" : "desc";
      } else {
        state.sort = nextSort;
        state.sortDirection = nextSort === "player" ? "asc" : "desc";
      }
      state.rankingPage = 1;

      document.querySelectorAll(".table-sort").forEach((item) => {
        item.classList.toggle("is-active", item.dataset.sort === state.sort);
        item.dataset.direction = item.dataset.sort === state.sort ? state.sortDirection : "";
      });
      renderRows();
    });
  });

  elements.commanderSearch.addEventListener("input", (event) => {
    state.commanderQuery = event.target.value.trim().toLowerCase();
    state.commanderPage = 1;
    renderCommanderGrid();
  });

  elements.matchSearch.addEventListener("input", (event) => {
    state.matchQuery = window.MaleducadosDerivedData?.identityText(event.target.value) || event.target.value.trim().toLowerCase();
    state.matchPage = 1;
    renderMatchGrid();
  });

  elements.matchSort.addEventListener("change", (event) => {
    state.matchSort = event.target.value;
    state.matchPage = 1;
    renderMatchGrid();
  });

  document.querySelectorAll(".deck-color-filter input").forEach((input) => {
    input.addEventListener("change", () => {
      state.commanderColors = colorOrder.filter((color) =>
        document.querySelector(`.deck-color-filter input[value="${color}"]`)?.checked
      );
      state.commanderPage = 1;
      renderCommanderGrid();
    });
  });

  elements.commanderColorMode.addEventListener("change", (event) => {
    state.commanderColorMode = event.target.value;
    state.commanderPage = 1;
    renderCommanderGrid();
  });

  elements.commanderSort.addEventListener("change", (event) => {
    state.commanderSort = event.target.value;
    state.commanderPage = 1;
    renderCommanderGrid();
  });

  document.addEventListener("click", (event) => {
    const navTarget = event.target.closest("[data-nav-target]");
    if (navTarget) {
      window.location.hash = navTarget.dataset.navTarget;
      return;
    }

    const pageButton = event.target.closest("[data-page-target]");
    if (pageButton) {
      const nextPage = Number(pageButton.dataset.page);
      const target = pageButton.dataset.pageTarget;

      if (target === "ranking") {
        state.rankingPage = nextPage;
        renderRows();
      }
      if (target === "commanders") {
        state.commanderPage = nextPage;
        renderCommanderGrid();
      }
      if (target === "matches") {
        state.matchPage = nextPage;
        renderMatchGrid();
      }
      return;
    }

    const guildLink = event.target.closest("[data-guild-key]");
    if (guildLink) {
      event.preventDefault();
      showGuild(guildLink.dataset.guildKey);
      return;
    }

    const matchTrigger = event.target.closest("[data-match-key]");
    if (matchTrigger) {
      event.preventDefault();
      showMatch(matchTrigger.dataset.matchKey, matchTrigger);
      return;
    }

    const commanderTrigger = event.target.closest("[data-commander-key]");
    if (commanderTrigger) {
      event.preventDefault();
      showCommander(commanderTrigger.dataset.commanderKey, commanderTrigger);
      return;
    }

    const profileLink = event.target.closest("[data-player-id]");
    if (!profileLink) return;

    event.preventDefault();
    hidePlayerPreview();
    showPlayer(profileLink.dataset.playerId, profileLink);
  });

  function movePlayerPreview(event, trigger) {
    if (elements.playerPreview.hidden || !trigger) return;
    const triggerRect = trigger.getBoundingClientRect();
    const previewRect = elements.playerPreview.getBoundingClientRect();
    const anchorX = Number.isFinite(event?.clientX) ? event.clientX : triggerRect.left + triggerRect.width / 2;
    const anchorY = Number.isFinite(event?.clientY) ? event.clientY : triggerRect.bottom;
    const margin = 10;
    const offset = 12;
    const left = Math.min(
      Math.max(margin, anchorX + offset),
      window.innerWidth - previewRect.width - margin
    );
    const preferredTop = anchorY + offset;
    const top = preferredTop + previewRect.height <= window.innerHeight - margin
      ? preferredTop
      : Math.max(margin, anchorY - previewRect.height - offset);
    elements.playerPreview.style.transform = `translate(${left}px, ${top}px)`;
  }

  function showPlayerPreview(trigger, event) {
    const player = recordedPlayer(trigger?.dataset.playerId);
    if (!player) return;

    elements.playerPreview.innerHTML = `
      <span title="Win rate" aria-label="Win rate ${winRate(player)} por ciento"><b>WR</b><strong>${winRate(player)}%</strong></span>
      <span title="Partidas jugadas" aria-label="${player.appearancesCount} partidas jugadas"><b>PJ</b><strong>${player.appearancesCount}</strong></span>
      <span title="Comandantes jugados" aria-label="${player.commanderCount} comandantes jugados"><b>C</b><strong>${player.commanderCount}</strong></span>
    `;
    elements.playerPreview.hidden = false;
    elements.playerPreview.setAttribute("aria-hidden", "false");
    movePlayerPreview(event, trigger);
  }

  function hidePlayerPreview() {
    elements.playerPreview.hidden = true;
    elements.playerPreview.setAttribute("aria-hidden", "true");
    elements.playerPreview.innerHTML = "";
  }

  document.addEventListener("mouseover", (event) => {
    const trigger = event.target.closest("[data-player-preview]");
    if (!trigger || trigger.contains(event.relatedTarget)) return;
    showPlayerPreview(trigger, event);
  });

  document.addEventListener("mousemove", (event) => {
    const trigger = event.target.closest("[data-player-preview]");
    if (trigger) movePlayerPreview(event, trigger);
  });

  document.addEventListener("mouseout", (event) => {
    const trigger = event.target.closest("[data-player-preview]");
    if (!trigger || trigger.contains(event.relatedTarget)) return;
    hidePlayerPreview();
  });

  document.addEventListener("focusin", (event) => {
    const trigger = event.target.closest("[data-player-preview]");
    if (trigger) showPlayerPreview(trigger);
  });

  document.addEventListener("focusout", (event) => {
    if (event.target.closest("[data-player-preview]")) hidePlayerPreview();
  });

  function moveCardPreview(event) {
    const offset = 18;
    const previewWidth = 260;
    const previewHeight = 364;
    const left = Math.min(event.clientX + offset, window.innerWidth - previewWidth - offset);
    const top = Math.min(event.clientY + offset, window.innerHeight - previewHeight - offset);
    elements.cardPreview.style.transform = `translate(${left}px, ${top}px)`;
  }

  function showCardPreview(content, event) {
    const activeDialog = elements.matchDialog.open
      ? elements.matchDialog
      : elements.commanderDialog.open
        ? elements.commanderDialog
        : elements.guildDialog.open
        ? elements.guildDialog
        : elements.dialog.open
          ? elements.dialog
          : document.body;
    if (elements.cardPreview.parentElement !== activeDialog) {
      activeDialog.appendChild(elements.cardPreview);
    }
    elements.cardPreview.innerHTML = content;
    elements.cardPreview.hidden = false;
    elements.cardPreview.setAttribute("aria-hidden", "false");
    moveCardPreview(event);
  }

  function hideCardPreview() {
    elements.cardPreview.hidden = true;
    elements.cardPreview.setAttribute("aria-hidden", "true");
    elements.cardPreview.innerHTML = "";
  }

  document.addEventListener("mouseover", async (event) => {
    const link = event.target.closest("[data-card-image]");
    if (!link) return;

    showCardPreview('<div class="card-preview-loading">Cargando carta...</div>', event);

    if (!link.dataset.cardImage) {
      const card = await getScryfallCard(link.dataset.cardName);
      link.dataset.cardImage = card.image;
      link.dataset.cardUrl = card.url;
      if (card.url) link.href = card.url;
    }

    if (!link.matches(":hover")) return;

    if (!link.dataset.cardImage) {
      showCardPreview('<div class="card-preview-loading">Sin imagen en Scryfall</div>', event);
      return;
    }

    showCardPreview(`<img src="${escapeAttribute(link.dataset.cardImage)}" alt="${escapeAttribute(link.dataset.cardName)}">`, event);
  });

  document.addEventListener("mousemove", (event) => {
    if (elements.cardPreview.hidden) return;
    moveCardPreview(event);
  });

  document.addEventListener("mouseout", (event) => {
    const link = event.target.closest("[data-card-image]");
    if (!link) return;

    hideCardPreview();
  });

  document.addEventListener("error", (event) => {
    if (!event.target.matches?.(".commander-art img")) return;
    event.target.remove();
  }, true);

  elements.closeDialog.addEventListener("click", () => {
    elements.dialog.close();
  });

  elements.closeGuildDialog.addEventListener("click", () => {
    elements.guildDialog.close();
  });

  elements.closeCommanderDialog.addEventListener("click", () => {
    elements.commanderDialog.close();
  });

  elements.closeMatchDialog.addEventListener("click", () => {
    elements.matchDialog.close();
  });

  elements.dialog.addEventListener("click", (event) => {
    if (event.target === elements.dialog) {
      elements.dialog.close();
    }
  });

  elements.guildDialog.addEventListener("click", (event) => {
    if (event.target === elements.guildDialog) {
      elements.guildDialog.close();
    }
  });

  elements.commanderDialog.addEventListener("click", (event) => {
    if (event.target === elements.commanderDialog) {
      elements.commanderDialog.close();
    }
  });

  elements.matchDialog.addEventListener("click", (event) => {
    if (event.target === elements.matchDialog) {
      elements.matchDialog.close();
    }
  });

  function restoreTriggerFocus(trigger) {
    if (trigger?.isConnected && trigger.getClientRects().length) trigger.focus();
  }

  elements.commanderDialog.addEventListener("close", () => {
    restoreTriggerFocus(lastCommanderTrigger);
    lastCommanderTrigger = null;
  });

  elements.matchDialog.addEventListener("close", () => {
    restoreTriggerFocus(lastMatchTrigger);
    lastMatchTrigger = null;
  });

  elements.dialog.addEventListener("close", () => {
    restoreTriggerFocus(lastPlayerTrigger);
    lastPlayerTrigger = null;
  });

  window.addEventListener("hashchange", updateActiveNav);

  window.getLeaderboardData = function () {
    return JSON.parse(JSON.stringify(data));
  };

  window.getLeaderboardDerivedData = function () {
    const derivedData = window.MaleducadosDerivedData?.buildDerivedData(data);
    return derivedData ? JSON.parse(JSON.stringify(derivedData)) : null;
  };

  window.setLeaderboardData = function (nextData) {
    mergeRemoteData(nextData);
    render();
  };

  async function init() {
    renderColorOptions();
    updateActiveNav();
    await loadRemoteLeaderboardData();
    render();
  }

  init();
})();
