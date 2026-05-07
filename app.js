(function () {
  let data = window.MALEDucadosData;
  let subscriberLoadStarted = false;
  const scryfallImageCache = new Map();
  const state = {
    query: "",
    role: "all",
    color: "all",
    sort: "score"
  };

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
    rows: document.querySelector("#leaderboardRows"),
    deckGrid: document.querySelector("#deckGrid"),
    search: document.querySelector("#searchInput"),
    role: document.querySelector("#roleFilter"),
    color: document.querySelector("#colorFilter"),
    sort: document.querySelector("#sortSelect"),
    dialog: document.querySelector("#playerDialog"),
    dialogContent: document.querySelector("#dialogContent"),
    closeDialog: document.querySelector("#closeDialog"),
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

  function commanderLink(deck) {
    const href = deck.cardUrl || `https://scryfall.com/search?as=grid&order=name&q=!%22${encodeURIComponent(deck.commander || "Commander")}%22`;
    const image = deck.cardImage || "";
    const label = deck.commander || "Commander";
    return `<a class="commander-link" href="${href}" target="_blank" rel="noreferrer" data-card-image="${image}" data-card-url="${deck.cardUrl || ""}" data-card-name="${label}" title="Ver carta en Scryfall">${label}</a>`;
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
    const normalized = commander?.trim().toLowerCase();
    if (!normalized) return null;

    return data.players
      .flatMap((player) => player.decks)
      .find((deck) => deck.commander?.trim().toLowerCase() === normalized);
  }

  function score(player) {
    return player.wins * 4 + winRate(player) + player.appearances * 2;
  }

  function allDecks(players = data.players) {
    return players.flatMap((player) =>
      player.decks.map((deck) => ({
        ...deck,
        player: player.name,
        playerId: player.id
      }))
    );
  }

  function playerRoleByName(playerName) {
    const player = data.players.find((item) => item.name.trim().toLowerCase() === playerName.trim().toLowerCase());
    return player?.role || "Invitado";
  }

  function recordedDecks() {
    const tableRows = data.tables || [];
    const decks = new Map();

    tableRows.forEach((table) => {
      (table.participants || []).forEach((participant) => {
        const key = [
          participant.name?.trim().toLowerCase(),
          participant.commander?.trim().toLowerCase(),
          participant.moxfield || ""
        ].join("|");

        if (!participant.name || !participant.commander) return;

        const current = decks.get(key) || {
          commander: participant.commander,
          archetype: participant.archetype || "Commander",
          colors: participant.colors || [],
          wins: 0,
          losses: 0,
          moxfield: participant.moxfield || "https://moxfield.com/users/LosMaleducadosDelMagic",
          videoUrl: table.videoUrl || data.socials[0].url,
          cardImage: participant.cardImage || "",
          cardUrl: participant.cardUrl || "",
          player: participant.name,
          playerId: slugify(participant.name || "jugador"),
          role: playerRoleByName(participant.name)
        };

        if (participant.id === table.winnerId) {
          current.wins += 1;
        } else {
          current.losses += 1;
        }

        current.videoUrl = table.videoUrl || current.videoUrl;
        current.colors = participant.colors?.length ? participant.colors : current.colors;
        current.cardImage = participant.cardImage || current.cardImage;
        current.cardUrl = participant.cardUrl || current.cardUrl;
        decks.set(key, current);
      });
    });

    return [...decks.values()];
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

  function renderGuildStatList(items, metric, label) {
    const visibleItems = items.filter((item) => item[metric] > 0).slice(0, 6);
    const max = Math.max(...visibleItems.map((item) => item[metric]), 1);

    if (!visibleItems.length) {
      return '<p class="empty-state">Todavía no hay datos suficientes.</p>';
    }

    return visibleItems
      .map((item, index) => {
        const width = Math.max(8, Math.round((item[metric] / max) * 100));
        return `
          <article class="guild-stat-card">
            <div class="guild-rank">${index + 1}</div>
            <div class="guild-stat-body">
              <div class="guild-stat-topline">
                <div>
                  <h4>${guildName(item.key)}</h4>
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
        score: score(b) - score(a),
        wins: b.wins - a.wins || winRate(b) - winRate(a),
        winrate: winRate(b) - winRate(a) || b.wins - a.wins,
        appearances: b.appearances - a.appearances || b.wins - a.wins,
        decks: b.decks.length - a.decks.length || b.wins - a.wins
      };

      return sorters[state.sort] || sorters.score;
    });
  }

  function filteredPlayers() {
    return data.players.filter((player) => {
      const matchesQuery = playerSearchText(player).includes(state.query);
      const matchesRole = state.role === "all" || player.role === state.role;
      const matchesColor = state.color === "all" || matchingDecks(player).length > 0;
      return matchesQuery && matchesRole && matchesColor;
    });
  }

  function filteredDecks() {
    return recordedDecks().filter((deck) => {
      const matchesQuery =
        !state.query ||
        deck.player.toLowerCase().includes(state.query) ||
        deck.commander.toLowerCase().includes(state.query);
      const matchesRole = state.role === "all" || deck.role === state.role;
      const matchesColor = state.color === "all" || normalizeColors(deck.colors || []) === state.color;

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
    const players = data.players;
    const tableRows = data.tables || [];
    const totalGames = tableRows.length;
    const guestCount = players.filter((player) => player.role !== "Host").length;
    const hostWins = tableRows.filter((table) => {
      const winner = table.participants?.find((participant) => participant.id === table.winnerId);
      return winner && playerRoleByName(winner.name) === "Host";
    }).length;
    const guestWins = tableRows.filter((table) => {
      const winner = table.participants?.find((participant) => participant.id === table.winnerId);
      return winner && playerRoleByName(winner.name) !== "Host";
    }).length;
    const rivalryTotal = hostWins + guestWins;
    const hostRate = rivalryTotal ? Math.round((hostWins / rivalryTotal) * 100) : 0;
    const guestRate = rivalryTotal ? 100 - hostRate : 0;
    const latestTable = data.latestTable || {};
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
    const top = rankedPlayers(data.players).slice(0, 3);

    elements.podium.innerHTML = top
      .map(
        (player, index) => {
          const mainDeck = player.decks[0];
          return `
          <article class="podium-card">
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
  }

  function renderRows() {
    const players = rankedPlayers(filteredPlayers());

    if (!players.length) {
      elements.rows.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">No hay resultados con esos filtros.</td>
        </tr>
      `;
      return;
    }

    elements.rows.innerHTML = players
      .map((player, index) => {
        const mainDeck = matchingDecks(player)[0] || player.decks[0];
        const rate = winRate(player);
        const color = rateColor(rate);
        return `
          <tr>
            <td data-label="Rank"><span class="rank-pill">${index + 1}</span></td>
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
  }

  function renderDeckGrid() {
    const decks = filteredDecks().sort((a, b) => b.wins - a.wins || a.commander.localeCompare(b.commander));

    if (!decks.length) {
      elements.deckGrid.innerHTML = '<p class="empty-state">No hay decks registrados en mesas guardadas con esos filtros.</p>';
      return;
    }

    elements.deckGrid.innerHTML = decks
      .map(
        (deck) => `
          <article class="deck-card">
            <div class="deck-topline">
              <div>
                <h3>${commanderLink(deck)}</h3>
                <p>${deck.player} | ${deck.archetype}</p>
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
  }

  function showPlayer(playerId) {
    const player = data.players.find((item) => item.id === playerId);
    if (!player) return;

    elements.dialogContent.innerHTML = `
      <div class="dialog-hero">
        <span class="avatar">${initials(player.name)}</span>
        <div>
          <span class="section-kicker">${player.role}</span>
          <h2>${player.name}</h2>
          <p class="empty-state">${player.signature}</p>
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

  function render() {
    renderMetrics();
    renderPodium();
    renderGuildStats();
    renderRows();
    renderDeckGrid();
  }

  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });

  elements.role.addEventListener("change", (event) => {
    state.role = event.target.value;
    render();
  });

  elements.color.addEventListener("change", (event) => {
    state.color = event.target.value;
    render();
  });

  elements.sort.addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });

  document.addEventListener("click", (event) => {
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

  elements.dialog.addEventListener("click", (event) => {
    if (event.target === elements.dialog) {
      elements.dialog.close();
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
