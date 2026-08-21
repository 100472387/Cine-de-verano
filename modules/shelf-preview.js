import { sanitizeHttpUrl } from "../utils.js";

const FORMAT_LABELS = {
  dvd: "DVD",
  bluray: "Blu-ray",
  uhd: "4K Ultra HD"
};

export function createShelfPreview({ fallbackPoster }) {
  const modal = document.getElementById("shelf-cover-modal");
  const closeButton = document.getElementById("close-shelf-cover-btn");
  const image = document.getElementById("shelf-cover-image");
  const title = document.getElementById("shelf-cover-title");
  const format = document.getElementById("shelf-cover-format");
  const coverCase = document.getElementById("shelf-cover-case");
  let opener = null;

  function close() {
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("shelf-cover-open");

    if (opener?.isConnected) opener.focus();
    opener = null;
  }

  function open(item, openerElement) {
    if (!modal || !image || !title || !format || !coverCase) return;

    const itemFormat = FORMAT_LABELS[item.format] ? item.format : "bluray";
    opener = openerElement || document.activeElement;
    image.src = sanitizeHttpUrl(item.img, fallbackPoster);
    image.alt = `Carátula de ${item.title}`;
    image.onerror = () => {
      image.onerror = null;
      image.src = fallbackPoster;
    };
    title.textContent = item.title;
    format.textContent = FORMAT_LABELS[itemFormat];
    coverCase.className = `shelf-cover-case shelf-cover-case--${itemFormat}`;

    // Reinicia la animación al seleccionar otra caja sin cerrar el visor.
    modal.classList.remove("show");
    void modal.offsetWidth;
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("shelf-cover-open");
    window.setTimeout(() => closeButton?.focus(), 180);
  }

  closeButton?.addEventListener("click", close);
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal?.classList.contains("show")) close();
  });

  return { open, close };
}
