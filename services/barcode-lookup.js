import { fetchWithTimeout } from "../utils.js";

/*
  Traduce un código de barras (EAN-13 / UPC-A) en un título aproximado.

  OMDb no entiende códigos de barras, así que hace falta una base de datos de
  productos. Aquí se usa el endpoint de pruebas de UPCitemdb, que es gratuito
  pero tiene dos límites importantes:
    - 100 consultas al día por IP.
    - No garantiza cabeceras CORS estables para peticiones desde el navegador.
  Por eso todo el flujo está pensado para degradar bien: si la consulta falla,
  se devuelve un resultado vacío y el usuario escribe el título a mano en la
  ventana de confirmación.
*/

const UPC_ENDPOINT = "https://api.upcitemdb.com/prod/trial/lookup?upc=";
const LOOKUP_TIMEOUT_MS = 8000;
const lookupCache = new Map();

const FORMAT_RULES = [
  { format: "uhd", regex: /(\b4\s?k\b|\buhd\b|ultra\s*hd)/i },
  { format: "bluray", regex: /(blu[\s-]*ray|\bbd\b)/i },
  { format: "dvd", regex: /\bdvd\b/i }
];

const NOISE_RULES = [
  /\[[^\]]*\]/g,
  /\([^)]*\)/g,
  /(\b4\s?k\b|\buhd\b|ultra\s*hd|blu[\s-]*ray|\bdvd\b|digital\s*(hd|copy)|combo\s*pack|steelbook|slipcover|import|widescreen|fullscreen|region\s*\w\b|\d+\s*discs?\b)/gi
];

export function detectFormat(text) {
  const source = String(text || "");
  const match = FORMAT_RULES.find((rule) => rule.regex.test(source));
  return match ? match.format : "";
}

export function cleanTitle(rawTitle) {
  let text = String(rawTitle || "");
  NOISE_RULES.forEach((rule) => { text = text.replace(rule, " "); });
  text = text.replace(/\s{2,}/g, " ").trim();
  text = text.replace(/^[\s,;:/|+*_-]+/, "").replace(/[\s,;:/|+*_-]+$/, "");
  return text.trim();
}

function pickImage(item) {
  const images = Array.isArray(item?.images) ? item.images : [];
  const found = images.find((url) => typeof url === "string" && url.startsWith("https://"));
  return found || "";
}

function emptyResult(code) {
  return { code, title: "", rawTitle: "", format: "", image: "", found: false };
}

export async function lookupBarcode(code) {
  const key = String(code || "").trim();
  if (!key) return emptyResult("");
  if (lookupCache.has(key)) return lookupCache.get(key);

  try {
    const response = await fetchWithTimeout(
      `${UPC_ENDPOINT}${encodeURIComponent(key)}`,
      { headers: { Accept: "application/json" } },
      LOOKUP_TIMEOUT_MS
    );
    if (!response.ok) throw new Error(`Respuesta ${response.status} de la base de códigos`);

    const data = await response.json();
    const item = Array.isArray(data.items) ? data.items[0] : null;
    if (!item || !item.title) {
      const miss = emptyResult(key);
      lookupCache.set(key, miss);
      return miss;
    }

    const rawTitle = String(item.title);
    const result = {
      code: key,
      rawTitle,
      title: cleanTitle(rawTitle),
      format: detectFormat(rawTitle),
      image: pickImage(item),
      found: true
    };
    lookupCache.set(key, result);
    return result;
  } catch (error) {
    // Los errores no se cachean: puede ser un corte puntual de red.
    console.error("No se pudo consultar el código de barras:", error);
    return emptyResult(key);
  }
}
