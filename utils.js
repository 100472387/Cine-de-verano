export function normalizeLabel(label) {
  return (label || "").trim().toLowerCase();
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function sanitizeHttpUrl(url, fallback = "") {
  if (!url || typeof url !== "string") return fallback;
  try {
    const parsed = new URL(url.trim(), window.location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch (e) {
    return fallback;
  }
  return fallback;
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  const normalized = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function isValidPassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 128;
}

export function truncateClean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

export async function runWithDisabledButton(buttonId, fn) {
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

/* ========== NOTIFICACIONES (TOAST) ========== */
const TOAST_ICON_BY_TYPE = {
  success: "fa-circle-check",
  error: "fa-circle-exclamation",
  info: "fa-circle-info"
};

/**
 * Muestra una notificación flotante no bloqueante.
 * Sustituye a los alert() nativos, que interrumpen el flujo y no
 * funcionan bien en móvil. Si el contenedor no existe en el DOM
 * (por ejemplo en una página antigua sin actualizar), cae de forma
 * segura a la consola para no romper la ejecución.
 */
export function showToast(message, type = "info", duration = 3800) {
  const container = document.getElementById("toast-container");
  if (!container) {
    if (type === "error") console.error(message);
    else console.log(message);
    return;
  }
  const icon = TOAST_ICON_BY_TYPE[type] || TOAST_ICON_BY_TYPE.info;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "status");
  toast.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("toast-out");
    window.setTimeout(() => toast.remove(), 220);
  }, duration);
}

/* ========== ERRORES INLINE EN FORMULARIOS ========== */
/**
 * Muestra u oculta un mensaje de error bajo un formulario (login/registro).
 * Pasar message = "" o null oculta el bloque.
 */
export function setInlineError(errorElementId, message) {
  const el = document.getElementById(errorElementId);
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.classList.remove("hidden");
  } else {
    el.textContent = "";
    el.classList.add("hidden");
  }
}

/* ========== FETCH CON TIMEOUT ========== */
/**
 * Envoltorio de fetch que aborta la petición pasado un tiempo máximo,
 * para que una API externa lenta (p.ej. OMDb) no deje el botón
 * "Procesando..." colgado indefinidamente.
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

/* ========== COMPOSICIÓN DE IMÁGENES (PORT DESDE PYTHON) ========== */
const MAX_COLLAGE_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB por foto

function isUsableImageFile(file) {
  return file && typeof file.type === "string" && file.type.startsWith("image/") && file.size <= MAX_COLLAGE_IMAGE_BYTES;
}

export async function generarComposicion3x2() {
  const file1 = document.getElementById('photo-input-1').files[0];
  const file2 = document.getElementById('photo-input-2').files[0];

  if (!file1 || !file2) {
    showToast("Selecciona ambas imágenes para poder realizar la composición.", "info");
    return;
  }
  if (!isUsableImageFile(file1) || !isUsableImageFile(file2)) {
    showToast("Cada imagen debe ser un archivo de imagen válido de menos de 20 MB.", "error");
    return;
  }

  const porcAltoRaw = parseFloat(document.getElementById('photo-porc-alto').value);
  const porcGapRaw = parseFloat(document.getElementById('photo-porc-gap').value);
  const porcAlto = Number.isFinite(porcAltoRaw) && porcAltoRaw > 0 ? Math.min(porcAltoRaw, 1) : 1.0;
  const porcGap = Number.isFinite(porcGapRaw) && porcGapRaw >= 0 ? Math.min(porcGapRaw, 0.5) : 0.0;

  // Helper para transformar archivos subidos en objetos Image cargados en memoria
  const cargarImagenNativa = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo decodificar la imagen"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });

  try {
    const [img1, img2] = await Promise.all([cargarImagenNativa(file1), cargarImagenNativa(file2)]);

    // 1. Determinar dimensiones base (Equivalente a img1.size[1])
    const h_referencia = Math.max(img1.naturalHeight, img2.naturalHeight);

    // 2. Cálculo del tamaño exacto del lienzo 3:2
    const alto_lienzo = Math.floor(h_referencia / porcAlto);
    const ancho_lienzo = Math.floor(alto_lienzo * 1.5);

    // 3. Redimensionar manteniendo proporciones
    const w1_new = Math.floor(h_referencia * (img1.naturalWidth / img1.naturalHeight));
    const w2_new = Math.floor(h_referencia * (img2.naturalWidth / img2.naturalHeight));

    // 4. Calcular el gap intermedio proporcional
    const gap = Math.floor(h_referencia * porcGap);

    // 5. Centrado absoluto del bloque
    const ancho_combinado_fotos = w1_new + w2_new + gap;
    const margen_izquierdo_total = Math.floor((ancho_lienzo - ancho_combinado_fotos) / 2);
    const margen_superior = Math.floor((alto_lienzo - h_referencia) / 2);

    // 6. Inicializar el canvas HTML5 (Equivalente a Image.new en PIL)
    const canvas = document.createElement('canvas');
    canvas.width = ancho_lienzo;
    canvas.height = alto_lienzo;
    const ctx = canvas.getContext('2d');

    // Rellenar fondo con color blanco limpio
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, ancho_lienzo, alto_lienzo);

    // Pegar Foto 1 (Izquierda)
    ctx.drawImage(img1, margen_izquierdo_total, margen_superior, w1_new, h_referencia);

    // Pegar Foto 2 (Derecha)
    const x2 = margen_izquierdo_total + w1_new + gap;
    ctx.drawImage(img2, x2, margen_superior, w2_new, h_referencia);

    // 7. Extraer resultado en formato JPEG de alta calidad (95%)
    const resultadoDataUrl = canvas.toDataURL('image/jpeg', 0.95);

    // Mostrar en la interfaz web y asociar enlace de descarga
    document.getElementById('collage-output-img').src = resultadoDataUrl;
    document.getElementById('download-collage-btn').href = resultadoDataUrl;
    document.getElementById('collage-result-container').classList.remove('hidden');

    showToast(`Composición lista (${ancho_lienzo}×${alto_lienzo}px).`, "success");
  } catch (error) {
    console.error("Error procesando las imágenes:", error);
    showToast("Hubo un error al procesar las imágenes. Asegúrate de que son archivos válidos.", "error");
  }
}
