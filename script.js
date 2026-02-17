/* ========== IMPORTS FIREBASE ========== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, setPersistence, browserSessionPersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, setDoc, getDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
  console.error("No se pudo fijar persistencia de sesión", err);
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
let userProfile = { displayName: "Usuario", photoURL: DEFAULT_PROFILE_PHOTO };
let currentMainView = "groups";

/* ========== FUNCIONES AUX ========== */
function normalizeLabel(label) {
  return (label || "").trim().toLowerCase();
}

function ensureSharedCategory(list) {
  const safeList = Array.isArray(list) ? list : [];
  const exists = safeList.some(d => normalizeLabel(d.label) === normalizeLabel(SHARED_CATEGORY_LABEL));
  if (exists) return { list: safeList, changed: false };
  return { list: [...safeList, { label: SHARED_CATEGORY_LABEL, movies: [] }], changed: true };
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

function showMainView(viewName) {
  currentMainView = viewName === "profile" ? "profile" : "groups";
  const groupsView = document.getElementById("groups-view");
  const profileView = document.getElementById("profile-view");
  if (!groupsView || !profileView) return;

  if (currentMainView === "profile") {
    groupsView.classList.add("hidden");
    profileView.classList.remove("hidden");
  } else {
    profileView.classList.add("hidden");
    groupsView.classList.remove("hidden");
  }
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
    alert("Revisa el formato del email y la contraseña (mínimo 8 caracteres).");
    return;
  }
  await runWithDisabledButton("admin-login-btn", async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      clearAuthFailures();
    } catch (err) {
      console.error("Error login:", err?.code || err);
      registerAuthFailure();
      alert("No se pudo iniciar sesión. Revisa tus credenciales.");
    }
  });
};

document.getElementById("admin-logout-btn").onclick = async () => {
  await signOut(auth);
  alert("Sesión cerrada");
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
    alert("El email no tiene un formato válido.");
    return;
  }
  if (!isValidPassword(password)) {
    alert("La contraseña debe tener entre 8 y 128 caracteres.");
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
  const displayName = (typedName || "Usuario").slice(0, 40);
  const photoURL = typedPhoto;

  await setDoc(doc(db, "profiles", uid), { displayName, photoURL }, { merge: true });
  userProfile = normalizeProfileData({ displayName, photoURL }, displayName);
  updateProfileUI();
  render();
  alert("Perfil guardado.");
};

const navbarMenuBtn = document.getElementById("navbar-menu-btn");
const navbarMenuPanel = document.getElementById("navbar-menu-panel");
const navGroupsBtn = document.getElementById("nav-groups-btn");
const navProfileBtn = document.getElementById("nav-profile-btn");

navbarMenuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  navbarMenuPanel.classList.toggle("hidden");
});

navbarMenuPanel.addEventListener("click", (e) => {
  e.stopPropagation();
});

navGroupsBtn.addEventListener("click", () => {
  showMainView("groups");
  navbarMenuPanel.classList.add("hidden");
});

navProfileBtn.addEventListener("click", () => {
  showMainView("profile");
  navbarMenuPanel.classList.add("hidden");
});


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
    const baseList = snap.exists()
      ? snap.data().list
      : [{ label: "Día 1", movies: [] }];
    const ensured = ensureSharedCategory(baseList);
    schedule = ensured.list;
    if (ensured.changed) {
      setDoc(docRef, { list: schedule });
    }
    render();
  });
}

function initShared() {
  if (!sharedDocRef) return;
  if (unsubscribeShared) unsubscribeShared();
  unsubscribeShared = onSnapshot(sharedDocRef, snap => {
    const data = snap.exists() ? snap.data() : { movies: [] };
    sharedMovies = Array.isArray(data.movies) ? data.movies : [];
    if (!snap.exists()) {
      setDoc(sharedDocRef, { movies: sharedMovies });
    }
    render();
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
  const navbarMenu = document.getElementById("navbar-menu-panel");

  if (!user) {
    uid = null;
    isAdminFlag = false;
    userProfile = { displayName: "Usuario", photoURL: DEFAULT_PROFILE_PHOTO };
    loginPanel.classList.remove("hidden");
    registerPanel.classList.add("hidden");
    noGroupPanel.classList.add("hidden");
    mainContent.classList.add("hidden"); 
    controlPanel.classList.add("hidden");
    mainHeader.classList.remove("is-logged-in");
    heroContent.classList.remove("hidden");
    navbarContent.classList.add("hidden");
    navbarMenu.classList.add("hidden");
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
    navbarMenu.classList.add("hidden");
    showMainView("groups");
    init();
    initShared();
  } else {
    loginPanel.classList.add("hidden");
    registerPanel.classList.add("hidden");
    mainContent.classList.add("hidden");
    controlPanel.classList.add("hidden");
    noGroupPanel.classList.remove("hidden");
    mainHeader.classList.remove("is-logged-in");
    heroContent.classList.add("hidden");
    navbarContent.classList.remove("hidden");
    navbarMenu.classList.add("hidden");
    showMainView("groups");
  }
};

onAuthStateChanged(auth, onAuthStateChangedHandler);

/* ========== BORRADO ========== */
window.deleteCategory = async (index, e) => {
  e.stopPropagation();
  if (normalizeLabel(schedule[index]?.label) === normalizeLabel(SHARED_CATEGORY_LABEL)) {
    alert("No se puede eliminar la categoría compartida.");
    return;
  }
  if (!confirm("¿Eliminar esta categoría y todas sus películas?")) return;
  schedule.splice(index, 1);
  if (currentDay >= schedule.length) currentDay = Math.max(0, schedule.length - 1);
  await setDoc(docRef, { list: schedule });
};

window.deleteMovie = async (movieIndex, e) => {
  e.stopPropagation();
  if (!confirm("¿Eliminar esta película?")) return;
  const day = schedule[currentDay];
  const isShared = day && normalizeLabel(day.label) === normalizeLabel(SHARED_CATEGORY_LABEL);
  if (isShared) {
    sharedMovies.splice(movieIndex, 1);
    await setDoc(sharedDocRef, { movies: sharedMovies });
  } else {
    schedule[currentDay].movies.splice(movieIndex, 1);
    await setDoc(docRef, { list: schedule });
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

  dropdownList.innerHTML += `<div class="bg-slate-800 px-4 py-1 text-[10px] uppercase font-bold text-slate-500 tracking-widest">Días / Cartelera</div>`;

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
  if (!day || !activeMovies) return;

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
  if (!document.getElementById('navbar-content').contains(e.target)) {
    document.getElementById('navbar-menu-panel').classList.add('hidden');
  }
});

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
    await setDoc(sharedDocRef, { movies: list });
  } else {
    await setDoc(docRef, { list: schedule });
  }
};

document.getElementById("add-category-btn").onclick = async () => {
  if (!isAdminFlag) return;
  const label = document.getElementById("new-category-label").value;
  if (!label) return;
  if (normalizeLabel(label) === normalizeLabel(SHARED_CATEGORY_LABEL)) {
    alert("Esa categoría ya está compartida para todos los grupos.");
    return;
  }
  schedule.push({ label, movies: [] });
  document.getElementById("new-category-label").value = "";
  await setDoc(docRef, { list: schedule });
};

document.getElementById("add-movie-btn").onclick = async () => {
  if (!isAdminFlag) return;
  const d = document.getElementById("movie-day-select").value;
  const t = document.getElementById("new-movie-title").value;
  const h = document.getElementById("new-movie-details").value;
  if (!t || !h) return;
  const data = await fetchMovieData(t);
  const day = schedule[d];
  const isShared = day && normalizeLabel(day.label) === normalizeLabel(SHARED_CATEGORY_LABEL);
  if (isShared) {
    sharedMovies.push({ title: t, time: h, img: data.img, rating: data.rating, votes: {} });
    await setDoc(sharedDocRef, { movies: sharedMovies });
  } else {
    schedule[d].movies.push({ title: t, time: h, img: data.img, rating: data.rating, votes: {} });
    await setDoc(docRef, { list: schedule });
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
    alert("Añade al menos 2 películas");
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
