import { db, doc, onSnapshot, setDoc } from "../firebase-config.js";
import {
  escapeHtml,
  sanitizeHttpUrl,
  truncateClean,
  runWithDisabledButton,
  showToast
} from "../utils.js";

const MAX_ITEMS = 60;
const MAX_TITLE_LENGTH = 120;
const ROW_HEIGHT = 140;
const BOX_HEIGHT = 118;
const BOX_TOP_OFFSET = ROW_HEIGHT - BOX_HEIGHT - 8;
const ITEMS_PER_ROW = 12;
const FORMATS = new Set(["dvd", "bluray", "uhd"]);

export function createShelf({ fetchMovieData, fallbackPoster, isViewActive = () => true }) {
  let userId = null;
  let canEdit = false;
  let shelfDocRef = null;
  let items = [];
  let unsubscribe = null;
  let saveTimer = null;

  const container = document.getElementById("shelf-container");
  const emptyState = document.getElementById("shelf-empty-state");
  const titleInput = document.getElementById("shelf-movie-title-input");
  const formatSelect = document.getElementById("shelf-format-select");
  const addButton = document.getElementById("add-shelf-movie-btn");
  const coverModal = document.getElementById("shelf-cover-modal");
  const coverCloseButton = document.getElementById("close-shelf-cover-btn");
  const coverImage = document.getElementById("shelf-cover-image");
  const coverTitle = document.getElementById("shelf-cover-title");
  const coverFormat = document.getElementById("shelf-cover-format");
  const coverCase = document.getElementById("shelf-cover-case");

  function normalizeFormat(value) {
    return FORMATS.has(value) ? value : "bluray";
  }

  function formatLabel(format) {
    return ({ dvd: "DVD", bluray: "Blu-ray", uhd: "4K Ultra HD" })[normalizeFormat(format)];
  }

  function clampPercent(value) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return 0;
    return Math.min(100, Math.max(0, numberValue));
  }

  function shelfTopForRow(row) {
    return Math.max(0, Math.round(row)) * ROW_HEIGHT + BOX_TOP_OFFSET;
  }

  function snapShelfY(value) {
    const numberValue = Number(value);
    const safeY = Number.isFinite(numberValue) ? Math.max(0, numberValue) : BOX_TOP_OFFSET;
    const row = Math.max(0, Math.round((safeY - BOX_TOP_OFFSET) / ROW_HEIGHT));
    return shelfTopForRow(row);
  }

  function normalizeItems(rawItems) {
    if (!Array.isArray(rawItems)) return [];
    return rawItems
      .filter((item) => item && typeof item === "object" && item.id && item.title)
      .slice(0, MAX_ITEMS)
      .map((item) => ({
        id: String(item.id).slice(0, 60),
        title: truncateClean(item.title, MAX_TITLE_LENGTH),
        img: sanitizeHttpUrl(item.img, fallbackPoster),
        rating: typeof item.rating === "string" || typeof item.rating === "number" ? item.rating : null,
        format: normalizeFormat(item.format),
        x: clampPercent(item.x),
        y: snapShelfY(item.y)
      }));
  }

  function generateItemId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `shelf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function hashSeed(value) {
    let hash = 0;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) | 0;
    }
    return Math.abs(hash);
  }

  function computeNextPosition() {
    const index = items.length;
    const column = index % ITEMS_PER_ROW;
    const row = Math.floor(index / ITEMS_PER_ROW);
    return {
      x: clampPercent((column / ITEMS_PER_ROW) * 100 + 2),
      y: shelfTopForRow(row)
    };
  }

  function persistPosition(id, xPercent, yPx) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;

    item.x = clampPercent(xPercent);
    item.y = snapShelfY(yPx);

    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(async () => {
      if (!shelfDocRef) return;
      try {
        await setDoc(shelfDocRef, { items }, { merge: true });
      } catch (error) {
        console.error("Error al guardar la posición en la estantería:", error);
        showToast("No se pudo guardar la posición. Inténtalo de nuevo.", "error");
      }
    }, 300);
  }

  function closeCover() {
    if (!coverModal) return;
    coverModal.classList.remove("show");
    coverModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("shelf-cover-open");
  }

  function openCover(item) {
    if (!coverModal || !coverImage || !coverTitle || !coverFormat || !coverCase) return;

    const format = normalizeFormat(item.format);
    coverImage.src = sanitizeHttpUrl(item.img, fallbackPoster);
    coverImage.alt = `Carátula de ${item.title}`;
    coverImage.onerror = () => { coverImage.src = fallbackPoster; };
    coverTitle.textContent = item.title;
    coverFormat.textContent = formatLabel(format);
    coverCase.className = `shelf-cover-case shelf-cover-case--${format}`;

    // Fuerza el reinicio de la animación si se abre otra caja sin cerrar el visor.
    coverModal.classList.remove("show");
    void coverModal.offsetWidth;
    coverModal.classList.add("show");
    coverModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("shelf-cover-open");
    window.setTimeout(() => coverCloseButton?.focus(), 180);
  }

  function makeBoxDraggable(boxElement, item) {
    boxElement.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest(".shelf-box-delete")) return;
      if (!container) return;
      event.preventDefault();

      boxElement.setPointerCapture(event.pointerId);
      boxElement.classList.add("dragging");

      const boxRect = boxElement.getBoundingClientRect();
      const grabOffsetX = event.clientX - boxRect.left;
      const grabOffsetY = event.clientY - boxRect.top;
      let pendingXPercent = item.x;
      let pendingYPx = item.y;

      function onMove(moveEvent) {
        const containerRect = container.getBoundingClientRect();
        const boxWidth = boxElement.offsetWidth;
        const boxHeight = boxElement.offsetHeight;
        let leftPx = moveEvent.clientX - containerRect.left - grabOffsetX + container.scrollLeft;
        let topPx = moveEvent.clientY - containerRect.top - grabOffsetY + container.scrollTop;

        const maxLeftPx = Math.max(0, containerRect.width - boxWidth);
        const maxTopPx = Math.max(0, Math.max(container.scrollHeight, containerRect.height) + ROW_HEIGHT - boxHeight);
        leftPx = Math.min(Math.max(leftPx, 0), maxLeftPx);
        topPx = Math.min(Math.max(topPx, 0), maxTopPx);

        pendingXPercent = clampPercent((leftPx / containerRect.width) * 100);
        pendingYPx = snapShelfY(topPx);
        boxElement.style.left = `${pendingXPercent}%`;
        boxElement.style.top = `${pendingYPx}px`;
      }

      function onUp() {
        boxElement.classList.remove("dragging");
        boxElement.removeEventListener("pointermove", onMove);
        boxElement.removeEventListener("pointerup", onUp);
        boxElement.removeEventListener("pointercancel", onUp);

        const moved = Math.abs(pendingXPercent - item.x) > 0.3 || Math.abs(pendingYPx - item.y) > 3;
        if (moved) persistPosition(item.id, pendingXPercent, pendingYPx);
        else openCover(item);
      }

      boxElement.addEventListener("pointermove", onMove);
      boxElement.addEventListener("pointerup", onUp);
      boxElement.addEventListener("pointercancel", onUp);
    });

    boxElement.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openCover(item);
    });
  }

  async function removeItem(id) {
    if (!canEdit || !userId || !shelfDocRef) return;
    if (!window.confirm("¿Quitar esta película de tu estantería?")) return;

    const previousItems = items;
    items = items.filter((item) => item.id !== id);
    render();
    try {
      await setDoc(shelfDocRef, { items }, { merge: true });
    } catch (error) {
      console.error("Error al eliminar de la estantería:", error);
      items = previousItems;
      render();
      showToast("No se pudo quitar la película. Inténtalo de nuevo.", "error");
    }
  }

  function render() {
    if (!container || !emptyState) return;

    if (!items.length) {
      container.classList.add("hidden");
      container.replaceChildren();
      container.style.minHeight = "";
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");
    container.classList.remove("hidden");
    container.replaceChildren();
    let maxBottom = 0;

    items.forEach((item) => {
      const format = normalizeFormat(item.format);
      const box = document.createElement("div");
      const rotation = (hashSeed(item.id) % 5) - 2;
      const safeTitle = escapeHtml(item.title || "");
      const safeImage = escapeHtml(sanitizeHttpUrl(item.img, fallbackPoster));
      const safeId = escapeHtml(item.id);

      box.className = `shelf-box shelf-box--${format}`;
      box.style.left = `${clampPercent(item.x)}%`;
      box.style.top = `${snapShelfY(item.y)}px`;
      box.style.setProperty("--shelf-rotation", `${rotation}deg`);
      box.dataset.id = item.id;
      box.title = item.title;
      box.tabIndex = 0;
      box.setAttribute("aria-label", `Caja de ${item.title}. Pulsa para ver la carátula.`);
      box.innerHTML = `
        <button type="button" class="shelf-box-delete" aria-label="Quitar de la estantería">
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
        <span class="shelf-box-surface">
          <img class="shelf-box-art" src="${safeImage}" alt="" draggable="false">
          <span class="shelf-box-shine" aria-hidden="true"></span>
          <span class="shelf-box-title">${safeTitle}</span>
        </span>
      `;

      const deleteButton = box.querySelector(".shelf-box-delete");
      deleteButton?.addEventListener("click", (event) => {
        event.stopPropagation();
        void removeItem(item.id);
      });

      const art = box.querySelector(".shelf-box-art");
      art?.addEventListener("error", () => { art.src = fallbackPoster; }, { once: true });
      makeBoxDraggable(box, item);
      container.appendChild(box);
      maxBottom = Math.max(maxBottom, snapShelfY(item.y) + ROW_HEIGHT);
    });

    container.style.minHeight = `${Math.max(440, maxBottom + 20)}px`;
  }

  async function addItem() {
    if (!canEdit || !userId || !shelfDocRef) {
      showToast("Inicia sesión con acceso a un grupo para usar la estantería.", "info");
      return;
    }

    const title = truncateClean(titleInput?.value, MAX_TITLE_LENGTH);
    const format = normalizeFormat(formatSelect?.value);
    if (!title) {
      showToast("Escribe el título de la película.", "info");
      titleInput?.focus();
      return;
    }
    if (items.length >= MAX_ITEMS) {
      showToast(`La estantería admite hasta ${MAX_ITEMS} películas.`, "info");
      return;
    }

    await runWithDisabledButton("add-shelf-movie-btn", async () => {
      const previousItems = items;
      try {
        const movieData = await fetchMovieData(title);
        items = [...items, {
          id: generateItemId(),
          title,
          img: movieData.img,
          rating: movieData.rating,
          format,
          ...computeNextPosition()
        }];
        render();
        await setDoc(shelfDocRef, { items }, { merge: true });
        if (titleInput) titleInput.value = "";
        showToast("Película añadida a tu estantería.", "success");
      } catch (error) {
        console.error("Error al añadir a la estantería:", error);
        items = previousItems;
        render();
        showToast("No se pudo añadir la película. Inténtalo de nuevo.", "error");
      }
    });
  }

  function setSession({ uid, editable }) {
    clear();
    userId = uid || null;
    canEdit = Boolean(editable);
    if (!userId) return;

    shelfDocRef = doc(db, "shelves", userId);
    unsubscribe = onSnapshot(shelfDocRef, (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : { items: [] };
      items = normalizeItems(data.items);
      if (isViewActive()) render();
    }, (error) => {
      console.error("Error al escuchar la estantería:", error);
      showToast("No se pudo sincronizar tu estantería.", "error");
    });
  }

  function clear() {
    if (unsubscribe) unsubscribe();
    if (saveTimer) window.clearTimeout(saveTimer);
    unsubscribe = null;
    saveTimer = null;
    userId = null;
    canEdit = false;
    shelfDocRef = null;
    items = [];
    closeCover();
  }

  addButton?.addEventListener("click", () => { void addItem(); });
  titleInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void addItem();
  });
  coverCloseButton?.addEventListener("click", closeCover);
  coverModal?.addEventListener("click", (event) => {
    if (event.target === coverModal) closeCover();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && coverModal?.classList.contains("show")) closeCover();
  });

  return { setSession, clear, render, closeCover };
}
