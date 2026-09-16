import { showToast, truncateClean } from "../utils.js";
import { createBarcodeScanner } from "./barcode-scanner.js";
import { lookupBarcode } from "../services/barcode-lookup.js";

/*
  Orquesta el ciclo completo:
    escanear → buscar el código → confirmar título y formato → guardar.

  La ventana de confirmación siempre permite editar el título, así que el
  flujo funciona igual cuando la base de códigos no encuentra nada.
*/

const VALID_FORMATS = new Set(["dvd", "bluray", "uhd"]);
const MAX_TITLE_LENGTH = 120;
const POSTER_DEBOUNCE_MS = 550;

export function createShelfScan({ addMovie, fetchMovieData, fallbackPoster, canScan = () => true }) {
  const scanner = createBarcodeScanner();

  const modal = document.getElementById("shelf-scan-modal");
  const poster = document.getElementById("shelf-scan-poster");
  const codeLabel = document.getElementById("shelf-scan-code");
  const titleInput = document.getElementById("shelf-scan-title-input");
  const formatSelect = document.getElementById("shelf-scan-format-select");
  const statusLabel = document.getElementById("shelf-scan-status");
  const saveButton = document.getElementById("shelf-scan-save-btn");
  const againButton = document.getElementById("shelf-scan-again-btn");
  const cancelButton = document.getElementById("shelf-scan-cancel-btn");

  let posterTimer = null;
  let posterToken = 0;
  let productImage = "";
  let isConfirmOpen = false;

  function normalizeFormat(value) {
    return VALID_FORMATS.has(value) ? value : "bluray";
  }

  function setStatus(text) {
    if (statusLabel) statusLabel.textContent = text;
  }

  function setPoster(url) {
    if (!poster) return;
    poster.src = url || fallbackPoster;
    poster.onerror = () => {
      poster.onerror = null;
      poster.src = fallbackPoster;
    };
  }

  function setBusy(busy) {
    [saveButton, againButton].forEach((button) => {
      if (button) button.disabled = busy;
    });
  }

  function closeConfirm() {
    isConfirmOpen = false;
    posterToken += 1;
    if (posterTimer) {
      window.clearTimeout(posterTimer);
      posterTimer = null;
    }
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("shelf-scan-open");
  }

  function openConfirm(code) {
    if (!modal) return;
    isConfirmOpen = true;
    productImage = "";
    if (codeLabel) codeLabel.textContent = code;
    if (titleInput) titleInput.value = "";
    if (formatSelect) formatSelect.value = "bluray";
    setPoster(fallbackPoster);
    setBusy(false);
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("shelf-scan-open");
  }

  async function refreshPoster(rawTitle) {
    const title = String(rawTitle || "").trim();
    const token = ++posterToken;
    if (!title) {
      setPoster(productImage || fallbackPoster);
      return;
    }
    try {
      const data = await fetchMovieData(title);
      if (token !== posterToken || !isConfirmOpen) return;
      const found = data?.img && data.img !== fallbackPoster ? data.img : "";
      setPoster(found || productImage || fallbackPoster);
    } catch (error) {
      console.error("No se pudo cargar la carátula:", error);
    }
  }

  function schedulePosterRefresh() {
    if (posterTimer) window.clearTimeout(posterTimer);
    posterTimer = window.setTimeout(() => {
      posterTimer = null;
      void refreshPoster(titleInput?.value);
    }, POSTER_DEBOUNCE_MS);
  }

  async function start() {
    if (!canScan()) {
      showToast("Inicia sesión con acceso a un grupo para escanear películas.", "info");
      return;
    }

    closeConfirm();
    const code = await scanner.open();
    if (!code) return;

    openConfirm(code);
    setStatus("Buscando el código…");

    const info = await lookupBarcode(code);
    if (!isConfirmOpen) return;

    productImage = info.image || "";

    if (info.title) {
      if (titleInput) titleInput.value = truncateClean(info.title, MAX_TITLE_LENGTH);
      if (formatSelect) formatSelect.value = normalizeFormat(info.format);
      setStatus(`Encontrado como "${info.rawTitle}". Corrige el título si hace falta.`);
      void refreshPoster(info.title);
    } else {
      setStatus("Este código no está en la base de datos. Escribe el título y elige el formato.");
      setPoster(productImage || fallbackPoster);
      titleInput?.focus();
    }
  }

  async function save({ scanAgain }) {
    const title = truncateClean(titleInput?.value, MAX_TITLE_LENGTH);
    if (!title) {
      showToast("Escribe el título de la película.", "info");
      titleInput?.focus();
      return;
    }

    setBusy(true);
    const saved = await addMovie({
      title,
      format: normalizeFormat(formatSelect?.value),
      fallbackImage: productImage
    });
    setBusy(false);
    if (!saved) return;

    closeConfirm();
    if (scanAgain) void start();
  }

  titleInput?.addEventListener("input", schedulePosterRefresh);
  titleInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void save({ scanAgain: false });
  });

  saveButton?.addEventListener("click", () => { void save({ scanAgain: false }); });
  againButton?.addEventListener("click", () => { void save({ scanAgain: true }); });
  cancelButton?.addEventListener("click", closeConfirm);
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) closeConfirm();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isConfirmOpen) closeConfirm();
  });

  return {
    start,
    close() {
      scanner.close();
      closeConfirm();
    }
  };
}
