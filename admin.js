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
  playerList: document.querySelector("#playerList"),
  playerForm: document.querySelector("#playerForm"),
  playerFormTitle: document.querySelector("#playerFormTitle"),
  newPlayer: document.querySelector("#newPlayer"),
  deletePlayer: document.querySelector("#deletePlayer"),
  deckList: document.querySelector("#deckList"),
  deckForm: document.querySelector("#deckForm"),
  deckFormTitle: document.querySelector("#deckFormTitle"),
  newDeck: document.querySelector("#newDeck"),
  deleteDeck: document.querySelector("#deleteDeck"),
  json: document.querySelector("#adminJson"),
  loadJson: document.querySelector("#loadJson"),
  saveJson: document.querySelector("#saveJson")
};

let firebaseApi = null;
let currentUser = null;
let selectedPlayerId = "";
let selectedDeckPlayerId = "";
let selectedDeckIndex = "";

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

function setCurrentData(nextData) {
  window.setLeaderboardData(nextData);
  renderAdmin();
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

function normalizeColors(value) {
  const colors = value
    .toUpperCase()
    .split("")
    .filter((color, index, list) => allowedColors.includes(color) && list.indexOf(color) === index);

  return allowedColors.filter((color) => colors.includes(color));
}

function colorsToText(colors) {
  return allowedColors.filter((color) => colors?.includes(color)).join("");
}

function scryfallCardFromPayload(payload) {
  let image = payload.image_uris?.large || payload.image_uris?.normal || "";

  if (!image) {
    const face = payload.card_faces?.find((cardFace) => cardFace.image_uris?.large || cardFace.image_uris?.normal);
    image = face?.image_uris?.large || face?.image_uris?.normal || "";
  }

  return {
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

  if (!response.ok) return { image: "", url: "" };

  return scryfallCardFromPayload(await response.json());
}

function playerById(data, playerId) {
  return data.players.find((player) => player.id === playerId);
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

function renderSettingsForm() {
  const data = getCurrentData();
  const latestTable = data.latestTable || {};
  const stats = data.channelStats || {};
  const fields = nodes.settingsForm.elements;

  fields.season.value = data.season || "";
  fields.lastUpdated.value = data.lastUpdated || "";
  fields.latestTitle.value = latestTable.title || "";
  fields.latestDate.value = latestTable.date || "";
  fields.latestWinner.value = latestTable.winner || "";
  fields.latestDeck.value = latestTable.deck || "";
  fields.latestVideo.value = latestTable.videoUrl || "";
  fields.subscribers.value = stats.subscribers || "";
}

function renderPlayerList() {
  const data = getCurrentData();

  nodes.playerList.innerHTML = data.players
    .map(
      (player) => `
        <button class="admin-list-row ${player.id === selectedPlayerId ? "is-selected" : ""}" type="button" data-player-id="${player.id}">
          <span>
            <strong>${player.name}</strong>
            <small>${player.role} | ${player.wins}-${player.losses} | ${player.decks.length} decks</small>
          </span>
          <span>${player.handle || ""}</span>
        </button>
      `
    )
    .join("");
}

function renderPlayerForm() {
  const data = getCurrentData();
  const player = playerById(data, selectedPlayerId);
  const form = nodes.playerForm;
  const fields = form.elements;

  nodes.playerFormTitle.textContent = player ? "Editar jugador" : "Nuevo jugador";
  nodes.deletePlayer.hidden = !player;

  fields.id.value = player?.id || "";
  fields.name.value = player?.name || "";
  fields.handle.value = player?.handle || "";
  fields.role.value = player?.role || "Invitado";
  fields.latestAppearance.value = player?.latestAppearance || "";
  fields.signature.value = player?.signature || "";
}

function renderPlayerOptions() {
  const data = getCurrentData();
  nodes.deckForm.playerSelect.innerHTML = data.players
    .map((player) => `<option value="${player.id}">${player.name}</option>`)
    .join("");
}

function renderDeckList() {
  const data = getCurrentData();
  const rows = data.players.flatMap((player) =>
    player.decks.map((deck, index) => ({ player, deck, index }))
  );

  nodes.deckList.innerHTML = rows.length
    ? rows
        .map(
          ({ player, deck, index }) => `
            <button class="admin-list-row ${player.id === selectedDeckPlayerId && String(index) === String(selectedDeckIndex) ? "is-selected" : ""}" type="button" data-deck-player-id="${player.id}" data-deck-index="${index}">
              <span>
                <strong>${deck.commander}</strong>
                <small>${player.name} | ${deck.archetype || "Commander"} | ${colorsToText(deck.colors)}</small>
              </span>
              <span>${deck.wins || 0}-${deck.losses || 0}</span>
            </button>
          `
        )
        .join("")
    : '<p class="empty-state">Aún no hay decks registrados.</p>';
}

function renderDeckForm() {
  const data = getCurrentData();
  const player = playerById(data, selectedDeckPlayerId);
  const deck = player?.decks?.[Number(selectedDeckIndex)];
  const form = nodes.deckForm;
  const fields = form.elements;

  nodes.deckFormTitle.textContent = deck ? "Editar deck" : "Nuevo deck";
  nodes.deleteDeck.hidden = !deck;
  renderPlayerOptions();

  fields.playerId.value = player?.id || "";
  fields.deckIndex.value = deck ? selectedDeckIndex : "";
  fields.playerSelect.value = player?.id || data.players[0]?.id || "";
  fields.commander.value = deck?.commander || "";
  fields.archetype.value = deck?.archetype || "";
  fields.colors.value = colorsToText(deck?.colors) || "";
  fields.wins.value = deck?.wins ?? 0;
  fields.losses.value = deck?.losses ?? 0;
  fields.moxfield.value = deck?.moxfield || "";
  fields.videoUrl.value = deck?.videoUrl || "";
}

function renderAdmin() {
  renderSettingsForm();
  renderPlayerList();
  renderPlayerForm();
  renderDeckList();
  renderDeckForm();
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
    setCurrentData(remoteData);
  } else {
    renderAdmin();
  }
}

function setAdminVisibility(user) {
  currentUser = user;
  const isAdmin = user?.email?.toLowerCase() === firebaseSetup.adminEmail.toLowerCase();

  nodes.locked.hidden = Boolean(isAdmin);
  nodes.panel.hidden = !isAdmin;

  if (isAdmin) {
    nodes.status.textContent = `Admin | ${user.email}`;
    renderAdmin();
    setMessage("Sesión autorizada. Puedes editar desde formularios.", "success");
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
  data.channelStats = {
    ...(data.channelStats || {}),
    subscribers: fields.subscribers.value.trim() || "N/D"
  };

  await saveData(data, "Resumen actualizado.");
});

nodes.newPlayer.addEventListener("click", () => {
  selectedPlayerId = "";
  renderPlayerForm();
});

nodes.playerList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-player-id]");
  if (!row) return;

  selectedPlayerId = row.dataset.playerId;
  renderAdmin();
});

nodes.playerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = getCurrentData();
  const fields = nodes.playerForm.elements;
  const name = fields.name.value.trim();

  if (!name) {
    setMessage("El nombre del jugador es obligatorio.", "error");
    return;
  }

  let id = fields.id.value || slugify(name);
  const duplicate = data.players.find((player) => player.id === id && player.id !== fields.id.value);
  if (duplicate) id = `${id}-${Date.now()}`;

  let player = playerById(data, fields.id.value);
  if (!player) {
    player = { id, decks: [], wins: 0, losses: 0, appearances: 0, colors: [] };
    data.players.push(player);
  }

  player.id = id;
  player.name = name;
  player.handle = fields.handle.value.trim();
  player.role = fields.role.value;
  player.latestAppearance = fields.latestAppearance.value.trim();
  player.signature = fields.signature.value.trim();

  selectedPlayerId = player.id;
  await saveData(data, "Jugador guardado.");
});

nodes.deletePlayer.addEventListener("click", async () => {
  if (!selectedPlayerId) return;
  const data = getCurrentData();
  const player = playerById(data, selectedPlayerId);
  if (!player) return;

  const confirmed = window.confirm(`¿Eliminar a ${player.name} y todos sus decks?`);
  if (!confirmed) return;

  data.players = data.players.filter((item) => item.id !== selectedPlayerId);
  selectedPlayerId = "";
  selectedDeckPlayerId = "";
  selectedDeckIndex = "";
  await saveData(data, "Jugador eliminado.");
});

nodes.newDeck.addEventListener("click", () => {
  selectedDeckPlayerId = "";
  selectedDeckIndex = "";
  renderDeckForm();
});

nodes.deckList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-deck-player-id]");
  if (!row) return;

  selectedDeckPlayerId = row.dataset.deckPlayerId;
  selectedDeckIndex = row.dataset.deckIndex;
  renderAdmin();
});

nodes.deckForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = getCurrentData();
  const fields = nodes.deckForm.elements;
  const player = playerById(data, fields.playerSelect.value);
  const colors = normalizeColors(fields.colors.value);

  if (!player) {
    setMessage("Selecciona un jugador válido.", "error");
    return;
  }

  if (!fields.commander.value.trim() || !colors.length) {
    setMessage("Comandante y colores son obligatorios.", "error");
    return;
  }

  const payload = {
    commander: fields.commander.value.trim(),
    archetype: fields.archetype.value.trim() || "Commander",
    colors,
    wins: Number(fields.wins.value || 0),
    losses: Number(fields.losses.value || 0),
    moxfield: fields.moxfield.value.trim() || "https://moxfield.com/users/LosMaleducadosDelMagic",
    videoUrl: fields.videoUrl.value.trim() || data.socials[0].url,
    cardImage: "",
    cardUrl: ""
  };

  const editingSamePlayer = fields.playerId.value === player.id && fields.deckIndex.value !== "";
  if (editingSamePlayer) {
    payload.cardImage = player.decks[Number(fields.deckIndex.value)]?.cardImage || "";
    payload.cardUrl = player.decks[Number(fields.deckIndex.value)]?.cardUrl || "";
    if (!payload.cardImage || !payload.cardUrl || player.decks[Number(fields.deckIndex.value)]?.commander !== payload.commander) {
      const card = await fetchCommanderCard(payload.commander);
      payload.cardImage = card.image;
      payload.cardUrl = card.url;
    }
    player.decks[Number(fields.deckIndex.value)] = payload;
    selectedDeckIndex = fields.deckIndex.value;
  } else {
    const card = await fetchCommanderCard(payload.commander);
    payload.cardImage = card.image;
    payload.cardUrl = card.url;
    if (fields.playerId.value && fields.deckIndex.value !== "") {
      const oldPlayer = playerById(data, fields.playerId.value);
      oldPlayer?.decks.splice(Number(fields.deckIndex.value), 1);
    }
    player.decks.push(payload);
    selectedDeckIndex = String(player.decks.length - 1);
  }

  selectedDeckPlayerId = player.id;
  await saveData(data, "Deck guardado.");
});

nodes.deleteDeck.addEventListener("click", async () => {
  if (!selectedDeckPlayerId || selectedDeckIndex === "") return;
  const data = getCurrentData();
  const player = playerById(data, selectedDeckPlayerId);
  const deck = player?.decks?.[Number(selectedDeckIndex)];
  if (!deck) return;

  const confirmed = window.confirm(`¿Eliminar ${deck.commander}?`);
  if (!confirmed) return;

  player.decks.splice(Number(selectedDeckIndex), 1);
  selectedDeckPlayerId = "";
  selectedDeckIndex = "";
  await saveData(data, "Deck eliminado.");
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
