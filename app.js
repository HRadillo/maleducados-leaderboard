(function () {
  let data = window.MALEDucadosData;
  let subscriberLoadStarted = false;
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

  const elements = {
    seasonLabel: document.querySelector("#seasonLabel"),
    latestTableTitle: document.querySelector("#latestTableTitle"),
    latestTableMeta: document.querySelector("#latestTableMeta"),
    latestTableWinner: document.querySelector("#latestTableWinner"),
    latestTableDeck: document.querySelector("#latestTableDeck"),
    latestTableVideo: document.querySelector("#latestTableVideo"),
    totalGames: document.querySelector("#totalGames"),
    guestCount: document.querySelector("#guestCount"),
    subscriberCount: document.querySelector("#subscriberCount"),
    subscribeLink: document.querySelector("#subscribeLink"),
    socialLinks: document.querySelector("#socialLinks"),
    podium: document.querySelector("#podium"),
    rows: document.querySelector("#leaderboardRows"),
    deckGrid: document.querySelector("#deckGrid"),
    search: document.querySelector("#searchInput"),
    role: document.querySelector("#roleFilter"),
    color: document.querySelector("#colorFilter"),
    sort: document.querySelector("#sortSelect"),
    dialog: document.querySelector("#playerDialog"),
    dialogContent: document.querySelector("#dialogContent"),
    closeDialog: document.querySelector("#closeDialog")
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

  function rateColor(rate) {
    const hue = Math.round((rate / 100) * 138);
    return `hsl(${hue}, 72%, 64%)`;
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
    return filteredPlayers()
      .flatMap((player) =>
        matchingDecks(player).map((deck) => ({
          ...deck,
          player: player.name,
          playerId: player.id
        }))
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
    const players = data.players;
    const totalGames = players.reduce((sum, player) => sum + player.wins, 0);
    const guestCount = players.filter((player) => player.role !== "Host").length;
    const latestTable = data.latestTable || {};
    const channelStats = data.channelStats || {};

    elements.seasonLabel.textContent = `${data.season} | Actualizado ${data.lastUpdated}`;
    elements.latestTableTitle.textContent = latestTable.title || "Última mesa";
    elements.latestTableMeta.textContent = latestTable.date || "";
    elements.latestTableWinner.textContent = latestTable.winner || "-";
    elements.latestTableDeck.textContent = latestTable.deck || "-";
    elements.latestTableVideo.href = latestTable.videoUrl || data.socials[0].url;
    elements.totalGames.textContent = totalGames;
    elements.guestCount.textContent = guestCount;
    elements.subscriberCount.textContent = formatNumber(channelStats.subscribers);
    elements.subscribeLink.href = channelStats.subscribeUrl || data.socials[0].url;

    elements.socialLinks.innerHTML = data.socials
      .map((social) => `<a href="${social.url}" target="_blank" rel="noreferrer">${social.label}</a>`)
      .join("");

    loadSubscriberCount();
  }

  function loadSubscriberCount() {
    const channelStats = data.channelStats || {};
    if (subscriberLoadStarted) return;
    if (!channelStats.youtubeApiKey || !channelStats.youtubeChannelId) return;
    subscriberLoadStarted = true;

    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("part", "statistics");
    url.searchParams.set("id", channelStats.youtubeChannelId);
    url.searchParams.set("key", channelStats.youtubeApiKey);

    fetch(url)
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((payload) => {
        const count = payload.items?.[0]?.statistics?.subscriberCount;
        if (count) elements.subscriberCount.textContent = formatNumber(Number(count));
      })
      .catch(() => {
        elements.subscriberCount.textContent = formatNumber(channelStats.subscribers);
      });
  }

  function renderPodium() {
    const top = rankedPlayers(data.players).slice(0, 3);

    elements.podium.innerHTML = top
      .map(
        (player, index) => `
          <article class="podium-card">
            <span class="podium-rank">${index + 1}</span>
            <div class="player-mini">
              <span class="avatar alt-${index}">${initials(player.name)}</span>
              <div>
                <h3>${player.name}</h3>
                <p>${player.handle} | ${player.role}</p>
              </div>
            </div>
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
        `
      )
      .join("");
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
            <td><span class="rank-pill">${index + 1}</span></td>
            <td>
              <div class="player-cell">
                <span class="avatar alt-${index % 3}">${initials(player.name)}</span>
                <span>
                  <button class="person-button cell-title" type="button" data-player-id="${player.id}">${player.name}</button>
                  <span class="cell-sub">${player.handle} | ${player.role}</span>
                </span>
              </div>
            </td>
            <td><strong>${player.wins}</strong></td>
            <td><strong>${player.losses}</strong></td>
            <td>
              <strong>${rate}%</strong>
              <div class="rate-bar" aria-hidden="true"><span style="width: ${rate}%; background: ${color}"></span></div>
            </td>
            <td>${player.decks.length}</td>
            <td>
              <span class="cell-title">${mainDeck.commander}</span>
              <span class="cell-sub">${manaPips(mainDeck.colors)}</span>
            </td>
            <td><a class="deck-link compact-link" href="${mainDeck.videoUrl || data.socials[0].url}" target="_blank" rel="noreferrer">Watch Video</a></td>
          </tr>
        `;
      })
      .join("");
  }

  function renderDeckGrid() {
    const decks = filteredDecks().sort((a, b) => b.wins - a.wins || a.commander.localeCompare(b.commander));

    if (!decks.length) {
      elements.deckGrid.innerHTML = '<p class="empty-state">No hay decks con esos filtros.</p>';
      return;
    }

    elements.deckGrid.innerHTML = decks
      .map(
        (deck) => `
          <article class="deck-card">
            <div class="deck-topline">
              <div>
                <h3>${deck.commander}</h3>
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
                  <h3>${deck.commander}</h3>
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
    data = nextData;
    window.MALEDucadosData = nextData;
    render();
  };

  renderColorOptions();
  render();
  updateActiveNav();
})();
