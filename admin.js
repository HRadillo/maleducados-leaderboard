const firebaseSetup = window.MALEDucadosFirebaseConfig;
const allowedColors = ["W", "U", "B", "R", "G"];

const nodes = {
  locked: document.querySelector("#adminLocked"),
  panel: document.querySelector("#adminPanel"),
  login: document.querySelector("#adminLogin"),
  logout: document.querySelector("#adminLogout"),
  status: document.querySelector("#adminStatus"),
  json: document.querySelector("#adminJson"),
  loadJson: document.querySelector("#loadJson"),
  saveJson: document.querySelector("#saveJson"),
  message: document.querySelector("#adminMessage"),
  form: document.querySelector("#quickEntryForm")
};

let firebaseApi = null;
let currentUser = null;

function setMessage(text, type = "info") {
  nodes.message.textContent = text;
  nodes.message.dataset.type = type;
}

function getCurrentData() {
  return window.getLeaderboardData ? window.getLeaderboardData() : window.MALEDucadosData;
}

function fillEditor() {
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

function addOrUpdateDeck(formData) {
  const nextData = getCurrentData();
  const playerName = formData.get("playerName").trim();
  const commander = formData.get("commander").trim();
  const colors = normalizeColors(formData.get("colors"));

  if (!playerName || !commander || !colors.length) {
    throw new Error("Jugador, comandante y colores son obligatorios.");
  }

  let player = nextData.players.find((item) => item.name.toLowerCase() === playerName.toLowerCase());

  if (!player) {
    player = {
      id: slugify(playerName),
      name: playerName,
      handle: formData.get("handle").trim() || `@${slugify(playerName)}`,
      role: formData.get("role"),
      appearances: 0,
      wins: 0,
      losses: 0,
      latestAppearance: nextData.latestTable?.title || "",
      signature: "",
      colors: [],
      decks: []
    };
    nextData.players.push(player);
  }

  player.handle = formData.get("handle").trim() || player.handle;
  player.role = formData.get("role") || player.role;

  const deckPayload = {
    commander,
    archetype: formData.get("archetype").trim() || "Commander",
    colors,
    wins: Number(formData.get("wins") || 0),
    losses: Number(formData.get("losses") || 0),
    moxfield: formData.get("moxfield").trim() || "https://moxfield.com/users/LosMaleducadosDelMagic",
    videoUrl: formData.get("videoUrl").trim() || nextData.socials[0].url
  };

  const deckIndex = player.decks.findIndex((deck) => deck.commander.toLowerCase() === commander.toLowerCase());
  if (deckIndex >= 0) {
    player.decks[deckIndex] = { ...player.decks[deckIndex], ...deckPayload };
  } else {
    player.decks.push(deckPayload);
  }

  recomputePlayer(player);
  window.setLeaderboardData(nextData);
  fillEditor();
}

async function saveData(nextData) {
  if (!firebaseApi || !currentUser) {
    throw new Error("Inicia sesión con la cuenta autorizada antes de guardar.");
  }

  await firebaseApi.setDoc(firebaseApi.docRef, {
    data: nextData,
    updatedAt: firebaseApi.serverTimestamp(),
    updatedBy: currentUser.email
  });
}

async function loadRemoteData() {
  const snapshot = await firebaseApi.getDoc(firebaseApi.docRef);
  if (!snapshot.exists()) {
    fillEditor();
    return;
  }

  const remoteData = snapshot.data()?.data;
  if (remoteData?.players) {
    window.setLeaderboardData(remoteData);
  }
  fillEditor();
}

function setAdminVisibility(user) {
  currentUser = user;
  const isAdmin = user?.email?.toLowerCase() === firebaseSetup.adminEmail.toLowerCase();

  nodes.locked.hidden = Boolean(isAdmin);
  nodes.panel.hidden = !isAdmin;

  if (isAdmin) {
    nodes.status.textContent = `Admin | ${user.email}`;
    fillEditor();
    setMessage("Sesión autorizada. Puedes editar y guardar cambios.", "success");
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
    signOut: authModule.signOut,
    onAuthStateChanged: authModule.onAuthStateChanged,
    getDoc: firestoreModule.getDoc,
    setDoc: firestoreModule.setDoc,
    serverTimestamp: firestoreModule.serverTimestamp,
    docRef
  };

  firebaseApi.onAuthStateChanged(auth, async (user) => {
    setAdminVisibility(user);
    if (user?.email?.toLowerCase() === firebaseSetup.adminEmail.toLowerCase()) {
      await loadRemoteData();
    }
  });
}

nodes.login.addEventListener("click", async () => {
  try {
    await firebaseApi.signInWithPopup(firebaseApi.auth, firebaseApi.provider);
  } catch (error) {
    setMessage(error.message, "error");
  }
});

nodes.logout.addEventListener("click", async () => {
  await firebaseApi.signOut(firebaseApi.auth);
  nodes.locked.hidden = false;
  nodes.panel.hidden = true;
});

nodes.loadJson.addEventListener("click", fillEditor);

nodes.saveJson.addEventListener("click", async () => {
  try {
    const nextData = JSON.parse(nodes.json.value);
    window.setLeaderboardData(nextData);
    await saveData(nextData);
    setMessage("Cambios guardados en Firestore.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  }
});

nodes.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    addOrUpdateDeck(new FormData(nodes.form));
    await saveData(getCurrentData());
    nodes.form.reset();
    setMessage("Deck actualizado y guardado.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  }
});

initFirebase().catch((error) => {
  setMessage(error.message, "error");
});
