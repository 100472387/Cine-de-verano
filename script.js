/* ========== IMPORTS FIREBASE ========== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, setPersistence, browserSessionPersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, setDoc, getDoc, collection, getDocs, addDoc, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/* ========== FIREBASE CONFIG ========== */
const firebaseConfig = {
  apiKey: "AIzaSyDRztedy1U_erKHDY94KlUkxcZNwQcDUZw",
  authDomain: "cine-verano.firebaseapp.com",
  projectId: "cine-verano",
  appId: "1:725171854528:web:a7ca7cd58ee3e024226125"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setPersistence(auth, browserSessionPersistence).catch((err) => {
  console.error("No se pudo fijar persistencia de sesiÃ³n", err);
});

/* ========== ESTADO GLOBAL ========== */
let schedule = [];
let currentDay = 0;
let uid = null;
let isAdminFlag = false;
let userGroups = [];
let selectedGroup = null;
let docRef = null;
let unsubscribeSchedule = null;
let sharedDocRef = null;
let sharedMovies = [];
let unsubscribeShared = null;
const SHARED_CATEGORY_LABEL = "Mejoras Web";
const SHARED_DOC_ID = "__shared_mejoras_web";
const DEFAULT_PROFILE_PHOTO = "https://ui-avatars.com/api/?background=334155&color=f8fafc&size=128&name=CV";
const MAX_CATEGORY_LABEL_LENGTH = 60;
const MAX_MOVIE_TITLE_LENGTH = 120;
const MAX_MOVIE_DETAILS_LENGTH = 80;
const MAX_RECOMMENDATION_NOTE_LENGTH = 240;
let userProfile = { displayName: "Usuario", photoURL: DEFAULT_PROFILE_PHOTO };
let currentMainView = "groups";
let predictionsByUser = {};
let predictionWinners = {};
let isEditingPredictions = false;
let adminUserIds = [];
let recommendations = [];
let unsubscribeRecommendations = null;
const profileCache = {};
const loadingProfileIds = new Set();
const OSCAR_SURVEY = [
  {
    key: "best_picture",
    label: "Mejor película",
    candidates: ["Bugonia", "F1", "Frankenstein", "Hamnet", "Marty Supreme", "One Battle after Another", "The Secret Agent", "Sentimental Value", "Sinners", "Train Dreams"]
  },
  {
    key: "best_director",
    label: "Mejor dirección",
    candidates: ["Chloe Zhao (Hamnet)", "Josh Safdie (Marty Supreme)", "Paul Thomas Anderson (One Battle after Another)", "Joachim Trier (Sentimental Value)", "Ryan Coogler (Sinners)"]
  },
  {
    key: "best_actor",
    label: "Mejor actor",
    candidates: ["Timothee Chalamet (Marty Supreme)", "Leonardo DiCaprio (One Battle after Another)", "Ethan Hawke (Blue Moon)", "Michael B. Jordan (Sinners)", "Wagner Moura (The Secret Agent)"]
  },
  {
    key: "best_actress",
    label: "Mejor actriz",
    candidates: ["Jessie Buckley (Hamnet)", "Rose Byrne (If I Had Legs I'd Kick You)", "Kate Hudson (Song Sung Blue)", "Renate Reinsve (Sentimental Value)", "Emma Stone (Bugonia)"]
  },
  {
    key: "best_supporting_actor",
    label: "Mejor actor de reparto",
    candidates: ["Benicio Del Toro (One Battle after Another)", "Jacob Elordi (Frankenstein)", "Delroy Lindo (Sinners)", "Sean Penn (One Battle after Another)", "Stellan Skarsgard (Sentimental Value)"]
  },
  {
    key: "best_supporting_actress",
    label: "Mejor actriz de reparto",
    candidates: ["Elle Fanning (Sentimental Value)", "Inga Ibsdotter Lilleaas (Sentimental Value)", "Amy Madigan (Weapons)", "Wunmi Mosaku (Sinners)", "Teyana Taylor (One Battle after Another)"]
  },
  {
    key: "best_original_screenplay",
    label: "Mejor guión original",
    candidates: ["Blue Moon", "It Was Just an Accident", "Marty Supreme", "Sentimental Value", "Sinners"]
  },
  {
    key: "best_adapted_screenplay",
    label: "Mejor guión adaptado",
    candidates: ["Bugonia", "Frankenstein", "Hamnet", "One Battle after Another", "Train Dreams"]
  },
  {
    key: "best_animated",
    label: "Mejor película animada",
    candidates: ["Arco", "Elio", "KPop Demon Hunters", "Little Amelie or the Character of Rain", "Zootopia 2"]
  },
  {
    key: "best_animated_short",
    label: "Mejor corto animado",
    candidates: ["Butterfly", "Forevergreen", "The Girl Who Cried Pearls", "Retirement Plan", "The Three Sisters"]
  },
  {
    key: "best_casting",
    label: "Mejor reparto de casting",
    candidates: ["Hamnet", "Marty Supreme", "One Battle after Another", "The Secret Agent", "Sinners"]
  },
  {
    key: "best_cinematography",
    label: "Mejor fotografía",
    candidates: ["Frankenstein", "Marty Supreme", "One Battle after Another", "Sinners", "Train Dreams"]
  },
  {
    key: "best_costume_design",
    label: "Mejor diseño de vestuario",
    candidates: ["Avatar: Fire and Ash", "Frankenstein", "Hamnet", "Marty Supreme", "Sinners"]
  },
  {
    key: "best_documentary_feature",
    label: "Mejor documental",
    candidates: ["The Alabama Solution", "Come See Me in the Good Light", "Cutting through Rocks", "Mr. Nobody against Putin", "The Perfect Neighbor"]
  },
  {
    key: "best_documentary_short",
    label: "Mejor corto documental",
    candidates: ["All the Empty Rooms", "Armed Only with a Camera: The Life and Death of Brent Renaud", "Children No More: \"Were and Are Gone\"", "The Devil Is Busy", "Perfectly a Strangeness"]
  },
  {
    key: "best_film_editing",
    label: "Mejor montaje",
    candidates: ["F1", "Marty Supreme", "One Battle after Another", "Sentimental Value", "Sinners"]
  },
  {
    key: "best_international_feature",
    label: "Mejor película internacional",
    candidates: ["The Secret Agent (Brazil)", "It Was Just an Accident (France)", "Sentimental Value (Norway)", "Sirat (Spain)", "The Voice of Hind Rajab (Tunisia)"]
  },
  {
    key: "best_live_action_short",
    label: "Mejor corto de acción real",
    candidates: ["Butcher's Stain", "A Friend of Dorothy", "Jane Austen's Period Drama", "The Singers", "Two People Exchanging Saliva"]
  },
  {
    key: "best_makeup_hairstyling",
    label: "Mejor maquillaje y peluquería",
    candidates: ["Frankenstein", "Kokuho", "Sinners", "The Smashing Machine", "The Ugly Stepsister"]
  },
  {
    key: "best_score",
    label: "Mejor banda sonora",
    candidates: ["Bugonia", "Frankenstein", "Hamnet", "One Battle after Another", "Sinners"]
  },
  {
    key: "best_original_song",
    label: "Mejor canción original",
    candidates: ["Dear Me", "Golden", "I Lied To You", "Sweet Dreams Of Joy", "Train Dreams"]
  },
  {
    key: "best_production_design",
    label: "Mejor diseño de producción",
    candidates: ["Frankenstein", "Hamnet", "Marty Supreme", "One Battle after Another", "Sinners"]
  },
  {
    key: "best_sound",
    label: "Mejor sonido",
    candidates: ["F1", "Frankenstein", "One Battle after Another", "Sinners", "Sirat"]
  },
  {
    key: "best_visual_effects",
    label: "Mejores efectos visuales",
    candidates: ["Avatar: Fire and Ash", "F1", "Jurassic World Rebirth", "The Lost Bus", "Sinners"]
  }
];

/* ========== FUNCIONES AUX ========== */
function normalizeLabel(label) {
  return (label || "").trim().toLowerCase();
}

function ensureSharedCategory(list) {
  return {
    list: Array.isArray(list)
      ? list.filter(d =>
          normalizeLabel(d.label) !== normalizeLabel(SHARED_CATEGORY_LABEL)
        )
      : [],
    changed: false
  };
}

async function getUserGroups(uid) {
  const q = query(collection(db, "groups"), where("members", "array-contains", uid));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.id);
}

async function isAdminByGroup(uid) {
  if (!uid) return false;
  const groupsSnap = await getDocs(collection(db, "groups"));
  for (const groupDoc of groupsSnap.docs) {
    const members = groupDoc.data().members || [];
    if (members.includes(uid)) return true;
  }
  return false;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getDefaultDisplayName(user) {
  const byEmail = user && user.email ? user.email.split("@")[0] : "";
  return (byEmail || "Usuario").trim().slice(0, 40);
}

function sanitizeHttpUrl(url, fallback = "") {
  if (!url || typeof url !== "string") return fallback;
  try {
    const parsed = new URL(url.trim(), window.location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch (e) {
    return fallback;
  }
  return fallback;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  const normalized = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function isValidPassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 128;
}

function truncateClean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

const authGuard = {
  failures: 0,
  lockedUntil: 0
};

function getRemainingLockSeconds() {
  const ms = authGuard.lockedUntil - Date.now();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

function authIsLocked() {
  return getRemainingLockSeconds() > 0;
}

function registerAuthFailure() {
  authGuard.failures += 1;
  if (authGuard.failures >= 5) {
    authGuard.lockedUntil = Date.now() + 60_000;
    authGuard.failures = 0;
  }
}

function clearAuthFailures() {
  authGuard.failures = 0;
  authGuard.lockedUntil = 0;
}

async function runWithDisabledButton(buttonId, fn) {
  const button = document.getElementById(buttonId);
  if (!button) return fn();
  const previousDisabled = button.disabled;
  const previousText = button.innerText;
  button.disabled = true;
  button.classList.add("opacity-60", "cursor-not-allowed");
  button.innerText = "Procesando...";
  try {
    return await fn();
  } finally {
    button.disabled = previousDisabled;
    button.classList.remove("opacity-60", "cursor-not-allowed");
    button.innerText = previousText;
  }
}

function normalizePhotoURL(url, fallbackName = "Usuario") {
  const fallback = `https://ui-avatars.com/api/?background=334155&color=f8fafc&size=128&name=${encodeURIComponent(fallbackName)}`;
  if (!url || typeof url !== "string") {
    return fallback;
  }
  return sanitizeHttpUrl(url, fallback);
}

function normalizeProfileData(data, fallbackName = "Usuario") {
  const displayName = (data && typeof data.displayName === "string" && data.displayName.trim())
    ? data.displayName.trim().slice(0, 40)
    : fallbackName;
  const photoURL = normalizePhotoURL(data ? data.photoURL : "", displayName);
  return { displayName, photoURL };
}

function normalizePredictionsData(rawData) {
  if (!rawData || typeof rawData !== "object") return {};
  const normalized = {};
  Object.entries(rawData).forEach(([userId, entry]) => {
    if (!userId || !entry || typeof entry !== "object") return;
    const answers = {};
    const rawAnswers = entry.answers && typeof entry.answers === "object" ? entry.answers : {};
    OSCAR_SURVEY.forEach((category) => {
      const value = rawAnswers[category.key];
      if (category.candidates.includes(value)) answers[category.key] = value;
    });
    normalized[userId] = {
      answers,
      updatedAt: Number(entry.updatedAt) || 0,
      displayName: typeof entry.displayName === "string" ? entry.displayName.slice(0, 40) : "",
      photoURL: sanitizeHttpUrl(entry.photoURL || "", "")
    };
  });
  return normalized;
}

function normalizePredictionWinners(rawData) {
  if (!rawData || typeof rawData !== "object") return {};
  const normalized = {};
  OSCAR_SURVEY.forEach((category) => {
    const winner = rawData[category.key];
    if (category.candidates.includes(winner)) {
      normalized[category.key] = winner;
    }
  });
  return normalized;
}

function normalizeRecommendationData(data, fallbackId = "") {
  if (!data || typeof data !== "object") return null;
  const fromUid = typeof data.fromUid === "string" ? data.fromUid : fallbackId;
  const title = truncateClean(data.title, MAX_MOVIE_TITLE_LENGTH);
  const note = truncateClean(data.note, MAX_RECOMMENDATION_NOTE_LENGTH);
  if (!fromUid || !title) return null;
  return {
    fromUid,
    title,
    note,
    createdAt: Number(data.createdAt) || 0,
    displayName: typeof data.displayName === "string" ? data.displayName.slice(0, 40) : "",
    photoURL: sanitizeHttpUrl(data.photoURL || "", "")
  };
}

function hasPublishedWinners() {
  return OSCAR_SURVEY.every((category) => typeof predictionWinners[category.key] === "string");
}

async function fetchProfilesToCache(userIds) {
  const pending = (Array.isArray(userIds) ? userIds : []).filter(
    (id) => id && !profileCache[id] && !loadingProfileIds.has(id)
  );
  if (!pending.length) return;
  pending.forEach((id) => loadingProfileIds.add(id));
  try {
    const snaps = await Promise.all(pending.map((id) => getDoc(doc(db, "profiles", id))));
    snaps.forEach((snap, index) => {
      const id = pending[index];
      const profile = snap.exists() ? snap.data() : {};
      profileCache[id] = normalizeProfileData(profile, "Usuario");
      loadingProfileIds.delete(id);
    });
    renderPredictions();
    renderRecommendations();
  } catch (err) {
    console.error("No se pudieron cargar perfiles para el ranking", err);
    pending.forEach((id) => loadingProfileIds.delete(id));
  }
}

async function loadAdminUsers() {
  try {
    const snap = await getDocs(collection(db, "admins"));
    adminUserIds = snap.docs.map((adminDoc) => adminDoc.id).filter(Boolean);
    await fetchProfilesToCache(adminUserIds);
    renderRecommendations();
  } catch (err) {
    console.error("No se pudieron cargar usuarios para recomendaciones", err);
    adminUserIds = [];
    renderRecommendations();
  }
}

function getCurrentUserPredictionAnswers() {
  return predictionsByUser[uid] && predictionsByUser[uid].answers ? predictionsByUser[uid].answers : {};
}

function computePredictionsRanking() {
  const scoringEnabled = hasPublishedWinners();

  const ranking = Object.entries(predictionsByUser).map(([userId, entry]) => {
    let score = 0;
    let answered = 0;
    OSCAR_SURVEY.forEach((category) => {
      const picked = entry.answers ? entry.answers[category.key] : "";
      if (picked) {
        answered += 1;
        if (scoringEnabled && predictionWinners[category.key] === picked) {
          score += 1;
        }
      }
    });
    return {
      userId,
      score: scoringEnabled ? score : null,
      answered,
      updatedAt: Number(entry.updatedAt) || 0,
      displayName: entry.displayName || "",
      photoURL: entry.photoURL || ""
    };
  });

  ranking.sort((a, b) => {
    if (scoringEnabled && b.score !== a.score) return b.score - a.score;
    if (b.answered !== a.answered) return b.answered - a.answered;
    return b.updatedAt - a.updatedAt;
  });

  return { ranking, scoringEnabled };
}

function renderPredictions() {
  const layout = document.getElementById("predictions-layout");
  const formCard = document.getElementById("predictions-form-card");
  const formContainer = document.getElementById("predictions-form");
  const rankingContainer = document.getElementById("predictions-ranking");
  const saveButton = document.getElementById("save-predictions-btn");
  const toggleEditButton = document.getElementById("toggle-predictions-edit-btn");
  if (!layout || !formCard || !formContainer || !rankingContainer || !saveButton || !toggleEditButton) return;

  const answers = getCurrentUserPredictionAnswers();
  const canEditPredictions = Boolean(isAdminFlag && uid && sharedDocRef);
  const hasUserPrediction = Object.keys(answers).length > 0;
  const showSurvey = canEditPredictions && isEditingPredictions;

  toggleEditButton.classList.toggle("hidden", !canEditPredictions);
  toggleEditButton.innerText = showSurvey ? "Cancelar" : (hasUserPrediction ? "Editar encuesta" : "Crear encuesta");
  formCard.classList.toggle("hidden", !showSurvey);
  saveButton.classList.toggle("hidden", !showSurvey);
  layout.classList.toggle("lg:grid-cols-2", showSurvey);
  layout.classList.toggle("lg:grid-cols-1", !showSurvey);

  if (showSurvey) {
    formContainer.innerHTML = OSCAR_SURVEY.map((category) => {
      const options = category.candidates.map((candidate) => {
        const selected = answers[category.key] === candidate ? "selected" : "";
        return `<option value="${escapeHtml(candidate)}" ${selected}>${escapeHtml(candidate)}</option>`;
      }).join("");
      return `
        <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-3">
          <label class="block text-sm text-slate-300 mb-2">${escapeHtml(category.label)}</label>
          <select data-prediction-key="${escapeHtml(category.key)}" class="w-full p-2 rounded bg-slate-900 border border-slate-600 text-slate-100">
            <option value="">Selecciona candidata</option>
            ${options}
          </select>
        </div>`;
    }).join("");
  } else {
    formContainer.innerHTML = "";
  }

  const { ranking, scoringEnabled } = computePredictionsRanking();
  if (!ranking.length) {
    rankingContainer.innerHTML = `<div class="text-slate-400 text-sm">Todavia no hay predicciones guardadas.</div>`;
    return;
  }

  const unknownUsers = [];
  const statusBanner = scoringEnabled
    ? `<div class="text-xs text-emerald-300 bg-emerald-900/20 border border-emerald-700/40 rounded-lg px-3 py-2">Resultados publicados. Puntos activos.</div>`
    : `<div class="text-xs text-amber-300 bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-2">Sin ganadoras oficiales: puntuacion pendiente.</div>`;

  rankingContainer.innerHTML = statusBanner + ranking.map((row, index) => {
    const profile = profileCache[row.userId] || null;
    const displayName = row.displayName || (profile ? profile.displayName : `Usuario ${row.userId.slice(0, 6)}`);
    const photoURL = normalizePhotoURL(row.photoURL || (profile ? profile.photoURL : ""), displayName);
    if (!row.displayName && !profileCache[row.userId]) unknownUsers.push(row.userId);

    return `
      <div class="flex items-center gap-3 bg-slate-800/80 border border-slate-700 rounded-xl p-3">
        <div class="w-7 text-center font-black ${index < 3 ? "text-yellow-400" : "text-slate-500"}">#${index + 1}</div>
        <img src="${escapeHtml(photoURL)}" alt="Foto" class="w-10 h-10 rounded-full object-cover border border-slate-600 bg-slate-700">
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-slate-100 truncate">${escapeHtml(displayName)}</div>
          <div class="text-xs text-slate-400">${row.answered}/${OSCAR_SURVEY.length} categorias</div>
        </div>
        <div class="text-right">
          <div class="text-yellow-400 font-black text-lg">${scoringEnabled ? row.score : "--"}</div>
          <div class="text-[11px] text-slate-500">${scoringEnabled ? "pts" : "pend."}</div>
        </div>
      </div>`;
  }).join("");

  if (unknownUsers.length) fetchProfilesToCache(unknownUsers);
}

function getProfileForUser(userId) {
  if (userId === uid) return userProfile;
  return profileCache[userId] || null;
}

function renderWebImprovements() {
  const grid = document.getElementById("web-movies-grid");
  if (!grid) return;

  grid.innerHTML = "";

  const sortedMovies = [...sharedMovies].sort((a, b) => {
    const votesA = a.votes ? Object.keys(a.votes).length : 0;
    const votesB = b.votes ? Object.keys(b.votes).length : 0;

    if (votesA !== votesB) return votesB - votesA;

    const ratingA = a.rating ? parseFloat(a.rating) : 0;
    const ratingB = b.rating ? parseFloat(b.rating) : 0;
    return ratingB - ratingA;
  });

  sortedMovies.forEach((m, i) => {
    const realIndex = sharedMovies.indexOf(m);
    const votes = m.votes ? Object.keys(m.votes).length : 0;
    const voted = uid && m.votes && m.votes[uid];
    const isTime = /^[\d:.]+$/.test(m.time);
    const extraClass = isTime ? "" : "text-custom";
    const safeTitle = escapeHtml(m.title || "");
    const safeTime = escapeHtml(m.time || "");
    const imdbSearchUrl = escapeHtml(`https://www.imdb.com/find?q=${encodeURIComponent(m.title || "")}`);
    const parsedRating = Number.parseFloat(m.rating);
    const safeRating = Number.isFinite(parsedRating) ? parsedRating.toFixed(1) : null;

    grid.innerHTML += `
      <div class="relative bg-slate-800 rounded-xl overflow-hidden border border-slate-700 flex flex-row md:flex-col items-center md:items-stretch shadow-xl transition-transform hover:scale-[1.01]">
        ${isAdminFlag ? `<button onclick="deleteMovie(${realIndex}, event)" class="absolute top-2 right-2 z-20 text-slate-500 hover:text-red-500 p-1"><i class="fas fa-times"></i></button>` : ''}
        
        <div class="p-4 flex-1 w-full">
          <span class="time-badge ${extraClass} bg-yellow-500 text-black rounded uppercase">${safeTime}</span>
          
          <h3 class="text-xl font-bold mt-2 leading-tight">
            <a href="${imdbSearchUrl}" target="_blank" rel="noopener noreferrer" class="hover:text-yellow-400 transition-colors">
              ${safeTitle}
            </a>
          </h3>

          ${safeRating ? `<div class="text-yellow-400 font-bold mt-1 flex items-center gap-1 text-sm"><i class="fas fa-star"></i> IMDb ${safeRating}/10</div>` : ""}
          
          <button onclick="toggleVoteWeb(${realIndex})" class="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-bold transition-all ${voted ? "bg-green-600" : "bg-slate-700 hover:bg-slate-600"}">
            <i class="fas fa-thumbs-up"></i>
            <span>${votes}</span>
          </button>
        </div>
      </div>`;
  });
}

function renderRecommendations() {
  const recipientSelect = document.getElementById("recommendation-recipient-select");
  const list = document.getElementById("recommendations-list");
  if (!recipientSelect || !list) return;

  const recipients = adminUserIds.filter((userId) => userId !== uid);
  recipientSelect.innerHTML = recipients.length
    ? recipients.map((userId) => {
      const profile = getProfileForUser(userId);
      const label = profile ? profile.displayName : `Usuario ${userId.slice(0, 6)}`;
      return `<option value="${escapeHtml(userId)}">${escapeHtml(label)}</option>`;
    }).join("")
    : `<option value="">No hay otros usuarios</option>`;

  if (!recommendations.length) {
    list.innerHTML = `<div class="text-slate-400 text-sm bg-slate-800/80 border border-slate-700 rounded-xl p-4">Todavia no tienes recomendaciones.</div>`;
    return;
  }

  const sorted = [...recommendations].sort((a, b) => b.createdAt - a.createdAt);
  list.innerHTML = sorted.map((rec) => {
    const profile = getProfileForUser(rec.fromUid);
    const displayName = rec.displayName || (profile ? profile.displayName : `Usuario ${rec.fromUid.slice(0, 6)}`);
    const photoURL = normalizePhotoURL(rec.photoURL || (profile ? profile.photoURL : ""), displayName);
    return `
      <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-4">
        <div class="flex items-center gap-3 mb-3">
          <img src="${escapeHtml(photoURL)}" alt="Foto" class="w-10 h-10 rounded-full object-cover border border-slate-600 bg-slate-700">
          <div class="min-w-0">
            <div class="text-xs text-slate-400">Recomendada por</div>
            <div class="font-semibold text-slate-100 truncate">${escapeHtml(displayName)}</div>
          </div>
        </div>
        <div class="text-lg font-bold text-yellow-400">${escapeHtml(rec.title)}</div>
        ${rec.note ? `<p class="text-sm text-slate-300 mt-2 whitespace-pre-wrap">${escapeHtml(rec.note)}</p>` : ""}
      </div>`;
  }).join("");
}

function showMainView(viewName) {
  currentMainView = ["groups", "profile", "predictions", "recommendations", "web"].includes(viewName) ? viewName : "groups";
  const groupsView = document.getElementById("groups-view");
  const profileView = document.getElementById("profile-view");
  const predictionsView = document.getElementById("predictions-view");
  const recommendationsView = document.getElementById("recommendations-view");
  const webView = document.getElementById("web-view");
  if (!groupsView || !profileView || !predictionsView || !recommendationsView) return;

  if (currentMainView === "profile") {
    groupsView.classList.add("hidden");
    profileView.classList.remove("hidden");
    predictionsView.classList.add("hidden");
    recommendationsView.classList.add("hidden");
    webView.classList.add("hidden");
  } else if (currentMainView === "predictions") {
    groupsView.classList.add("hidden");
    profileView.classList.add("hidden");
    predictionsView.classList.remove("hidden");
    recommendationsView.classList.add("hidden");
    webView.classList.add("hidden");
    renderPredictions();
  } else if (currentMainView === "recommendations") {
    groupsView.classList.add("hidden");
    profileView.classList.add("hidden");
    predictionsView.classList.add("hidden");
    recommendationsView.classList.remove("hidden");
    webView.classList.add("hidden");
    renderRecommendations();

  } else if (currentMainView === "web") {
    groupsView.classList.add("hidden");
    profileView.classList.add("hidden");
    predictionsView.classList.add("hidden");
    recommendationsView.classList.add("hidden");
    webView.classList.remove("hidden");

    renderWebImprovements();

  } else {
    profileView.classList.add("hidden");
    predictionsView.classList.add("hidden");
    recommendationsView.classList.add("hidden");
    webView.classList.add("hidden");
    groupsView.classList.remove("hidden");
  }
  updateNavbarViewState();
}

function updateProfileUI() {
  const nameInput = document.getElementById("profile-name-input");
  const photoInput = document.getElementById("profile-photo-input");
  const photoPreview = document.getElementById("profile-photo-preview");
  const userIdDisplay = document.getElementById("user-id-display");

  if (!uid) {
    if (userIdDisplay) userIdDisplay.innerText = "";
    return;
  }

  if (photoPreview) photoPreview.src = userProfile.photoURL;
  if (nameInput) nameInput.value = userProfile.displayName;
  if (photoInput) photoInput.value = userProfile.photoURL.includes("ui-avatars.com") ? "" : userProfile.photoURL;
  if (userIdDisplay) userIdDisplay.innerText = `UID: ${uid}`;
}

async function loadOrCreateProfile(user) {
  if (!user || !user.uid) return;
  const profileRef = doc(db, "profiles", user.uid);
  const fallbackName = getDefaultDisplayName(user);
  const snap = await getDoc(profileRef);

  if (!snap.exists()) {
    const initial = { displayName: fallbackName, photoURL: "" };
    await setDoc(profileRef, initial, { merge: true });
    userProfile = normalizeProfileData(initial, fallbackName);
  } else {
    userProfile = normalizeProfileData(snap.data(), fallbackName);
  }

  updateProfileUI();
}

/* ========== ADMIN LOGIN / LOGOUT ========== */
document.getElementById("admin-login-btn").onclick = async () => {
  if (authIsLocked()) {
    alert(`Demasiados intentos. Espera ${getRemainingLockSeconds()} segundos.`);
    return;
  }
  const email = normalizeEmail(document.getElementById("admin-email").value);
  const password = document.getElementById("admin-password").value || "";
  if (!isValidEmail(email) || !isValidPassword(password)) {
    alert("Revisa el formato del email y la contraseÃ±a (mÃ­nimo 8 caracteres).");
    return;
  }
  await runWithDisabledButton("admin-login-btn", async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      clearAuthFailures();
    } catch (err) {
      console.error("Error login:", err?.code || err);
      registerAuthFailure();
      alert("No se pudo iniciar sesiÃ³n. Revisa tus credenciales.");
    }
  });
};

document.getElementById("admin-logout-btn").onclick = async () => {
  await signOut(auth);
  alert("SesiÃ³n cerrada");
};

document.getElementById("show-register-btn").onclick = () => {
  document.getElementById("admin-login-panel").classList.add("hidden");
  document.getElementById("register-panel").classList.remove("hidden");
};

document.getElementById("show-login-btn").onclick = () => {
  document.getElementById("register-panel").classList.add("hidden");
  document.getElementById("admin-login-panel").classList.remove("hidden");
};

document.getElementById("register-btn").onclick = async () => {
  if (authIsLocked()) {
    alert(`Demasiados intentos. Espera ${getRemainingLockSeconds()} segundos.`);
    return;
  }
  const email = normalizeEmail(document.getElementById("register-email").value);
  const password = document.getElementById("register-password").value || "";
  if (!isValidEmail(email)) {
    alert("El email no tiene un formato vÃ¡lido.");
    return;
  }
  if (!isValidPassword(password)) {
    alert("La contraseÃ±a debe tener entre 8 y 128 caracteres.");
    return;
  }
  await runWithDisabledButton("register-btn", async () => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      clearAuthFailures();
    } catch (err) {
      console.error("Error registro:", err?.code || err);
      registerAuthFailure();
      alert("No se pudo registrar en este momento.");
    }
  });
};

document.getElementById("logout-no-group-btn").onclick = async () => {
  await signOut(auth);
};

document.getElementById("profile-photo-input").addEventListener("input", (e) => {
  const typedURL = e.target.value.trim();
  const preview = document.getElementById("profile-photo-preview");
  preview.src = normalizePhotoURL(typedURL, userProfile.displayName || "Usuario");
});

document.getElementById("save-profile-btn").onclick = async () => {
  if (!uid) return;
  const typedName = document.getElementById("profile-name-input").value.trim();
  const typedPhoto = document.getElementById("profile-photo-input").value.trim();
  const displayName = truncateClean(typedName || "Usuario", 40);
  const photoURL = typedPhoto ? sanitizeHttpUrl(typedPhoto, "") : "";
  if (typedPhoto && !photoURL) {
    alert("La foto debe ser una URL http o https valida.");
    return;
  }

  await setDoc(doc(db, "profiles", uid), { displayName, photoURL }, { merge: true });
  userProfile = normalizeProfileData({ displayName, photoURL }, displayName);
  updateProfileUI();
  render();
  alert("Perfil guardado.");
};

const navbarMenuBtn = document.getElementById("navbar-menu-btn");
const navbarMenuPanel = document.getElementById("navbar-menu-panel");
const navbarMenuOverlay = document.getElementById("navbar-menu-overlay");
const navbarMenuDrawer = document.getElementById("navbar-menu-drawer");
const navbarMenuCloseBtn = document.getElementById("navbar-menu-close-btn");
const navGroupsBtn = document.getElementById("nav-groups-btn");
const navProfileBtn = document.getElementById("nav-profile-btn");
const navPredictionsBtn = document.getElementById("nav-predictions-btn");
const navRecommendationsBtn = document.getElementById("nav-recommendations-btn");
const navWebBtn = document.getElementById("nav-web-btn");

function updateNavbarViewState() {
  const viewByButton = [
    [navGroupsBtn, "groups"],
    [navProfileBtn, "profile"],
    [navPredictionsBtn, "predictions"],
    [navRecommendationsBtn, "recommendations"]
  ];
  viewByButton.forEach(([button, viewName]) => {
    if (!button) return;
    const isActive = currentMainView === viewName;
    button.classList.toggle("bg-slate-800", isActive);
    button.classList.toggle("text-yellow-400", isActive);
    button.classList.toggle("font-bold", isActive);
  });
}

function openNavbarMenu() {
  navbarMenuPanel.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeNavbarMenu() {
  navbarMenuPanel.classList.add("hidden");
  document.body.style.overflow = "";
}

navbarMenuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (navbarMenuPanel.classList.contains("hidden")) openNavbarMenu();
  else closeNavbarMenu();
});

navbarMenuDrawer.addEventListener("click", (e) => {
  e.stopPropagation();
});

navbarMenuOverlay.addEventListener("click", closeNavbarMenu);
navbarMenuCloseBtn.addEventListener("click", closeNavbarMenu);

navGroupsBtn.addEventListener("click", () => {
  showMainView("groups");
  closeNavbarMenu();
});

navProfileBtn.addEventListener("click", () => {
  showMainView("profile");
  closeNavbarMenu();
});

navPredictionsBtn.addEventListener("click", () => {
  showMainView("predictions");
  closeNavbarMenu();
});

navRecommendationsBtn.addEventListener("click", () => {
  showMainView("recommendations");
  closeNavbarMenu();
});

navWebBtn.addEventListener("click", () => {
  showMainView("web");
  closeNavbarMenu();
});

document.getElementById("toggle-predictions-edit-btn").onclick = () => {
  if (!isAdminFlag || !uid || !sharedDocRef) return;
  isEditingPredictions = !isEditingPredictions;
  renderPredictions();
};

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeNavbarMenu();
});

document.getElementById("save-predictions-btn").onclick = async () => {
  if (!isAdminFlag || !uid || !sharedDocRef) return;
  const answers = {};
  document.querySelectorAll("[data-prediction-key]").forEach((el) => {
    const key = el.getAttribute("data-prediction-key");
    const category = OSCAR_SURVEY.find((c) => c.key === key);
    if (!category) return;
    const picked = (el.value || "").trim();
    if (category.candidates.includes(picked)) {
      answers[key] = picked;
    }
  });
  if (Object.keys(answers).length !== OSCAR_SURVEY.length) {
    alert("Completa todas las categorias antes de guardar.");
    return;
  }

  predictionsByUser[uid] = {
    answers,
    updatedAt: Date.now(),
    displayName: userProfile.displayName || "Usuario",
    photoURL: userProfile.photoURL || ""
  };
  await setDoc(sharedDocRef, { predictions: predictionsByUser }, { merge: true });
  isEditingPredictions = false;
  renderPredictions();
  alert("Predicciones guardadas.");
};

document.getElementById("save-recommendation-btn").onclick = async () => {
  if (!isAdminFlag || !uid) return;
  const recipientId = document.getElementById("recommendation-recipient-select").value;
  const title = truncateClean(document.getElementById("recommendation-title-input").value, MAX_MOVIE_TITLE_LENGTH);
  const note = truncateClean(document.getElementById("recommendation-note-input").value, MAX_RECOMMENDATION_NOTE_LENGTH);
  if (!recipientId || recipientId === uid || !adminUserIds.includes(recipientId)) {
    alert("Elige una persona valida.");
    return;
  }
  if (!title) {
    alert("Escribe el titulo de la pelicula.");
    return;
  }

  await addDoc(collection(db, "recommendations", recipientId, "items"), {
    fromUid: uid,
    title,
    note,
    createdAt: Date.now(),
    displayName: userProfile.displayName || "Usuario",
    photoURL: userProfile.photoURL || ""
  });

  document.getElementById("recommendation-title-input").value = "";
  document.getElementById("recommendation-note-input").value = "";
  alert("Recomendacion enviada.");
};


/* ========== OMDb ========== */
const OMDB_API_KEY = "8b02fcfe";
async function fetchMovieData(title) {
  try {
    const r = await fetch(`https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(title)}`);
    const d = await r.json();
    if (d.Response === "True") {
      return {
        img: d.Poster && d.Poster !== "N/A" ? d.Poster : "https://images.unsplash.com/photo-1485846234645-a62644f84728",
        rating: d.imdbRating && d.imdbRating !== "N/A" ? d.imdbRating : null
      };
    }
  } catch (e) {
    console.error("OMDb error", e);
  }
  return { img: "https://images.unsplash.com/photo-1485846234645-a62644f84728", rating: null };
}

/* ========== INIT: escucha schedule ========= */
function init() {
  if (!docRef) return;
  if (unsubscribeSchedule) unsubscribeSchedule();
  unsubscribeSchedule = onSnapshot(docRef, snap => {
    const data = snap.exists() ? snap.data() : {};
    const baseList = data.list || [{ label: "Dia 1", movies: [] }];
    const ensured = ensureSharedCategory(baseList);
    schedule = ensured.list;
    if (ensured.changed) {
      setDoc(docRef, { list: schedule }, { merge: true });
    }
    render();
  });
}

function initShared() {
  if (!sharedDocRef) return;
  if (unsubscribeShared) unsubscribeShared();
  unsubscribeShared = onSnapshot(sharedDocRef, snap => {
    const data = snap.exists() ? snap.data() : { movies: [], predictions: {}, predictionWinners: {} };
    sharedMovies = Array.isArray(data.movies) ? data.movies : [];
    predictionsByUser = normalizePredictionsData(data.predictions);
    predictionWinners = normalizePredictionWinners(data.predictionWinners);
    if (!snap.exists()) {
      setDoc(sharedDocRef, { movies: sharedMovies, predictions: predictionsByUser, predictionWinners }, { merge: true });
    }
    render();
  });
}

function initRecommendations() {
  if (!uid) return;
  if (unsubscribeRecommendations) unsubscribeRecommendations();
  unsubscribeRecommendations = onSnapshot(collection(db, "recommendations", uid, "items"), snap => {
    recommendations = snap.docs
      .map((recommendationDoc) => normalizeRecommendationData(recommendationDoc.data(), recommendationDoc.id))
      .filter(Boolean);
    const unknownUsers = recommendations.map((rec) => rec.fromUid).filter((userId) => !profileCache[userId]);
    if (unknownUsers.length) fetchProfilesToCache(unknownUsers);
    renderRecommendations();
  }, err => {
    console.error("No se pudieron cargar recomendaciones", err);
    recommendations = [];
    renderRecommendations();
  });
}

/* ========== AUTH STATE CHANGES ========= */
const onAuthStateChangedHandler = async (user) => {
  const loginPanel = document.getElementById("admin-login-panel");
  const controlPanel = document.getElementById("control-panel");
  const mainContent = document.getElementById("main-content"); 
  const registerPanel = document.getElementById("register-panel");
  const noGroupPanel = document.getElementById("no-group-panel");
  
  const mainHeader = document.getElementById("main-header");
  const heroContent = document.getElementById("hero-content");
  const navbarContent = document.getElementById("navbar-content");

  if (!user) {
    if (unsubscribeSchedule) unsubscribeSchedule();
    if (unsubscribeShared) unsubscribeShared();
    if (unsubscribeRecommendations) unsubscribeRecommendations();
    uid = null;
    isAdminFlag = false;
    isEditingPredictions = false;
    predictionsByUser = {};
    predictionWinners = {};
    adminUserIds = [];
    recommendations = [];
    userProfile = { displayName: "Usuario", photoURL: DEFAULT_PROFILE_PHOTO };
    loginPanel.classList.remove("hidden");
    registerPanel.classList.add("hidden");
    noGroupPanel.classList.add("hidden");
    mainContent.classList.add("hidden"); 
    controlPanel.classList.add("hidden");
    mainHeader.classList.remove("is-logged-in");
    heroContent.classList.remove("hidden");
    navbarContent.classList.add("hidden");
    closeNavbarMenu();
    showMainView("groups");
    updateProfileUI();
    return;
  }

  uid = user.uid;
  await loadOrCreateProfile(user);
  userGroups = await getUserGroups(uid);
  isAdminFlag = userGroups.length > 0;

  if (isAdminFlag) {
    selectedGroup = userGroups[0];
    docRef = doc(db, "cine-verano", selectedGroup);
    sharedDocRef = doc(db, "cine-verano", SHARED_DOC_ID);
    loginPanel.classList.add("hidden");
    registerPanel.classList.add("hidden");
    noGroupPanel.classList.add("hidden");
    mainContent.classList.remove("hidden"); 
    controlPanel.classList.remove("hidden");
    mainHeader.classList.add("is-logged-in");
    heroContent.classList.add("hidden");
    navbarContent.classList.remove("hidden");
    closeNavbarMenu();
    isEditingPredictions = false;
    showMainView("groups");
    init();
    initShared();
    loadAdminUsers();
    initRecommendations();
  } else {
    isEditingPredictions = false;
    predictionsByUser = {};
    predictionWinners = {};
    adminUserIds = [];
    recommendations = [];
    loginPanel.classList.add("hidden");
    registerPanel.classList.add("hidden");
    mainContent.classList.add("hidden");
    controlPanel.classList.add("hidden");
    noGroupPanel.classList.remove("hidden");
    mainHeader.classList.remove("is-logged-in");
    heroContent.classList.add("hidden");
    navbarContent.classList.remove("hidden");
    closeNavbarMenu();
    showMainView("groups");
  }
};

onAuthStateChanged(auth, onAuthStateChangedHandler);

/* ========== BORRADO ========== */
window.deleteCategory = async (index, e) => {
  e.stopPropagation();
  if (normalizeLabel(schedule[index]?.label) === normalizeLabel(SHARED_CATEGORY_LABEL)) {
    alert("No se puede eliminar la categorÃ­a compartida.");
    return;
  }
  if (!confirm("Â¿Eliminar esta categorÃ­a y todas sus pelÃ­culas?")) return;
  schedule.splice(index, 1);
  if (currentDay >= schedule.length) currentDay = Math.max(0, schedule.length - 1);
  await setDoc(docRef, { list: schedule }, { merge: true });
};

window.deleteMovie = async (movieIndex, e) => {
  e.stopPropagation();
  if (!confirm("Â¿Eliminar esta pelÃ­cula?")) return;
  const day = schedule[currentDay];
  const isShared = day && normalizeLabel(day.label) === normalizeLabel(SHARED_CATEGORY_LABEL);
  if (isShared) {
    sharedMovies.splice(movieIndex, 1);
    await setDoc(sharedDocRef, { movies: sharedMovies }, { merge: true });
  } else {
    schedule[currentDay].movies.splice(movieIndex, 1);
    await setDoc(docRef, { list: schedule }, { merge: true });
  }
};

/* ========== RENDER ========= */
function render() {
  const titleContainer = document.getElementById("current-day-title").querySelector("span");
  const dropdownList = document.getElementById("dropdown-list");
  const daySelect = document.getElementById("movie-day-select");
  const grid = document.getElementById("movies-grid");

  const day = schedule[currentDay];
  titleContainer.innerText = day ? day.label : (selectedGroup || "");
  const isSharedNoPoster = day && normalizeLabel(day.label) === normalizeLabel(SHARED_CATEGORY_LABEL);
  const activeMovies = isSharedNoPoster ? sharedMovies : (day && day.movies ? day.movies : []);

  dropdownList.innerHTML = "";
  daySelect.innerHTML = "";

  const visibleGroups = userGroups.filter(g => g !== SHARED_DOC_ID);
  if (visibleGroups.length > 1) {
    dropdownList.innerHTML += `<div class="bg-slate-800 px-4 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-widest">Cambiar Grupo</div>`;
    visibleGroups.forEach(g => {
      const encodedGroup = encodeURIComponent(g);
      const safeGroupLabel = escapeHtml(g);
      dropdownList.innerHTML += `
        <button onclick="changeGroupFromToken('${encodedGroup}')" class="px-4 py-2 text-left hover:bg-slate-700 text-sm ${g === selectedGroup ? "text-yellow-500" : "text-slate-300"}">
          <i class="fas fa-users mr-2 opacity-50"></i>${safeGroupLabel}
        </button>`;
    });
    dropdownList.innerHTML += `<div class="border-t border-slate-700 my-1"></div>`;
  }

  dropdownList.innerHTML += `<div class="bg-slate-800 px-4 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-widest">DÃ­as / Cartelera</div>`;

  schedule.forEach((d, i) => {
    const isShared = normalizeLabel(d.label) === normalizeLabel(SHARED_CATEGORY_LABEL);
    const safeDayLabel = escapeHtml(d.label || "");
    dropdownList.innerHTML += `
      <div class="flex items-center hover:bg-slate-800 border-b border-slate-800 last:border-0">
        <button onclick="changeDay(${i})" class="flex-1 px-4 py-3 text-left ${i === currentDay ? "text-yellow-400 font-bold" : "text-white"}">
          <i class="fas fa-calendar-day mr-2 opacity-50"></i>${safeDayLabel}
        </button>
        ${isAdminFlag && !isShared ? `<button onclick="deleteCategory(${i}, event)" class="px-4 text-slate-500 hover:text-red-500"><i class="fas fa-times"></i></button>` : ''}
      </div>`;
    daySelect.innerHTML += `<option value="${i}">${safeDayLabel}</option>`;
  });

  grid.innerHTML = "";
  if (!day || !activeMovies) {
    renderPredictions();
    return;
  }

  // ORDENAR POR VOTOS Y LUEGO POR NOTA
  const sortedMovies = [...activeMovies].sort((a, b) => {
    const votesA = a.votes ? Object.keys(a.votes).length : 0;
    const votesB = b.votes ? Object.keys(b.votes).length : 0;

    if (votesA !== votesB) {
      return votesB - votesA;
    } else {
      const ratingA = a.rating ? parseFloat(a.rating) : 0;
      const ratingB = b.rating ? parseFloat(b.rating) : 0;
      return ratingB - ratingA;
    }
  });

  sortedMovies.forEach(m => {
    const realIndex = activeMovies.indexOf(m);
    const votes = m.votes ? Object.keys(m.votes).length : 0;
    const voted = uid && m.votes && m.votes[uid];
    const isTime = /^[\d:.]+$/.test(m.time);
    const extraClass = isTime ? "" : "text-custom";
    const safeTitle = escapeHtml(m.title || "");
    const safeTime = escapeHtml(m.time || "");
    const safeImg = escapeHtml(sanitizeHttpUrl(m.img, "https://images.unsplash.com/photo-1485846234645-a62644f84728"));
    const imdbSearchUrl = escapeHtml(`https://www.imdb.com/find?q=${encodeURIComponent(m.title || "")}`);
    const parsedRating = Number.parseFloat(m.rating);
    const safeRating = Number.isFinite(parsedRating) ? parsedRating.toFixed(1) : null;

    grid.innerHTML += `
      <div class="relative bg-slate-800 rounded-xl overflow-hidden border border-slate-700 flex flex-row md:flex-col items-center md:items-stretch shadow-xl transition-transform hover:scale-[1.01] ${isSharedNoPoster ? "py-2 md:py-0" : ""}">
        ${isAdminFlag ? `<button onclick="deleteMovie(${realIndex}, event)" class="absolute top-2 right-2 z-20 text-slate-500 hover:text-red-500 p-1"><i class="fas fa-times"></i></button>` : ''}
        
        ${isSharedNoPoster ? "" : `<img src="${safeImg}" class="w-28 h-40 ml-4 mt-4 mb-4 rounded-lg md:m-0 md:rounded-none md:w-full md:aspect-[2/3] object-cover bg-black">`}
        
        <div class="p-4 flex-1 w-full">
          <span class="time-badge ${extraClass} bg-yellow-500 text-black rounded uppercase">${safeTime}</span>
          
          <h3 class="text-xl font-bold mt-2 leading-tight">
            <a href="${imdbSearchUrl}" target="_blank" rel="noopener noreferrer" class="hover:text-yellow-400 transition-colors">
              ${safeTitle}
            </a>
          </h3>

          ${safeRating ? `<div class="text-yellow-400 font-bold mt-1 flex items-center gap-1 text-sm"><i class="fas fa-star"></i> IMDb ${safeRating}/10</div>` : ""}
          
          <button onclick="toggleVote(${currentDay},${realIndex})" class="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-bold transition-all ${voted ? "bg-green-600" : "bg-slate-700 hover:bg-slate-600"}">
            <i class="fas fa-thumbs-up"></i>
            <span>${votes}</span>
          </button>
        </div>
      </div>`;
  });
  renderPredictions();
}

window.toggleMenu = () => { document.getElementById("dropdown-menu").classList.toggle("hidden"); };
window.changeDay = (i) => { currentDay = i; document.getElementById("dropdown-menu").classList.add("hidden"); render(); };
window.changeGroup = (groupName) => { selectedGroup = groupName; docRef = doc(db, "cine-verano", selectedGroup); document.getElementById("dropdown-menu").classList.add("hidden"); init(); };
window.changeGroupFromToken = (groupToken) => {
  const decoded = decodeURIComponent(groupToken || "");
  window.changeGroup(decoded);
};

window.addEventListener('click', (e) => {
  if (!document.getElementById('current-day-title').contains(e.target)) {
    document.getElementById('dropdown-menu').classList.add('hidden');
  }
  if (!navbarMenuPanel.classList.contains("hidden")
      && !navbarMenuDrawer.contains(e.target)
      && !navbarMenuBtn.contains(e.target)) {
    document.getElementById('navbar-menu-panel').classList.add('hidden');
  }
});

window.toggleVoteWeb = async (m) => {
  if (!isAdminFlag || !uid) {
    alert("Solo los administradores pueden votar.");
    return;
  }

  const movie = sharedMovies[m];
  if (!movie) return;

  if (!movie.votes) movie.votes = {};

  if (movie.votes[uid]) delete movie.votes[uid];
  else movie.votes[uid] = true;

  await setDoc(sharedDocRef, { movies: sharedMovies }, { merge: true });
  renderWebImprovements();
};

window.toggleVote = async (d,m) => {
  if (!isAdminFlag || !uid) { alert("Solo los administradores pueden votar."); return; }
  const day = schedule[d];
  const isShared = day && normalizeLabel(day.label) === normalizeLabel(SHARED_CATEGORY_LABEL);
  const list = isShared ? sharedMovies : (day && day.movies ? day.movies : []);
  const movie = list[m];
  if (!movie) return;
  if (!movie.votes) movie.votes = {};
  if (movie.votes[uid]) delete movie.votes[uid];
  else movie.votes[uid] = true;
  if (isShared) {
    await setDoc(sharedDocRef, { movies: list }, { merge: true });
  } else {
    await setDoc(docRef, { list: schedule }, { merge: true });
  }
};

document.getElementById("add-category-btn").onclick = async () => {
  if (!isAdminFlag) return;
  const label = truncateClean(document.getElementById("new-category-label").value, MAX_CATEGORY_LABEL_LENGTH);
  if (!label) return;
  if (normalizeLabel(label) === normalizeLabel(SHARED_CATEGORY_LABEL)) {
    alert("Esa categorÃ­a ya estÃ¡ compartida para todos los grupos.");
    return;
  }
  schedule.push({ label, movies: [] });
  document.getElementById("new-category-label").value = "";
  await setDoc(docRef, { list: schedule }, { merge: true });
};

document.getElementById("add-movie-btn").onclick = async () => {
  if (!isAdminFlag) return;
  const d = Number.parseInt(document.getElementById("movie-day-select").value, 10);
  const t = truncateClean(document.getElementById("new-movie-title").value, MAX_MOVIE_TITLE_LENGTH);
  const h = truncateClean(document.getElementById("new-movie-details").value, MAX_MOVIE_DETAILS_LENGTH);
  if (!t || !h) return;
  if (!Number.isInteger(d) || d < 0 || d >= schedule.length) return;
  const data = await fetchMovieData(t);
  const day = schedule[d];
  const isShared = day && normalizeLabel(day.label) === normalizeLabel(SHARED_CATEGORY_LABEL);
  if (isShared) {
    sharedMovies.push({ title: t, time: h, img: data.img, rating: data.rating, votes: {} });
    await setDoc(sharedDocRef, { movies: sharedMovies }, { merge: true });
  } else {
    schedule[d].movies.push({ title: t, time: h, img: data.img, rating: data.rating, votes: {} });
    await setDoc(docRef, { list: schedule }, { merge: true });
  }
  document.getElementById("new-movie-title").value = "";
  document.getElementById("new-movie-details").value = "";
};

/* ========== ALEATORIZADOR ========== */
const modal = document.getElementById('randomizer-modal');
const randGrid = document.getElementById('randomizer-grid');
let isRunning = false;

function openRandomizer() {
  const day = schedule[currentDay];
  const isSharedNoPoster = day && normalizeLabel(day.label) === normalizeLabel(SHARED_CATEGORY_LABEL);
  const activeMovies = isSharedNoPoster ? sharedMovies : (day && day.movies ? day.movies : []);
  if (!day || activeMovies.length < 2) {
    alert("AÃ±ade al menos 2 pelÃ­culas");
    return;
  }

  randGrid.innerHTML = "";
  activeMovies.forEach((m, i) => {
    const safeTitle = escapeHtml(m.title || "");
    const safeImg = escapeHtml(sanitizeHttpUrl(m.img, "https://images.unsplash.com/photo-1485846234645-a62644f84728"));
    randGrid.innerHTML += `
      <div class="randomizer-item ${isSharedNoPoster ? "no-poster" : ""}" data-index="${i}">
        ${isSharedNoPoster ? `<span>${safeTitle}</span>` : `<img src="${safeImg}">`}
      </div>`;
  });

  document.getElementById('randomizer-result-box').classList.add('hidden');
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeRandomizer() {
  modal.classList.remove('show');
  document.body.style.overflow = '';
}

document.getElementById('close-randomizer').onclick = closeRandomizer;
document.getElementById('mobile-randomizer-btn').onclick = (e) => {
  e.stopPropagation();
  openRandomizer();
};

document.getElementById('run-randomizer').onclick = () => {
  if (isRunning) return;
  isRunning = true;

  const items = document.querySelectorAll('.randomizer-item');
  const totalSteps = 40 + Math.floor(Math.random() * 20);
  let currentStep = 0;
  let speed = 50;

  function spin() {
    items.forEach(el => el.classList.remove('highlight'));
    const idx = currentStep % items.length;
    items[idx].classList.add('highlight');

    if (currentStep < totalSteps) {
      currentStep++;
      if (currentStep > totalSteps * 0.7) speed += 15;
      setTimeout(spin, speed);
    } else {
      items[idx].classList.add('winner');
      document.getElementById('randomizer-result').innerText =
        (isSharedNoPoster ? sharedMovies[idx].title : schedule[currentDay].movies[idx].title);
      document.getElementById('randomizer-result-box').classList.remove('hidden');
      isRunning = false;
    }
  }

  items.forEach(el => el.classList.remove('winner', 'highlight'));
  document.getElementById('randomizer-result-box').classList.add('hidden');
  spin();
};

document.getElementById('reset-randomizer').onclick = () => {
  document.querySelectorAll('.randomizer-item')
    .forEach(el => el.classList.remove('winner', 'highlight'));
  document.getElementById('randomizer-result-box').classList.add('hidden');
};


