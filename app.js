(function () {
  let data = window.MALEDucadosData;
  let subscriberLoadStarted = false;
  const scryfallImageCache = new Map();
  const state = {
    query: "",
    role: "all",
    color: "all",
    sort: "score",
    deckQuery: "",
    deckColors: [],
    deckColorMode: "exact",
    deckSort: "date",
    sortDirection: "desc",
    rankingPage: 1,
    deckPage: 1,
    guildPages: {
      played: 1,
      wins: 1,
      losses: 1
    }
  };

  const pageSize = 5;
  const deckPageSize = 6;

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
    guestCount: document.querySelector("#guestCount"),
    subscriberCount: document.querySelector("#subscriberCount"),
    subscriberStatus: document.querySelector("#subscriberStatus"),
    subscribeLink: document.querySelector("#subscribeLink"),
    hostGuestScore: document.querySelector("#hostGuestScore"),
    hostGuestRate: document.querySelector("#hostGuestRate"),
    socialLinks: document.querySelector("#socialLinks"),
    podium: document.querySelector("#podium"),
    guildPlayedStats: document.querySelector("#guildPlayedStats"),
    guildWinStats: document.querySelector("#guildWinStats"),
    guildLossStats: document.querySelector("#guildLossStats"),
    guildPlayedPagination: document.querySelector("#guildPlayedPagination"),
    guildWinPagination: document.querySelector("#guildWinPagination"),
    guildLossPagination: document.querySelector("#guildLossPagination"),
    rows: document.querySelector("#leaderboardRows"),
    rankingPagination: document.querySelector("#rankingPagination"),
    deckGrid: document.querySelector("#deckGrid"),
    deckPagination: document.querySelector("#deckPagination"),
    deckSearch: document.querySelector("#deckSearchInput"),
    deckColorMode: document.querySelector("#deckColorMode"),
    deckSort: document.querySelector("#deckSortSelect"),
    search: document.querySelector("#searchInput"),
    role: document.querySelector("#roleFilter"),
    color: document.querySelector("#colorFilter"),
    dialog: document.querySelector("#playerDialog"),
    dialogContent: document.querySelector("#dialogContent"),
    closeDialog: document.querySelector("#closeDialog"),
    guildDialog: document.querySelector("#guildDialog"),
    guildDialogContent: document.querySelector("#guildDialogContent"),
    closeGuildDialog: document.querySelector("#closeGuildDialog"),
    cardPreview: document.querySelector("#cardPreview")
  };

  function updateActiveNav() {
    const currentHash = window.location.hash || "#leaderboard";
    document.querySelectorAll(".rail-link").forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("href") === currentHash);
    });
  }

  function initials(name) {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join("");
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

  function slugify(value) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function deckWinRate(deck) {
    const total = deck.wins + deck.losses;
    return total === 0 ? 0 : Math.round((deck.wins / total) * 100);
  }

  function splitCommanderNames(commander = "") {
    return String(commander)
      .replace(/\s*\/\/\s*/g, " + ")
      .split(/\s+\+\s+|\s+&\s+/)
      .map((name) => name.trim())
      .filter(Boolean);
  }

  function normalizeCommanderDisplay(commander = "") {
    const names = splitCommanderNames(commander);
    return names.length > 1 ? names.join(" & ") : commander.trim();
  }

  function knownCommanderColors(commander = "") {
    const hints = {
      "pako, arcane retriever": ["R", "G"],
      "haldan, avid arcanist": ["U", "G"],
      "rograkh, son of rohgahh": ["R"],
      "silas renn, seeker adept": ["U", "B"],
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

  function shortColorLabel(colors) {
    return normalizeColors(colors) || "C";
  }

  function formatNumber(value) {
    if (typeof value === "number") {
      return new Intl.NumberFormat("es-MX").format(value);
    }

    return value || "N/D";
  }

  function formatUpdateTime(date = new Date()) {
    return new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function rateColor(rate) {
    const hue = Math.round((rate / 100) * 138);
    return `hsl(${hue}, 72%, 64%)`;
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
    const href = deck.cardUrl || `https://scryfall.com/search?as=grid&order=name&q=!%22${encodeURIComponent(deck.commander || "Commander")}%22`;
    const image = deck.cardImage || "";
    const label = deck.commander || "Commander";
    return `<a class="commander-link" href="${href}" target="_blank" rel="noreferrer" data-card-image="${image}" data-card-url="${deck.cardUrl || ""}" data-card-name="${label}" title="Ver carta en Scryfall">${label}</a>`;
  }

  function deckCommanderLink(deck) {
    const image = deck.cardImage || "";
    const label = deck.commander || "Commander";
    return `<a class="commander-link" href="${deck.moxfield || deck.cardUrl || "#"}" target="_blank" rel="noreferrer" data-card-image="${image}" data-card-url="${deck.cardUrl || ""}" data-card-name="${label}" title="Abrir lista en Moxfield">${label}</a>`;
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

    const url = new URL("https://api.scryfall.com/cards/named");
    url.searchParams.set("exact", cardName);

    let response = await fetch(url);
    if (!response.ok) {
      url.searchParams.delete("exact");
      url.searchParams.set("fuzzy", cardName);
      response = await fetch(url);
    }

    if (!response.ok) {
      const empty = { image: "", url: "" };
      scryfallImageCache.set(cardName, empty);
      return empty;
    }

    const payload = await response.json();
    const card = {
      image: imageFromScryfallPayload(payload),
      url: payload.scryfall_uri || ""
    };
    scryfallImageCache.set(cardName, card);
    return card;
  }

  function findDeckByCommander(commander) {
    const normalized = normalizeCommanderDisplay(commander || "").toLowerCase();
    if (!normalized) return null;

    return recordedDecks().find((deck) => normalizeCommanderDisplay(deck.commander || "").toLowerCase() === normalized) ||
      data.players
        .flatMap((player) => player.decks)
        .find((deck) => normalizeCommanderDisplay(deck.commander || "").toLowerCase() === normalized);
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

  function latestRecordedTable() {
    const tableRows = (data.tables || []).filter((table) => table.date);
    if (!tableRows.length) return null;
    const today = todayKey();
    const playableTables = tableRows.filter((table) => table.date <= today);
    const candidates = playableTables.length ? playableTables : tableRows;
    return [...candidates].sort((a, b) => compareRecentDate(a.date, b.date))[0] || null;
  }

  function latestTablePayload() {
    const latestTable = latestRecordedTable();
    if (!latestTable) return data.latestTable || {};
    const winners = tableWinners(latestTable);
    const primaryWinner = winners[0];

    return {
      title: latestTable.title || "Última mesa",
      date: latestTable.date || "Último estreno",
      winner: tableWinnerSummary(latestTable),
      deck: primaryWinner?.commander || "",
      videoUrl: latestTable.videoUrl || data.socials[0].url,
      colors: primaryWinner?.colors || [],
      cardImage: primaryWinner?.cardImage || "",
      cardUrl: primaryWinner?.cardUrl || ""
    };
  }

  function recordedDecks() {
    const tableRows = data.tables || [];
    const decks = new Map();

    tableRows.forEach((table) => {
      (table.participants || []).forEach((participant) => {
        const commander = normalizeCommanderDisplay(participant.commander || "");
        const colors = normalizedCommanderColors(commander, participant.colors || []);
        const key = [
          canonicalPlayerKey(participant.name || ""),
          commander.toLowerCase(),
          participant.moxfield || ""
        ].join("|");

        if (!participant.name || !participant.commander) return;

        const current = decks.get(key) || {
          commander,
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
        current.colors = colors.length ? colors : current.colors;
        current.cardImage = participant.cardImage || current.cardImage;
        current.cardUrl = participant.cardUrl || current.cardUrl;
        current.tables.add(table.id || table.title);
        decks.set(key, current);
      });
    });

    return [...decks.values()].map((deck) => ({
      ...deck,
      appearances: deck.tables.size,
      tables: [...deck.tables]
    }));
  }

  function recordedPlayers() {
    const players = new Map();

    recordedDecks().forEach((deck) => {
      const current = players.get(deck.playerId) || {
        id: deck.playerId,
        name: deck.player,
        handle: data.players.find((player) => canonicalPlayerName(player.name) === deck.player)?.handle || "",
        role: deck.role,
        signature: "",
        wins: 0,
        losses: 0,
        appearances: 0,
        lastPlayedAt: "",
        colors: [],
        decks: []
      };

      current.wins += Number(deck.wins || 0);
      current.losses += Number(deck.losses || 0);
      current.decks.push(deck);
      current.appearances += Number(deck.appearances || 0);
      if (!current.lastPlayedAt || compareRecentDate(deck.lastPlayedAt || "", current.lastPlayedAt) < 0) {
        current.lastPlayedAt = deck.lastPlayedAt || current.lastPlayedAt;
      }
      deck.colors.forEach((color) => {
        if (!current.colors.includes(color)) current.colors.push(color);
      });
      players.set(deck.playerId, current);
    });

    return [...players.values()];
  }

  function leaderboardCompare(a, b) {
    return winRate(b) - winRate(a) ||
      b.appearances - a.appearances ||
      compareRecentDate(a.lastPlayedAt, b.lastPlayedAt) ||
      b.wins - a.wins ||
      a.name.localeCompare(b.name);
  }

  function matchingDecks(player) {
    const query = state.query;

    return player.decks.filter((deck) => {
      const matchesQuery =
        !query ||
        player.name.toLowerCase().includes(query) ||
        deck.commander.toLowerCase().includes(query);
      const matchesColor = state.color === "all" || normalizeColors(deck.colors) === state.color;

      return matchesQuery && matchesColor;
    });
  }

  function manaPips(colors) {
    return `<span class="mana-row">${colors
      .map((color) => `<span class="mana ${color}" title="${colorNames[color]}">${color}</span>`)
      .join("")}</span>`;
  }

  function guildName(guildKey) {
    return colorOptionLabels[guildKey] || colorNames[guildKey] || "Colorless";
  }

  function guildStats() {
    const stats = new Map();

    recordedDecks().forEach((deck) => {
      const guildKey = normalizeColors(deck.colors || []) || "C";
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
    const filteredItems = items.filter((item) => item[metric] > 0);
    const page = pageItems(filteredItems, state.guildPages[metric] || 1);
    const visibleItems = page.items;
    const max = Math.max(...filteredItems.map((item) => item[metric]), 1);
    state.guildPages[metric] = page.currentPage;

    if (!visibleItems.length) {
      return '<p class="empty-state">Todavía no hay datos suficientes.</p>';
    }

    const pageOffset = page.start;
    return visibleItems
      .map((item, index) => {
        const width = Math.max(8, Math.round((item[metric] / max) * 100));
        return `
          <article class="guild-stat-card ${guildRankClass(pageOffset + index)}">
            <div class="guild-rank ${guildRankClass(pageOffset + index)}">${pageOffset + index + 1}</div>
            <div class="guild-stat-body">
              <div class="guild-stat-topline">
                <div>
                  <h4><button class="guild-link" type="button" data-guild-key="${item.key}">${guildName(item.key)}</button></h4>
                  <p>${item.key === "C" ? "Sin color" : item.key} | ${item.played} partidas | WR ${item.winRate}%</p>
                </div>
                <strong>${item[metric]}</strong>
              </div>
              ${item.key === "C" ? '<span class="mana-row"><span class="mana">C</span></span>' : manaPips(item.key.split(""))}
              <div class="guild-bar" aria-label="${guildName(item.key)} ${label}: ${item[metric]}">
                <span style="width: ${width}%; background: ${rateColor(metric === "losses" ? 100 - item.winRate : item.winRate)}"></span>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function playerSearchText(player) {
    return [
      player.name,
      ...player.decks.map((deck) => deck.commander)
    ]
      .join(" ")
      .toLowerCase();
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
        decks: b.decks.length - a.decks.length || leaderboardCompare(a, b),
        commander: (a.decks[0]?.commander || "").localeCompare(b.decks[0]?.commander || "")
      };

      const result = sorters[state.sort] || sorters.score;
      return state.sortDirection === "asc" ? -result : result;
    });
  }

  function filteredPlayers() {
    return recordedPlayers().filter((player) => {
      const matchesQuery = playerSearchText(player).includes(state.query);
      const matchesRole = state.role === "all" || player.role === state.role;
      const matchesColor = state.color === "all" || matchingDecks(player).length > 0;
      return matchesQuery && matchesRole && matchesColor;
    });
  }

  function filteredDecks() {
    return recordedDecks().filter((deck) => {
      const matchesQuery =
        !state.deckQuery ||
        deck.player.toLowerCase().includes(state.deckQuery) ||
        deck.commander.toLowerCase().includes(state.deckQuery) ||
        (deck.archetype || "").toLowerCase().includes(state.deckQuery);
      const matchesRole = state.role === "all" || deck.role === state.role;
      const deckColors = normalizeColors(deck.colors || []);
      const selectedColors = state.deckColors.join("");
      const matchesColor =
        !state.deckColors.length ||
        (state.deckColorMode === "exact" && deckColors === selectedColors) ||
        (state.deckColorMode === "includes" && state.deckColors.every((color) => deckColors.includes(color))) ||
        (state.deckColorMode === "any" && state.deckColors.some((color) => deckColors.includes(color)));

      return matchesQuery && matchesRole && matchesColor;
    });
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
    const totalGames = tableRows.length;
    const leaderboardPlayers = recordedPlayers();
    const guestCount = leaderboardPlayers.filter((player) => player.role !== "Host").length;
    const hostWins = tableRows.reduce((total, table) => (
      total + tableWinners(table).filter((winner) => playerRoleByName(winner.name) === "Host").length
    ), 0);
    const guestWins = tableRows.reduce((total, table) => (
      total + tableWinners(table).filter((winner) => playerRoleByName(winner.name) !== "Host").length
    ), 0);
    const rivalryTotal = hostWins + guestWins;
    const hostRate = rivalryTotal ? Math.round((hostWins / rivalryTotal) * 100) : 0;
    const guestRate = rivalryTotal ? 100 - hostRate : 0;
    const latestTable = latestTablePayload();
    const channelStats = data.channelStats || {};

    elements.seasonLabel.textContent = `${data.season} | Actualizado ${data.lastUpdated}`;
    elements.latestTableTitle.textContent = latestTable.title || "Última mesa";
    elements.latestTableMeta.textContent = latestTable.date || "";
    elements.latestTableWinner.textContent = latestTable.winner || "-";
    const latestDeck = findDeckByCommander(latestTable.deck) || {
      commander: latestTable.deck || "-",
      cardImage: latestTable.cardImage || "",
      cardUrl: latestTable.cardUrl || "",
      colors: latestTable.colors || []
    };
    elements.latestTableDeck.innerHTML = commanderLink(latestDeck);
    elements.latestTableDeckColors.innerHTML = latestDeck.colors?.length ? manaPips(latestDeck.colors) : "";
    elements.latestTableVideo.href = latestTable.videoUrl || data.socials[0].url;
    elements.totalGames.textContent = totalGames;
    elements.guestCount.textContent = guestCount;
    elements.subscriberCount.textContent = formatNumber(channelStats.subscribers);
    elements.subscriberStatus.textContent = "Actualizando...";
    elements.subscribeLink.href = channelStats.subscribeUrl || data.socials[0].url;
    elements.hostGuestScore.textContent = `${hostWins}-${guestWins}`;
    elements.hostGuestRate.textContent = `Hosts ${hostRate}% | Invitados ${guestRate}%`;

    elements.socialLinks.innerHTML = data.socials
      .map((social) => `<a href="${social.url}" target="_blank" rel="noreferrer">${social.label}</a>`)
      .join("");

    loadSubscriberCount();
  }

  function loadSubscriberCount() {
    const channelStats = data.channelStats || {};
    if (subscriberLoadStarted) return;
    if (!channelStats.youtubeApiKey || !channelStats.youtubeChannelId) {
      elements.subscriberStatus.textContent = "Dato manual";
      return;
    }
    subscriberLoadStarted = true;
    elements.subscriberStatus.textContent = "Consultando YouTube...";

    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("part", "statistics");
    url.searchParams.set("id", channelStats.youtubeChannelId);
    url.searchParams.set("key", channelStats.youtubeApiKey);
    url.searchParams.set("_", Date.now().toString());

    fetch(url, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache"
      }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((payload) => {
        const stats = payload.items?.[0]?.statistics;
        const count = stats?.subscriberCount;

        if (stats?.hiddenSubscriberCount || !count) {
          elements.subscriberCount.textContent = "Oculto";
          elements.subscriberStatus.textContent = "YouTube no publica el conteo";
          return;
        }

        elements.subscriberCount.textContent = count;
        elements.subscriberStatus.textContent = `YouTube ${formatUpdateTime()}`;
      })
      .catch((error) => {
        console.warn("No se pudo cargar el conteo de suscriptores.", error);
        elements.subscriberCount.textContent = formatNumber(channelStats.subscribers);
        elements.subscriberStatus.textContent = "No se pudo actualizar";
      });
  }

  function renderPodium() {
    const top = [...recordedPlayers()].sort(leaderboardCompare).slice(0, 3);

    elements.podium.innerHTML = top
      .map(
        (player, index) => {
          const mainDeck = player.decks[0];
          return `
          <article class="podium-card rank-card ${guildRankClass(index)}">
            <span class="podium-rank">${index + 1}</span>
            <div class="player-mini">
              <span class="avatar alt-${index}">${initials(player.name)}</span>
              <div>
                <h3>${player.name}</h3>
                <p>${player.handle} | ${player.role}</p>
              </div>
            </div>
            ${mainDeck ? `
              <div class="podium-commander">
                <span>Comandante</span>
                <strong>${commanderLink(mainDeck)}</strong>
                ${manaPips(mainDeck.colors)}
              </div>
            ` : ""}
            <div class="podium-stats">
              <div class="podium-stat">
                <span>Wins</span>
                <strong>${player.wins}</strong>
              </div>
              <div class="podium-stat">
                <span>Losses</span>
                <strong>${player.losses}</strong>
              </div>
              <div class="podium-stat">
                <span>Win rate</span>
                <strong>${winRate(player)}%</strong>
              </div>
            </div>
            <a class="profile-link" href="#" data-player-id="${player.id}">Ver perfil</a>
          </article>
        `;
        }
      )
      .join("");
  }

  function renderGuildStats() {
    const stats = guildStats();
    const byPlayed = [...stats].sort((a, b) => b.played - a.played || b.wins - a.wins || guildName(a.key).localeCompare(guildName(b.key)));
    const byWins = [...stats].sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || b.played - a.played);
    const byLosses = [...stats].sort((a, b) => b.losses - a.losses || b.played - a.played || guildName(a.key).localeCompare(guildName(b.key)));

    elements.guildPlayedStats.innerHTML = renderGuildStatList(byPlayed, "played", "partidas");
    elements.guildWinStats.innerHTML = renderGuildStatList(byWins, "wins", "wins");
    elements.guildLossStats.innerHTML = renderGuildStatList(byLosses, "losses", "losses");
    renderPagination(elements.guildPlayedPagination, "guild-played", byPlayed.filter((item) => item.played > 0).length, state.guildPages.played);
    renderPagination(elements.guildWinPagination, "guild-wins", byWins.filter((item) => item.wins > 0).length, state.guildPages.wins);
    renderPagination(elements.guildLossPagination, "guild-losses", byLosses.filter((item) => item.losses > 0).length, state.guildPages.losses);
  }

  function renderRows() {
    const players = rankedPlayers(filteredPlayers());
    const leaderboardRanks = new Map(
      [...filteredPlayers()]
        .sort(leaderboardCompare)
        .map((player, index) => [player.id, index + 1])
    );
    const page = pageItems(players, state.rankingPage);
    state.rankingPage = page.currentPage;

    if (!players.length) {
      elements.rows.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">No hay resultados con esos filtros.</td>
        </tr>
      `;
      renderPagination(elements.rankingPagination, "ranking", 0, 1);
      return;
    }

    elements.rows.innerHTML = page.items
      .map((player, index) => {
        const mainDeck = matchingDecks(player)[0] || player.decks[0];
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
                  <button class="person-button cell-title" type="button" data-player-id="${player.id}">${player.name}</button>
                  <span class="cell-sub">${player.handle} | ${player.role}</span>
                </span>
              </div>
            </td>
            <td data-label="Wins"><strong>${player.wins}</strong></td>
            <td data-label="Losses"><strong>${player.losses}</strong></td>
            <td data-label="Win rate">
              <strong>${rate}%</strong>
              <div class="rate-bar" aria-hidden="true"><span style="width: ${rate}%; background: ${color}"></span></div>
            </td>
            <td data-label="Decks">${player.decks.length}</td>
            <td data-label="Comandante">
              <span class="cell-title">${commanderLink(mainDeck)}</span>
              <span class="cell-sub">${manaPips(mainDeck.colors)}</span>
            </td>
            <td data-label="Video"><a class="deck-link compact-link" href="${mainDeck.videoUrl || data.socials[0].url}" target="_blank" rel="noreferrer">Watch Video</a></td>
          </tr>
        `;
      })
      .join("");
    renderPagination(elements.rankingPagination, "ranking", players.length, page.currentPage);
  }

  function renderDeckGrid() {
    const sorters = {
      date: (a, b) => (b.lastPlayedAt || "").localeCompare(a.lastPlayedAt || "") || a.commander.localeCompare(b.commander),
      name: (a, b) => a.commander.localeCompare(b.commander),
      wins: (a, b) => b.wins - a.wins || a.commander.localeCompare(b.commander),
      losses: (a, b) => b.losses - a.losses || a.commander.localeCompare(b.commander)
    };
    const decks = filteredDecks().sort(sorters[state.deckSort] || sorters.date);
    const page = pageItems(decks, state.deckPage, deckPageSize);
    state.deckPage = page.currentPage;

    if (!decks.length) {
      elements.deckGrid.innerHTML = '<p class="empty-state">No hay decks registrados en mesas guardadas con esos filtros.</p>';
      renderPagination(elements.deckPagination, "decks", 0, 1, deckPageSize);
      return;
    }

    elements.deckGrid.innerHTML = page.items
      .map(
        (deck) => `
          <article class="deck-card">
            <div class="deck-topline">
              <div>
                <h3>${commanderLink(deck)}</h3>
                <p>${deck.player} | ${deck.archetype}</p>
                <p class="deck-meta">${deck.tableDate || "Sin fecha"} | ${deck.tableTitle || "Mesa guardada"}</p>
              </div>
              <span class="tag" style="background: ${rateColor(deckWinRate(deck))}" title="Wins-Losses">${deck.wins}-${deck.losses}</span>
            </div>
            ${manaPips(deck.colors)}
            <div class="deck-actions">
              <a class="deck-link" href="${deck.moxfield}" target="_blank" rel="noreferrer">Moxfield</a>
              <a class="deck-link" href="${deck.videoUrl || data.socials[0].url}" target="_blank" rel="noreferrer">Watch Video</a>
            </div>
          </article>
        `
      )
      .join("");
    renderPagination(elements.deckPagination, "decks", decks.length, page.currentPage, deckPageSize);
  }

  function showPlayer(playerId) {
    const player = recordedPlayers().find((item) => item.id === playerId);
    if (!player) return;

    elements.dialogContent.innerHTML = `
      <div class="dialog-hero">
        <span class="avatar">${initials(player.name)}</span>
        <div>
          <span class="section-kicker">${player.role}</span>
          <h2>${player.name}</h2>
          ${player.handle ? `<p class="profile-handle">${player.handle}</p>` : ""}
          ${player.signature ? `<p class="empty-state">${player.signature}</p>` : ""}
        </div>
      </div>
      <div class="dialog-body">
        <div class="dialog-stats">
          <div class="dialog-stat"><span>Wins</span><strong>${player.wins}</strong></div>
          <div class="dialog-stat"><span>Losses</span><strong>${player.losses}</strong></div>
          <div class="dialog-stat"><span>Win rate</span><strong>${winRate(player)}%</strong></div>
          <div class="dialog-stat"><span>Decks</span><strong>${player.decks.length}</strong></div>
        </div>
        ${player.decks
          .map(
            (deck) => `
              <article class="dialog-deck">
                <div>
                  <h3>${commanderLink(deck)}</h3>
                  <p class="empty-state">${deck.archetype} | ${deck.wins}-${deck.losses}</p>
                  ${manaPips(deck.colors)}
                </div>
                <div class="deck-actions">
                  <a class="deck-link" href="${deck.moxfield}" target="_blank" rel="noreferrer">Moxfield</a>
                  <a class="deck-link" href="${deck.videoUrl || data.socials[0].url}" target="_blank" rel="noreferrer">Watch Video</a>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    `;

    elements.dialog.showModal();
  }

  function showGuild(guildKey) {
    const decks = recordedDecks()
      .filter((deck) => (normalizeColors(deck.colors || []) || "C") === guildKey)
      .sort((a, b) => b.wins - a.wins || deckWinRate(b) - deckWinRate(a) || a.commander.localeCompare(b.commander));

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
              <p class="empty-state">${deck.player} | ${deck.archetype} | ${deck.wins}-${deck.losses}</p>
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
    renderPodium();
    renderGuildStats();
    renderRows();
    renderDeckGrid();
  }

  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    state.rankingPage = 1;
    render();
  });

  elements.role.addEventListener("change", (event) => {
    state.role = event.target.value;
    state.rankingPage = 1;
    render();
  });

  elements.color.addEventListener("change", (event) => {
    state.color = event.target.value;
    state.rankingPage = 1;
    render();
  });

  document.querySelectorAll(".table-sort").forEach((button) => {
    button.addEventListener("click", () => {
      const nextSort = button.dataset.sort;
      if (state.sort === nextSort) {
        state.sortDirection = state.sortDirection === "desc" ? "asc" : "desc";
      } else {
        state.sort = nextSort;
        state.sortDirection = ["player", "commander"].includes(nextSort) ? "asc" : "desc";
      }
      state.rankingPage = 1;

      document.querySelectorAll(".table-sort").forEach((item) => {
        item.classList.toggle("is-active", item.dataset.sort === state.sort);
        item.dataset.direction = item.dataset.sort === state.sort ? state.sortDirection : "";
      });
      renderRows();
    });
  });

  elements.deckSearch.addEventListener("input", (event) => {
    state.deckQuery = event.target.value.trim().toLowerCase();
    state.deckPage = 1;
    renderDeckGrid();
  });

  document.querySelectorAll(".deck-color-filter input").forEach((input) => {
    input.addEventListener("change", () => {
      state.deckColors = colorOrder.filter((color) =>
        document.querySelector(`.deck-color-filter input[value="${color}"]`)?.checked
      );
      state.deckPage = 1;
      renderDeckGrid();
    });
  });

  elements.deckColorMode.addEventListener("change", (event) => {
    state.deckColorMode = event.target.value;
    state.deckPage = 1;
    renderDeckGrid();
  });

  elements.deckSort.addEventListener("change", (event) => {
    state.deckSort = event.target.value;
    state.deckPage = 1;
    renderDeckGrid();
  });

  document.addEventListener("click", (event) => {
    const pageButton = event.target.closest("[data-page-target]");
    if (pageButton) {
      const nextPage = Number(pageButton.dataset.page);
      const target = pageButton.dataset.pageTarget;

      if (target === "ranking") {
        state.rankingPage = nextPage;
        renderRows();
      }
      if (target === "decks") {
        state.deckPage = nextPage;
        renderDeckGrid();
      }
      if (target === "guild-played") {
        state.guildPages.played = nextPage;
        renderGuildStats();
      }
      if (target === "guild-wins") {
        state.guildPages.wins = nextPage;
        renderGuildStats();
      }
      if (target === "guild-losses") {
        state.guildPages.losses = nextPage;
        renderGuildStats();
      }
      return;
    }

    const guildLink = event.target.closest("[data-guild-key]");
    if (guildLink) {
      event.preventDefault();
      showGuild(guildLink.dataset.guildKey);
      return;
    }

    const profileLink = event.target.closest("[data-player-id]");
    if (!profileLink) return;

    event.preventDefault();
    showPlayer(profileLink.dataset.playerId);
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
    const activeDialog = elements.guildDialog.open ? elements.guildDialog : elements.dialog.open ? elements.dialog : document.body;
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

    showCardPreview(`<img src="${link.dataset.cardImage}" alt="${link.dataset.cardName}">`, event);
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

  elements.closeDialog.addEventListener("click", () => {
    elements.dialog.close();
  });

  elements.closeGuildDialog.addEventListener("click", () => {
    elements.guildDialog.close();
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

  window.addEventListener("hashchange", updateActiveNav);

  window.getLeaderboardData = function () {
    return JSON.parse(JSON.stringify(data));
  };

  window.setLeaderboardData = function (nextData) {
    const existingStats = data.channelStats || {};
    nextData.channelStats = {
      ...existingStats,
      ...(nextData.channelStats || {}),
      youtubeApiKey: nextData.channelStats?.youtubeApiKey || existingStats.youtubeApiKey,
      youtubeChannelId: nextData.channelStats?.youtubeChannelId || existingStats.youtubeChannelId
    };
    subscriberLoadStarted = false;
    data = nextData;
    window.MALEDucadosData = nextData;
    render();
  };

  renderColorOptions();
  render();
  updateActiveNav();
})();
