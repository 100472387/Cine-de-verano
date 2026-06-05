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

/* ========== COMPOSICIÓN DE IMÁGENES (PORT DESDE PYTHON) ========== */
export async function generarComposicion3x2() {
  const file1 = document.getElementById('photo-input-1').files[0];
  const file2 = document.getElementById('photo-input-2').files[0];

  if (!file1 || !file2) {
    alert("Por favor, selecciona ambas imágenes para poder realizar la composición.");
    return;
  }

  const porcAlto = parseFloat(document.getElementById('photo-porc-alto').value) || 1.0;
  const porcGap = parseFloat(document.getElementById('photo-porc-gap').value) || 0.0;

  // Helper para transformar archivos subidos en objetos Image cargados en memoria
  const cargarImagenNativa = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  try {
    const img1 = await cargarImagenNativa(file1);
    const img2 = await cargarImagenNativa(file2);

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

    console.log(`¡Composición lista! Lienzo: ${ancho_lienzo}x${alto_lienzo} | Espacio medio: ${gap}px`);
  } catch (error) {
    console.error("Error procesando las imágenes:", error);
    alert("Hubo un error al procesar las imágenes. Asegúrate de que son archivos válidos.");
  }
}
