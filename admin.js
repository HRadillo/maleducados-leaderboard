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

function playerById(data, playerId) {
  return data.players.find((player) => player.id === playerId);
}

function findPlayerByName(data, name) {
  return data.players.find((player) => player.name.trim().toLowerCase() === name.trim().toLowerCase());
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
    deck.commander.trim().toLowerCase() === participant.commander.trim().toLowerCase() &&
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
        commander: participant.commander,
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

    deck.colors = participant.colors || deck.colors || [];
    deck.cardImage = participant.cardImage || deck.cardImage || "";
    deck.cardUrl = participant.cardUrl || deck.cardUrl || "";
    deck.moxfield = participant.moxfield || deck.moxfield;
    deck.videoUrl = table.videoUrl || deck.videoUrl;

    if (participant.id === table.winnerId) {
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
    cardUrl: ""
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
    name: row.querySelector('[name="participantName"]').value.trim(),
    handle: row.querySelector('[name="participantHandle"]').value.trim(),
    commander: row.querySelector('[name="participantCommander"]').value.trim(),
    archetype: row.querySelector('[name="participantArchetype"]').value.trim(),
    moxfield: row.querySelector('[name="participantMoxfield"]').value.trim()
  }));
}

function syncWinnerOptions(selectedWinner = "") {
  const rows = readParticipantRows();
  const currentWinner = selectedWinner || nodes.tableForm.elements.winner.value;

  nodes.tableForm.elements.winner.innerHTML = rows
    .filter((participant) => participant.name)
    .map((participant) => `<option value="${participant.id}">${participant.name}</option>`)
    .join("");

  nodes.tableForm.elements.winner.value = rows.some((participant) => participant.id === currentWinner && participant.name)
    ? currentWinner
    : rows.find((participant) => participant.name)?.id || "";
}

function renderParticipantRows() {
  nodes.participantList.innerHTML = draftParticipants
    .map((participant, index) => `
      <article class="participant-row" data-participant-index="${index}">
        <div class="participant-row-head">
          <strong>Jugador ${index + 1}</strong>
          <button class="admin-button danger remove-participant" type="button">Quitar</button>
        </div>
        <div class="editor-fields two-col">
          <label><span>Nombre</span><input name="participantName" placeholder="Nombre del jugador" value="${escapeAttribute(participant.name)}"></label>
          <label><span>Username opcional</span><input name="participantHandle" placeholder="@usuario" value="${escapeAttribute(participant.handle)}"></label>
          <label><span>Comandante</span><input name="participantCommander" placeholder="Tivit, Seller of Secrets" value="${escapeAttribute(participant.commander)}"></label>
          <label><span>Arquetipo opcional</span><input name="participantArchetype" placeholder="Esper Control" value="${escapeAttribute(participant.archetype)}"></label>
          <label class="wide"><span>Moxfield</span><input name="participantMoxfield" type="url" placeholder="https://moxfield.com/..." value="${escapeAttribute(participant.moxfield)}"></label>
        </div>
        <p class="participant-card-status">${participant.colors?.length ? `Colores detectados: ${colorsToText(participant.colors)}` : "Los colores e imagen se completan desde Scryfall al guardar."}</p>
      </article>
    `)
    .join("");

  syncWinnerOptions();
}

function renderTableList() {
  const data = getCurrentData();

  nodes.tableList.innerHTML = tables(data).length
    ? tables(data)
        .map((table) => {
          const winner = table.participants.find((participant) => participant.id === table.winnerId);
          return `
            <button class="admin-list-row ${table.id === selectedTableId ? "is-selected" : ""}" type="button" data-table-id="${table.id}">
              <span>
                <strong>${table.title}</strong>
                <small>${table.participants.length} jugadores | Ganador: ${winner?.name || "Sin ganador"}</small>
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
  fields.id.value = table?.id || "";
  fields.title.value = table?.title || "";
  fields.videoUrl.value = table?.videoUrl || "";
  fields.date.value = table?.date || "";

  hydrateDraftParticipants(table);
  renderParticipantRows();
  syncWinnerOptions(table?.winnerId || "");
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
  data.channelStats = {
    ...(data.channelStats || {}),
    subscribers: fields.subscribers.value.trim() || "N/D"
  };

  await saveData(data, "Resumen actualizado.");
});

nodes.newTable.addEventListener("click", () => {
  selectedTableId = "";
  renderTableForm();
});

nodes.tableList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-table-id]");
  if (!row) return;

  selectedTableId = row.dataset.tableId;
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

nodes.participantList.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-participant");
  if (!button) return;

  const row = event.target.closest("[data-participant-index]");
  const index = Number(row.dataset.participantIndex);
  draftParticipants = readParticipantRows().filter((_, itemIndex) => itemIndex !== index);
  if (!draftParticipants.length) draftParticipants.push(emptyParticipant());
  renderParticipantRows();
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

  if (!fields.winner.value) {
    setMessage("Selecciona quién ganó la mesa.", "error");
    return;
  }

  if (!participants.some((participant) => participant.id === fields.winner.value)) {
    setMessage("El ganador debe ser uno de los jugadores con comandante.", "error");
    return;
  }

  setMessage("Buscando comandantes en Scryfall...", "info");
  participants = await Promise.all(participants.map(async (participant) => {
    const card = await fetchCommanderCard(participant.commander);
    return {
      ...participant,
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
    winnerId: fields.winner.value,
    participants
  };

  if (existingTable) {
    applyTableToAggregates(data, existingTable, -1);
    data.tables = tables(data).map((table) => table.id === existingTable.id ? nextTable : table);
  } else {
    tables(data).unshift(nextTable);
  }

  applyTableToAggregates(data, nextTable, 1);

  const winner = participants.find((participant) => participant.id === nextTable.winnerId);
  data.latestTable = {
    ...(data.latestTable || {}),
    title: nextTable.title,
    date: nextTable.date || "Último estreno",
    winner: winner?.name || "",
    deck: winner?.commander || "",
    videoUrl: nextTable.videoUrl
  };

  selectedTableId = nextTable.id;
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
