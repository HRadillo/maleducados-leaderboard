const firebaseSetup = window.MALEDucadosFirebaseConfig;
const allowedColors = ["W", "U", "B", "R", "G"];

const nodes = {
  locked: document.querySelector("#adminLocked"),
  panel: document.querySelector("#adminPanel"),
  login: document.querySelector("#adminLogin"),
  logout: document.querySelector("#adminLogout"),
  status: document.querySelector("#adminStatus"),
  message: document.querySelector("#adminMessage"),
  settingsForm: document.querySelector("#siteSettingsForm"),
  tableList: document.querySelector("#tableList"),
  tableForm: document.querySelector("#tableForm"),
  tableFormTitle: document.querySelector("#tableFormTitle"),
  newTable: document.querySelector("#newTable"),
  deleteTable: document.querySelector("#deleteTable"),
  addParticipant: document.querySelector("#addParticipant"),
  participantList: document.querySelector("#participantList"),
  json: document.querySelector("#adminJson"),
  loadJson: document.querySelector("#loadJson"),
  saveJson: document.querySelector("#saveJson")
};

let firebaseApi = null;
let currentUser = null;
let selectedTableId = "";
let draftParticipants = [];
let editingFreshTable = false;

nodes.login.disabled = true;
nodes.login.textContent = "Cargando Google...";

function setMessage(text, type = "info") {
  nodes.message.textContent = text;
  nodes.message.dataset.type = type;
}

function friendlyAuthError(error) {
  const code = error?.code || "";

  if (code === "auth/unauthorized-domain") {
    return "Firebase está rechazando este dominio. En Authentication > Settings > Authorized domains agrega el dominio donde está publicada la página.";
  }

  if (code === "auth/operation-not-allowed") {
    return "Google todavía no está activado como método de inicio de sesión en Firebase Authentication.";
  }

  if (code === "auth/popup-blocked") {
    return "El navegador bloqueó el popup. Voy a intentar iniciar sesión con redirección.";
  }

  if (code === "auth/popup-closed-by-user") {
    return "El popup se cerró antes de terminar.";
  }

  return error?.message || "No se pudo iniciar sesión.";
}

function getCurrentData() {
  return window.getLeaderboardData ? window.getLeaderboardData() : window.MALEDucadosData;
}

function fillJsonEditor() {
  nodes.json.value = JSON.stringify(getCurrentData(), null, 2);
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeColors(colors = []) {
  return allowedColors.filter((color) => colors.includes(color));
}

function colorsToText(colors) {
  return allowedColors.filter((color) => colors?.includes(color)).join("");
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

function mergeColors(...colorSets) {
  return allowedColors.filter((color) => colorSets.flat().includes(color));
}

function formatDateInput(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  return date.toISOString().slice(0, 10);
}

function escapeAttribute(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function scryfallCardFromPayload(payload) {
  let image = payload.image_uris?.large || payload.image_uris?.normal || "";

  if (!image) {
    const face = payload.card_faces?.find((cardFace) => cardFace.image_uris?.large || cardFace.image_uris?.normal);
    image = face?.image_uris?.large || face?.image_uris?.normal || "";
  }

  return {
    colors: normalizeColors(payload.color_identity || []),
    image,
    url: payload.scryfall_uri || ""
  };
}

async function fetchCommanderCard(commander) {
  const url = new URL("https://api.scryfall.com/cards/named");
  url.searchParams.set("exact", commander);

  let response = await fetch(url);
  if (!response.ok) {
    url.searchParams.delete("exact");
    url.searchParams.set("fuzzy", commander);
    response = await fetch(url);
  }

  if (!response.ok) return { colors: [], image: "", url: "" };

  return scryfallCardFromPayload(await response.json());
}

async function fetchCommanderCards(commander) {
  const names = splitCommanderNames(commander);
  const cards = await Promise.all(names.map((name) => fetchCommanderCard(name).catch(() => ({ colors: [], image: "", url: "" }))));
  return {
    colors: mergeColors(...cards.map((card) => card.colors)),
    image: cards[0]?.image || "",
    url: cards[0]?.url || ""
  };
}

function extractMoxfieldDeckId(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/decks\/([^/?#]+)/);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

function commanderFromMoxfieldPayload(payload) {
  const commanderEntries = [
    payload.commanders,
    payload.commander,
    payload.main,
    payload.boards?.commanders,
    payload.boards?.commandzone,
    payload.boards?.mainboard
  ];

  for (const entry of commanderEntries) {
    if (!entry) continue;
    const cards = Array.isArray(entry) ? entry : Object.values(entry);
    const commanders = cards
      .map((item) => item.card || item)
      .filter((card) => card?.name && (card.type_line || card.type || "").toLowerCase().includes("legendary"));
    if (commanders.length) return commanders.map((commander) => commander.name).join(" & ");
  }

  return payload.commanderName || payload.main?.name || "";
}

function cleanDescriptionText(value = "") {
  return value
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[•◆◇🔹🔷▪▫■□●○]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchMoxfieldDeck(moxfieldUrl) {
  const deckId = extractMoxfieldDeckId(moxfieldUrl);
  if (!deckId) return null;

  const response = await fetch(`https://api2.moxfield.com/v2/decks/all/${deckId}`, {
    cache: "no-store"
  });
  if (!response.ok) return null;

  const payload = await response.json();
  return {
    commander: normalizeCommanderDisplay(commanderFromMoxfieldPayload(payload)),
    name: payload.name || "",
    archetype: payload.format || "Commander"
  };
}

function extractYouTubeVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.split("/").filter(Boolean)[0] || "";
    if (parsed.searchParams.get("v")) return parsed.searchParams.get("v");
    const shorts = parsed.pathname.match(/\/shorts\/([^/?#]+)/);
    if (shorts) return shorts[1];
    const embed = parsed.pathname.match(/\/embed\/([^/?#]+)/);
    if (embed) return embed[1];
    return "";
  } catch {
    return "";
  }
}

async function fetchYouTubeVideo(videoUrl) {
  const data = getCurrentData();
  const apiKey = data.channelStats?.youtubeApiKey;
  const videoId = extractYouTubeVideoId(videoUrl);
  if (!apiKey || !videoId) return null;

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("_", Date.now().toString());

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;

  const snippet = (await response.json()).items?.[0]?.snippet;
  if (!snippet) return null;

  return {
    title: snippet.title || "",
    publishedAt: formatDateInput(snippet.publishedAt),
    description: snippet.description || ""
  };
}

function descriptionSections(description = "") {
  const lines = description.split(/\r?\n/);
  const playerLines = [];
  const deckLines = [];
  const socialLines = [];
  let mode = "";

  lines.forEach((line) => {
    const lower = line.toLowerCase();
    if (/jugadores|jugadores de la mesa|players/.test(lower)) {
      mode = "players";
      return;
    }
    if (/listas|decks|moxfield/.test(lower)) {
      mode = "decks";
    }
    if (/redes|síguelos|siguelos|instagram|tiktok/.test(lower)) {
      mode = "socials";
    }
    if (!line.trim()) return;
    if (mode === "players") playerLines.push(line);
    if (mode === "decks") deckLines.push(line);
    if (mode === "socials") socialLines.push(line);
  });

  return { playerLines, deckLines, socialLines };
}

function parsePlayerLine(line) {
  const clean = cleanDescriptionText(line);
  const parts = clean.split(/\s[-–—]\s/);
  if (parts.length < 2) return null;

  return {
    name: parts[0].trim(),
    commander: normalizeCommanderDisplay(parts.slice(1).join(" - ").replace(/\s*\+\s*Folk Hero/i, "").trim())
  };
}

function parseDeckLine(line) {
  const clean = cleanDescriptionText(line);
  let url = clean.match(/https?:\/\/(?:www\.)?moxfield\.com\/decks\/[^\s)]+/i)?.[0] || "";
  if (!url) return null;
  url = url.replace(/[.,;]+$/g, "");
  const isTruncated = /(?:\.{3}|…)$/.test(url);
  if (isTruncated) url = url.replace(/(?:\.{3}|…)$/g, "");
  const label = clean.split(url)[0].replace(/[:\-–—]+$/g, "").trim();
  const deckNumber = Number(label.match(/deck\s*(\d+)/i)?.[1] || "");
  return { label, url, deckNumber, isTruncated };
}

function parseSocialLine(line) {
  const clean = cleanDescriptionText(line);
  const handle = clean.match(/@[\w.\-]+/)?.[0] || "";
  if (!handle) return null;
  const name = clean.split(/→|->|instagram|tiktok/i)[0].trim();
  return { name, handle };
}

function sameLooseName(left = "", right = "") {
  const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9áéíóúñü]+/gi, "");
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

function participantsFromDescription(description = "") {
  const { playerLines, deckLines, socialLines } = descriptionSections(description);
  const deckLinks = deckLines.map(parseDeckLine).filter(Boolean);
  const socials = socialLines.map(parseSocialLine).filter(Boolean);

  return playerLines
    .map(parsePlayerLine)
    .filter(Boolean)
    .map((participant, index) => {
      const namedDeckLink = deckLinks.find((deck) =>
        sameLooseName(deck.label, participant.commander) ||
        sameLooseName(deck.label, participant.name) ||
        sameLooseName(participant.commander.split(",")[0], deck.label)
      );
      const numberedDeckLink = deckLinks.find((deck) => deck.deckNumber === index + 1);
      const orderedDeckLink = deckLinks[index];
      const deckLink = namedDeckLink || numberedDeckLink || orderedDeckLink;
      const social = socials.find((item) => sameLooseName(item.name, participant.name));

      return {
        ...emptyParticipant(),
        name: participant.name,
        handle: social?.handle || "",
        commander: participant.commander,
        moxfield: deckLink?.isTruncated ? "" : deckLink?.url || ""
      };
    });
}

function playerById(data, playerId) {
  return data.players.find((player) => player.id === playerId);
}

function findPlayerByName(data, name) {
  return data.players.find((player) => player.name.trim().toLowerCase() === name.trim().toLowerCase());
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
  return names.length ? names.join(" y ") : "Sin ganador";
}

function playerSuggestions() {
  return getCurrentData().players
    .map((player) => `<option value="${escapeAttribute(player.name)}"></option>`)
    .join("");
}

function ensurePlayer(data, participant) {
  const name = participant.name.trim();
  let player = findPlayerByName(data, name);

  if (!player) {
    let id = slugify(name);
    if (playerById(data, id)) id = `${id}-${Date.now()}`;
    player = {
      id,
      name,
      handle: participant.handle.trim(),
      role: "Invitado",
      appearances: 0,
      wins: 0,
      losses: 0,
      latestAppearance: "",
      signature: "",
      colors: [],
      decks: []
    };
    data.players.push(player);
  }

  if (participant.handle.trim()) player.handle = participant.handle.trim();
  return player;
}

function findDeck(player, participant) {
  return player.decks.find((deck) =>
    normalizeCommanderDisplay(deck.commander).toLowerCase() === normalizeCommanderDisplay(participant.commander).toLowerCase() &&
    (!participant.moxfield || deck.moxfield === participant.moxfield)
  );
}

function recomputePlayer(player) {
  const totals = player.decks.reduce(
    (accumulator, deck) => {
      accumulator.wins += Number(deck.wins || 0);
      accumulator.losses += Number(deck.losses || 0);
      deck.colors.forEach((color) => accumulator.colors.add(color));
      return accumulator;
    },
    { wins: 0, losses: 0, colors: new Set() }
  );

  player.wins = totals.wins;
  player.losses = totals.losses;
  player.appearances = totals.wins + totals.losses;
  player.colors = allowedColors.filter((color) => totals.colors.has(color));
}

function recomputeAll(data) {
  data.players.forEach(recomputePlayer);
}

function applyTableToAggregates(data, table, direction = 1) {
  table.participants.forEach((participant) => {
    const player = ensurePlayer(data, participant);
    let deck = findDeck(player, participant);

    if (!deck) {
      deck = {
        commander: normalizeCommanderDisplay(participant.commander),
        archetype: participant.archetype || "Commander",
        colors: participant.colors || [],
        wins: 0,
        losses: 0,
        moxfield: participant.moxfield || "https://moxfield.com/users/LosMaleducadosDelMagic",
        videoUrl: table.videoUrl,
        cardImage: participant.cardImage || "",
        cardUrl: participant.cardUrl || ""
      };
      player.decks.push(deck);
    }

    deck.commander = normalizeCommanderDisplay(participant.commander || deck.commander || "");
    deck.colors = participant.colors || deck.colors || [];
    deck.cardImage = participant.cardImage || deck.cardImage || "";
    deck.cardUrl = participant.cardUrl || deck.cardUrl || "";
    deck.moxfield = participant.moxfield || deck.moxfield;
    deck.videoUrl = table.videoUrl || deck.videoUrl;

    const winnerIds = tableWinnerIds(table);
    if (isTieTable(table)) {
      deck.wins = Math.max(0, Number(deck.wins || 0));
      deck.losses = Math.max(0, Number(deck.losses || 0));
    } else if (winnerIds.includes(participant.id)) {
      deck.wins = Math.max(0, Number(deck.wins || 0) + direction);
    } else {
      deck.losses = Math.max(0, Number(deck.losses || 0) + direction);
    }

    player.latestAppearance = table.title;
  });

  data.players.forEach((player) => {
    player.decks = player.decks.filter((deck) => Number(deck.wins || 0) + Number(deck.losses || 0) > 0);
  });
  recomputeAll(data);
}

function renderSettingsForm() {
  const data = getCurrentData();
  const latestTable = data.latestTable || {};
  const fields = nodes.settingsForm.elements;

  fields.season.value = data.season || "";
  fields.lastUpdated.value = data.lastUpdated || "";
  fields.latestTitle.value = latestTable.title || "";
  fields.latestDate.value = formatDateInput(latestTable.date);
  fields.latestWinner.value = latestTable.winner || "";
  fields.latestDeck.value = latestTable.deck || "";
  fields.latestVideo.value = latestTable.videoUrl || "";
}

function tables(data) {
  data.tables ||= [];
  return data.tables;
}

function emptyParticipant() {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random()}`,
    name: "",
    handle: "",
    commander: "",
    archetype: "",
    moxfield: "",
    colors: [],
    cardImage: "",
    cardUrl: "",
    collapsed: false
  };
}

function hydrateDraftParticipants(table) {
  draftParticipants = table?.participants?.length
    ? table.participants.map((participant) => ({ ...participant }))
    : [emptyParticipant(), emptyParticipant(), emptyParticipant(), emptyParticipant()];
}

function readParticipantRows() {
  return [...nodes.participantList.querySelectorAll(".participant-row")].map((row, index) => ({
    ...(draftParticipants[index] || emptyParticipant()),
    collapsed: !row.open,
    name: row.querySelector('[name="participantName"]').value.trim(),
    handle: row.querySelector('[name="participantHandle"]').value.trim(),
    commander: row.querySelector('[name="participantCommander"]').value.trim(),
    archetype: row.querySelector('[name="participantArchetype"]').value.trim(),
    moxfield: row.querySelector('[name="participantMoxfield"]').value.trim()
  }));
}

function syncWinnerOptions(selectedWinner = "", selectedWinner2 = "") {
  const rows = readParticipantRows();
  const fields = nodes.tableForm.elements;
  const currentWinner = selectedWinner || fields.winner.value;
  const currentWinner2 = selectedWinner2 || fields.winner2.value;
  const options = rows
    .filter((participant) => participant.name)
    .map((participant) => `<option value="${participant.id}">${participant.name}</option>`)
    .join("");

  fields.winner.innerHTML = options;
  fields.winner2.innerHTML = `<option value="">Seleccionar segundo ganador</option>${options}`;

  fields.winner.value = rows.some((participant) => participant.id === currentWinner && participant.name)
    ? currentWinner
    : rows.find((participant) => participant.name)?.id || "";
  fields.winner2.value = rows.some((participant) => participant.id === currentWinner2 && participant.name)
    ? currentWinner2
    : "";
  updateResultModeUI();
}

function updateResultModeUI() {
  const fields = nodes.tableForm.elements;
  const mode = fields.resultMode.value;
  const winnerOne = nodes.tableForm.querySelector(".winner-one");
  const winnerTwo = nodes.tableForm.querySelector(".winner-two");

  winnerOne.hidden = mode === "tie";
  winnerTwo.hidden = mode !== "two";
  fields.winner.required = mode !== "tie";
  fields.winner2.required = mode === "two";

  if (mode === "tie") {
    fields.winner.value = "";
    fields.winner2.value = "";
  }
}

function renderParticipantRows() {
  nodes.participantList.innerHTML = draftParticipants
    .map((participant, index) => `
      <details class="participant-row" data-participant-index="${index}" ${participant.collapsed ? "" : "open"}>
        <summary class="participant-row-head">
          <strong>${participant.name || `Jugador ${index + 1}`}</strong>
          <span>${participant.commander || "Sin comandante"}</span>
        </summary>
        <div class="editor-fields two-col">
          <label><span>Nombre</span><input name="participantName" list="playerSuggestions" placeholder="Nombre del jugador" value="${escapeAttribute(participant.name)}"></label>
          <label><span>Username (opcional)</span><input name="participantHandle" placeholder="@usuario" value="${escapeAttribute(participant.handle)}"></label>
          <label class="wide"><span>Deck conocido</span><select name="knownDeck"><option value="">Rellenar manualmente</option></select></label>
          <label><span>Comandante</span><input name="participantCommander" placeholder="Tivit, Seller of Secrets" value="${escapeAttribute(participant.commander)}"></label>
          <label><span>Arquetipo (opcional)</span><input name="participantArchetype" placeholder="Esper Control" value="${escapeAttribute(participant.archetype)}"></label>
          <label class="wide"><span>Moxfield</span><input name="participantMoxfield" type="url" placeholder="https://moxfield.com/..." value="${escapeAttribute(participant.moxfield)}"></label>
        </div>
        <div class="participant-row-actions">
          <button class="admin-button secondary hydrate-commander" type="button">Actualizar comandante</button>
          <button class="admin-button danger remove-participant" type="button">Quitar jugador</button>
        </div>
        <p class="participant-card-status">${participant.colors?.length ? `Colores detectados: ${colorsToText(participant.colors)}` : "Los colores e imagen se completan desde Moxfield/Scryfall."}</p>
      </details>
    `)
    .join("");

  if (!document.querySelector("#playerSuggestions")) {
    nodes.participantList.insertAdjacentHTML("beforebegin", '<datalist id="playerSuggestions"></datalist>');
  }
  document.querySelector("#playerSuggestions").innerHTML = playerSuggestions();
  [...nodes.participantList.querySelectorAll(".participant-row")].forEach(updateKnownDeckOptions);
  syncWinnerOptions();
}

function updateKnownDeckOptions(row) {
  const player = findPlayerByName(getCurrentData(), row.querySelector('[name="participantName"]').value);
  const select = row.querySelector('[name="knownDeck"]');
  const current = select.value;
  select.innerHTML = '<option value="">Rellenar manualmente</option>';

  if (player) {
    select.insertAdjacentHTML("beforeend", player.decks.map((deck, index) =>
      `<option value="${index}">${escapeAttribute(deck.commander)} | ${escapeAttribute(deck.archetype || "Commander")}</option>`
    ).join(""));
    if (player.handle && !row.querySelector('[name="participantHandle"]').value) {
      row.querySelector('[name="participantHandle"]').value = player.handle;
    }
  }

  select.value = [...select.options].some((option) => option.value === current) ? current : "";
}

function applyKnownDeck(row) {
  const player = findPlayerByName(getCurrentData(), row.querySelector('[name="participantName"]').value);
  const deck = player?.decks?.[Number(row.querySelector('[name="knownDeck"]').value)];
  if (!deck) return;

  row.querySelector('[name="participantCommander"]').value = deck.commander || "";
  row.querySelector('[name="participantArchetype"]').value = deck.archetype || "";
  row.querySelector('[name="participantMoxfield"]').value = deck.moxfield || "";

  const index = Number(row.dataset.participantIndex);
  draftParticipants[index] = {
    ...(draftParticipants[index] || emptyParticipant()),
    ...readParticipantRows()[index],
    colors: deck.colors || [],
    cardImage: deck.cardImage || "",
    cardUrl: deck.cardUrl || ""
  };
  row.querySelector(".participant-card-status").textContent = deck.colors?.length
    ? `Colores detectados: ${colorsToText(deck.colors)}`
    : "Deck conocido seleccionado.";
}

function renderTableList() {
  const data = getCurrentData();

  nodes.tableList.innerHTML = tables(data).length
    ? tables(data)
        .map((table) => {
          return `
            <button class="admin-list-row ${table.id === selectedTableId ? "is-selected" : ""}" type="button" data-table-id="${table.id}">
              <span>
                <strong>${table.title}</strong>
                <small>${table.participants.length} jugadores | Resultado: ${tableWinnerSummary(table)}</small>
              </span>
              <span>${table.date || ""}</span>
            </button>
          `;
        })
        .join("")
    : '<p class="empty-state">Aún no hay mesas guardadas desde este editor.</p>';
}

function renderTableForm() {
  const data = getCurrentData();
  const table = tables(data).find((item) => item.id === selectedTableId);
  const fields = nodes.tableForm.elements;

  nodes.tableFormTitle.textContent = table ? "Editar mesa" : "Nueva mesa";
  nodes.deleteTable.hidden = !table;
  nodes.tableForm.classList.toggle("is-collapsed", Boolean(table && !editingFreshTable));
  nodes.tableForm.querySelector(".edit-table").hidden = !table || editingFreshTable;
  fields.id.value = table?.id || "";
  fields.title.value = table?.title || "";
  fields.videoUrl.value = table?.videoUrl || "";
  fields.date.value = formatDateInput(table?.date);
  fields.resultMode.value = table?.resultMode || (table?.winnerIds?.length > 1 ? "two" : "single");

  hydrateDraftParticipants(table);
  renderParticipantRows();
  syncWinnerOptions(tableWinnerIds(table)[0] || "", tableWinnerIds(table)[1] || "");
}

function renderAdmin() {
  renderSettingsForm();
  renderTableList();
  renderTableForm();
  fillJsonEditor();
}

async function saveData(nextData, message = "Cambios guardados.") {
  if (!firebaseApi || !currentUser) {
    throw new Error("Inicia sesión con la cuenta autorizada antes de guardar.");
  }

  recomputeAll(nextData);
  window.setLeaderboardData(nextData);

  await firebaseApi.setDoc(firebaseApi.docRef, {
    data: nextData,
    updatedAt: firebaseApi.serverTimestamp(),
    updatedBy: currentUser.email
  });

  renderAdmin();
  setMessage(message, "success");
}

async function loadRemoteData() {
  const snapshot = await firebaseApi.getDoc(firebaseApi.docRef);
  if (!snapshot.exists()) {
    renderAdmin();
    return;
  }

  const remoteData = snapshot.data()?.data;
  if (remoteData?.players) {
    window.setLeaderboardData(remoteData);
  }
  renderAdmin();
}

function setAdminVisibility(user) {
  currentUser = user;
  const isAdmin = user?.email?.toLowerCase() === firebaseSetup.adminEmail.toLowerCase();

  nodes.locked.hidden = Boolean(isAdmin);
  nodes.panel.hidden = !isAdmin;

  if (isAdmin) {
    nodes.status.textContent = `Admin | ${user.email}`;
    renderAdmin();
    setMessage("Sesión autorizada. Puedes editar mesas desde formularios.", "success");
  } else if (user) {
    setMessage("Esta cuenta no tiene permisos de edición.", "error");
  }
}

async function initFirebase() {
  if (!firebaseSetup?.enabled) {
    nodes.login.disabled = true;
    nodes.login.textContent = "Configura Firebase para editar";
    setMessage("El modo editor seguro está preparado, pero Firebase aún no está configurado.", "info");
    return;
  }

  const [{ initializeApp }, authModule, firestoreModule] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js")
  ]);

  const app = initializeApp(firebaseSetup.firebase);
  const auth = authModule.getAuth(app);
  const db = firestoreModule.getFirestore(app);
  const docRef = firestoreModule.doc(db, firebaseSetup.collectionName, firebaseSetup.documentId);

  firebaseApi = {
    auth,
    provider: new authModule.GoogleAuthProvider(),
    signInWithPopup: authModule.signInWithPopup,
    signInWithRedirect: authModule.signInWithRedirect,
    getRedirectResult: authModule.getRedirectResult,
    signOut: authModule.signOut,
    onAuthStateChanged: authModule.onAuthStateChanged,
    getDoc: firestoreModule.getDoc,
    setDoc: firestoreModule.setDoc,
    serverTimestamp: firestoreModule.serverTimestamp,
    docRef
  };

  nodes.login.disabled = false;
  nodes.login.textContent = "Entrar con Google";

  firebaseApi.onAuthStateChanged(auth, async (user) => {
    setAdminVisibility(user);
    if (user?.email?.toLowerCase() === firebaseSetup.adminEmail.toLowerCase()) {
      await loadRemoteData();
    }
  });

  await firebaseApi.getRedirectResult(auth).catch((error) => {
    setMessage(friendlyAuthError(error), "error");
  });
}

nodes.login.addEventListener("click", async () => {
  try {
    if (!firebaseApi) {
      setMessage("Firebase todavía está cargando. Intenta de nuevo en unos segundos.", "error");
      return;
    }

    await firebaseApi.signInWithPopup(firebaseApi.auth, firebaseApi.provider);
  } catch (error) {
    setMessage(friendlyAuthError(error), "error");

    if (error?.code === "auth/popup-blocked") {
      await firebaseApi.signInWithRedirect(firebaseApi.auth, firebaseApi.provider);
    }
  }
});

nodes.logout.addEventListener("click", async () => {
  await firebaseApi.signOut(firebaseApi.auth);
  nodes.locked.hidden = false;
  nodes.panel.hidden = true;
});

nodes.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = getCurrentData();
  const fields = nodes.settingsForm.elements;

  data.season = fields.season.value.trim();
  data.lastUpdated = fields.lastUpdated.value;
  data.latestTable = {
    ...(data.latestTable || {}),
    title: fields.latestTitle.value.trim(),
    date: fields.latestDate.value.trim(),
    winner: fields.latestWinner.value.trim(),
    deck: fields.latestDeck.value.trim(),
    videoUrl: fields.latestVideo.value.trim()
  };

  await saveData(data, "Resumen actualizado.");
});

nodes.newTable.addEventListener("click", () => {
  selectedTableId = "";
  editingFreshTable = true;
  renderTableForm();
});

nodes.tableList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-table-id]");
  if (!row) return;

  selectedTableId = row.dataset.tableId;
  editingFreshTable = false;
  renderAdmin();
});

nodes.addParticipant.addEventListener("click", () => {
  draftParticipants = readParticipantRows();
  draftParticipants.push(emptyParticipant());
  renderParticipantRows();
});

nodes.participantList.addEventListener("input", () => {
  syncWinnerOptions();
});

nodes.tableForm.elements.resultMode.addEventListener("change", () => {
  updateResultModeUI();
});

nodes.tableForm.elements.videoUrl.addEventListener("change", async (event) => {
  const video = await fetchYouTubeVideo(event.target.value.trim());
  if (!video) return;
  if (!nodes.tableForm.title.value.trim()) nodes.tableForm.title.value = video.title;
  if (!nodes.tableForm.date.value) nodes.tableForm.date.value = video.publishedAt;

  const parsedParticipants = participantsFromDescription(video.description);
  if (parsedParticipants.length) {
    draftParticipants = parsedParticipants;
    renderParticipantRows();
    setMessage(`Autollené ${parsedParticipants.length} jugadores desde la descripción del video.`, "success");
  }
});

nodes.participantList.addEventListener("click", (event) => {
  const editButton = event.target.closest(".edit-table");
  if (editButton) {
    editingFreshTable = true;
    nodes.tableForm.classList.remove("is-collapsed");
    return;
  }

  const button = event.target.closest(".remove-participant");
  if (!button) return;

  const row = event.target.closest("[data-participant-index]");
  const index = Number(row.dataset.participantIndex);
  draftParticipants = readParticipantRows().filter((_, itemIndex) => itemIndex !== index);
  if (!draftParticipants.length) draftParticipants.push(emptyParticipant());
  renderParticipantRows();
});

nodes.tableForm.addEventListener("click", (event) => {
  const editButton = event.target.closest(".edit-table");
  if (editButton) {
    editingFreshTable = true;
    nodes.tableForm.classList.remove("is-collapsed");
    editButton.hidden = true;
    return;
  }

  const hydrateButton = event.target.closest(".hydrate-commander");
  if (hydrateButton) {
    const row = event.target.closest(".participant-row");
    const commanderField = row.querySelector('[name="participantCommander"]');
    const commander = commanderField.value.trim();
    if (!commander) return;

    const normalizedCommander = normalizeCommanderDisplay(commander);
    commanderField.value = normalizedCommander;

    fetchCommanderCards(normalizedCommander).then((card) => {
      const index = Number(row.dataset.participantIndex);
      draftParticipants[index] = {
        ...(draftParticipants[index] || emptyParticipant()),
        ...readParticipantRows()[index],
        colors: card.colors,
        cardImage: card.image,
        cardUrl: card.url
      };
      row.querySelector(".participant-card-status").textContent = card.colors.length
        ? `Actualizado desde Scryfall: ${colorsToText(card.colors)}`
        : "No encontré colores en Scryfall.";
    });
  }
});

nodes.participantList.addEventListener("change", async (event) => {
  const row = event.target.closest(".participant-row");
  if (!row) return;

  if (event.target.name === "participantName") {
    updateKnownDeckOptions(row);
    syncWinnerOptions();
  }

  if (event.target.name === "knownDeck") {
    applyKnownDeck(row);
    syncWinnerOptions();
  }

  if (event.target.name === "participantMoxfield" && event.target.value.trim()) {
    const deckInfo = await fetchMoxfieldDeck(event.target.value.trim()).catch(() => null);
    if (deckInfo?.commander) {
      row.querySelector('[name="participantCommander"]').value = normalizeCommanderDisplay(deckInfo.commander);
      if (!row.querySelector('[name="participantArchetype"]').value) {
        row.querySelector('[name="participantArchetype"]').value = deckInfo.archetype;
      }
      const card = await fetchCommanderCards(deckInfo.commander);
      const index = Number(row.dataset.participantIndex);
      draftParticipants[index] = {
        ...(draftParticipants[index] || emptyParticipant()),
        ...readParticipantRows()[index],
        colors: card.colors,
        cardImage: card.image,
        cardUrl: card.url
      };
      row.querySelector(".participant-card-status").textContent = card.colors.length
        ? `Comandante desde Moxfield: ${normalizeCommanderDisplay(deckInfo.commander)} | ${colorsToText(card.colors)}`
        : `Comandante desde Moxfield: ${normalizeCommanderDisplay(deckInfo.commander)}`;
    }
  }
});

nodes.tableForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = getCurrentData();
  const fields = nodes.tableForm.elements;
  const existingTable = tables(data).find((table) => table.id === fields.id.value);
  const allParticipants = readParticipantRows();
  let participants = allParticipants.filter((participant) => participant.name && participant.commander);

  if (allParticipants.some((participant) => (participant.name && !participant.commander) || (!participant.name && participant.commander))) {
    setMessage("Cada jugador necesita nombre y comandante. Los renglones vacíos sí se pueden dejar vacíos.", "error");
    return;
  }

  if (!participants.length) {
    setMessage("Agrega al menos un jugador con comandante.", "error");
    return;
  }

  const resultMode = fields.resultMode.value;
  const winnerIds = resultMode === "tie"
    ? []
    : [fields.winner.value, resultMode === "two" ? fields.winner2.value : ""].filter(Boolean);

  if (resultMode !== "tie" && !winnerIds.length) {
    setMessage("Selecciona quién ganó la mesa.", "error");
    return;
  }

  if (resultMode === "two" && winnerIds.length < 2) {
    setMessage("Selecciona dos ganadores para una mesa 2 vs 2.", "error");
    return;
  }

  if (new Set(winnerIds).size !== winnerIds.length) {
    setMessage("Los dos ganadores deben ser jugadores distintos.", "error");
    return;
  }

  if (winnerIds.some((winnerId) => !participants.some((participant) => participant.id === winnerId))) {
    setMessage("El ganador debe ser uno de los jugadores con comandante.", "error");
    return;
  }

  setMessage("Buscando comandantes en Scryfall...", "info");
  participants = await Promise.all(participants.map(async (participant) => {
    const commander = normalizeCommanderDisplay(participant.commander);
    const card = await fetchCommanderCards(commander);
    return {
      ...participant,
      commander,
      archetype: participant.archetype || "Commander",
      colors: card.colors.length ? card.colors : participant.colors || [],
      cardImage: card.image || participant.cardImage || "",
      cardUrl: card.url || participant.cardUrl || ""
    };
  }));

  const nextTable = {
    id: fields.id.value || `mesa-${Date.now()}`,
    title: fields.title.value.trim(),
    date: fields.date.value.trim(),
    videoUrl: fields.videoUrl.value.trim(),
    resultMode,
    winnerId: winnerIds[0] || "",
    winnerIds,
    participants
  };

  if (existingTable) {
    applyTableToAggregates(data, existingTable, -1);
    data.tables = tables(data).map((table) => table.id === existingTable.id ? nextTable : table);
  } else {
    tables(data).unshift(nextTable);
  }

  applyTableToAggregates(data, nextTable, 1);

  const winners = tableWinners(nextTable);
  const primaryWinner = winners[0];
  data.latestTable = {
    ...(data.latestTable || {}),
    title: nextTable.title,
    date: nextTable.date || "Último estreno",
    winner: isTieTable(nextTable) ? "Empate" : winners.map((winner) => winner.name).join(" y "),
    deck: primaryWinner?.commander || "",
    videoUrl: nextTable.videoUrl
  };

  selectedTableId = nextTable.id;
  editingFreshTable = false;
  await saveData(data, "Mesa guardada.");
});

nodes.deleteTable.addEventListener("click", async () => {
  const data = getCurrentData();
  const table = tables(data).find((item) => item.id === selectedTableId);
  if (!table) return;

  const confirmed = window.confirm(`¿Borrar la mesa "${table.title}" y restar sus resultados del ranking?`);
  if (!confirmed) return;

  applyTableToAggregates(data, table, -1);
  data.tables = tables(data).filter((item) => item.id !== selectedTableId);
  selectedTableId = "";
  await saveData(data, "Mesa borrada.");
});

nodes.loadJson.addEventListener("click", fillJsonEditor);

nodes.saveJson.addEventListener("click", async () => {
  try {
    const nextData = JSON.parse(nodes.json.value);
    await saveData(nextData, "JSON guardado.");
  } catch (error) {
    setMessage(error.message, "error");
  }
});

initFirebase().catch((error) => {
  setMessage(error.message, "error");
});
