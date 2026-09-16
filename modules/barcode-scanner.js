import { showToast } from "../utils.js";

/*
  Escáner de códigos de barras para la estantería.

  Estrategia en dos niveles:
  1. BarcodeDetector nativo (Chrome/Edge/Android): sin descargas, muy rápido.
  2. ZXing cargado bajo demanda desde CDN: cubre Safari/iOS y Firefox.

  La cámara exige contexto seguro (https:// o localhost). En Firebase Hosting
  esto se cumple; abriendo el index.html con file:// no funcionará.
*/

// ZXing se sirve desde el propio dominio para no chocar con script-src 'self'.
// Ver INTEGRACION.md para descargar el archivo a vendor/.
const ZXING_SCRIPT_URL = new URL("../vendor/zxing.min.js", import.meta.url).href;
const TARGET_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];
const DECODE_INTERVAL_MS = 220;
// Cada cuántos fotogramas se actualiza el mensaje "Analizando…" en pantalla,
// para que se note que el lector sigue vivo aunque no encuentre nada todavía.
const HEARTBEAT_EVERY_N_FRAMES = 15;

let zxingLoader = null;

function loadZxing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (zxingLoader) return zxingLoader;

  zxingLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = ZXING_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.ZXing) resolve(window.ZXing);
      else reject(new Error("vendor/zxing.min.js se cargó pero no expone window.ZXing"));
    };
    script.onerror = () => {
      zxingLoader = null;
      reject(new Error("No se pudo cargar vendor/zxing.min.js"));
    };
    document.head.appendChild(script);
  });

  return zxingLoader;
}

function hasValidChecksum(code) {
  // UPC-E y EAN-8 los valida el propio decodificador; aquí solo EAN-13 / UPC-A.
  if (!/^\d{12,13}$/.test(code)) return true;
  const digits = code.split("").map(Number);
  const check = digits.pop();
  let sum = 0;
  digits.reverse().forEach((digit, index) => {
    sum += index % 2 === 0 ? digit * 3 : digit;
  });
  return (10 - (sum % 10)) % 10 === check;
}

function isAcceptableCode(value) {
  const code = String(value || "").trim();
  if (!/^(\d{8}|\d{12,13})$/.test(code)) return false;
  return hasValidChecksum(code);
}

export function createBarcodeScanner() {
  const modal = document.getElementById("barcode-scanner-modal");
  const video = document.getElementById("barcode-scanner-video");
  const statusLabel = document.getElementById("barcode-scanner-status");
  const closeButton = document.getElementById("close-barcode-scanner-btn");
  const torchButton = document.getElementById("barcode-torch-btn");

  let stream = null;
  let intervalId = null;
  let zxingReader = null;
  let resolveScan = null;
  let isOpen = false;
  let torchOn = false;
  let hintTimers = [];

  // Dos lienzos ocultos reutilizables: uno con el fotograma tal cual y otro
  // reflejado en horizontal. Algunos portátiles espejan la imagen de la
  // cámara frontal a nivel de controlador (no solo en pantalla), así que se
  // analizan ambas versiones por si la que se guarda de verdad viene volteada.
  let normalCanvas = null;
  let normalCtx = null;
  let flippedCanvas = null;
  let flippedCtx = null;

  function grabFrames() {
    if (!video || video.readyState < 2) return null;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;

    if (!normalCanvas) {
      normalCanvas = document.createElement("canvas");
      normalCtx = normalCanvas.getContext("2d", { willReadFrequently: true });
      flippedCanvas = document.createElement("canvas");
      flippedCtx = flippedCanvas.getContext("2d", { willReadFrequently: true });
    }

    normalCanvas.width = width;
    normalCanvas.height = height;
    normalCtx.drawImage(video, 0, 0, width, height);

    flippedCanvas.width = width;
    flippedCanvas.height = height;
    flippedCtx.save();
    flippedCtx.translate(width, 0);
    flippedCtx.scale(-1, 1);
    flippedCtx.drawImage(video, 0, 0, width, height);
    flippedCtx.restore();

    return { normal: normalCanvas, flipped: flippedCanvas };
  }

  function clearHintTimers() {
    hintTimers.forEach((id) => window.clearTimeout(id));
    hintTimers = [];
  }

  function scheduleHints() {
    clearHintTimers();
    hintTimers.push(window.setTimeout(() => {
      if (isOpen) setStatus("¿No detecta nada? Acércalo hasta que se vea nítido, no borroso, y con buena luz.");
    }, 7000));
    hintTimers.push(window.setTimeout(() => {
      if (isOpen) setStatus("Prueba también a alejarlo un poco: las cámaras de portátil no enfocan bien muy de cerca.");
    }, 16000));
  }

  function setStatus(text) {
    if (statusLabel) statusLabel.textContent = text;
  }

  function isSupported() {
    return Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia);
  }

  function showModal() {
    if (!modal) return;
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("barcode-scanner-open");
  }

  function hideModal() {
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("barcode-scanner-open");
  }

  function stopCamera() {
    clearHintTimers();
    if (intervalId) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
    if (zxingReader) {
      try { zxingReader.reset(); } catch (error) { /* el lector ya estaba parado */ }
      zxingReader = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (video) video.srcObject = null;
    torchOn = false;
    torchButton?.classList.add("hidden");
    torchButton?.classList.remove("is-on");
  }

  function finish(code) {
    if (!isOpen) return;
    isOpen = false;
    stopCamera();
    hideModal();
    const resolver = resolveScan;
    resolveScan = null;
    if (resolver) resolver(code || null);
  }

  function setupTorch() {
    const track = stream?.getVideoTracks?.()[0];
    const capabilities = track?.getCapabilities ? track.getCapabilities() : {};
    if (!track || !capabilities.torch || !torchButton) return;

    torchButton.classList.remove("hidden");
    torchButton.onclick = async () => {
      try {
        torchOn = !torchOn;
        await track.applyConstraints({ advanced: [{ torch: torchOn }] });
        torchButton.classList.toggle("is-on", torchOn);
      } catch (error) {
        console.error("No se pudo cambiar la linterna:", error);
      }
    };
  }

  async function startNativeDecoder() {
    if (!("BarcodeDetector" in window)) return false;
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const formats = TARGET_FORMATS.filter((format) => supported.includes(format));
      if (!formats.length) return false;

      const detector = new window.BarcodeDetector({ formats });
      let busy = false;
      let frameCount = 0;
      intervalId = window.setInterval(async () => {
        if (!isOpen || busy) return;
        const frames = grabFrames();
        if (!frames) return;
        busy = true;
        try {
          const direct = await detector.detect(frames.normal);
          const mirrored = direct.length ? [] : await detector.detect(frames.flipped);
          const values = [...direct, ...mirrored].map((result) => result.rawValue);
          const hit = values.find(isAcceptableCode);
          frameCount += 1;

          if (hit) {
            finish(hit);
          } else if (values.length) {
            setStatus(`Detecta "${values[0]}" pero no encaja como código de producto. Prueba con otra caja.`);
          } else if (frameCount % HEARTBEAT_EVERY_N_FRAMES === 0) {
            setStatus(`Analizando… (${frameCount} intentos, sin resultado todavía)`);
          }
        } catch (error) {
          // Un fotograma suelto puede fallar; se reintenta en el siguiente ciclo.
        }
        busy = false;
      }, DECODE_INTERVAL_MS);
      return true;
    } catch (error) {
      console.warn("BarcodeDetector no utilizable, se usa ZXing:", error);
      return false;
    }
  }

  async function startZxingDecoder() {
    const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await loadZxing();
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    zxingReader = new BrowserMultiFormatReader(hints, DECODE_INTERVAL_MS);

    const canDecodeFromCanvas = typeof zxingReader.decodeFromCanvas === "function";
    if (!canDecodeFromCanvas) {
      if (typeof zxingReader.decodeFromStream !== "function") {
        throw new Error("La versión de ZXing cargada no expone un método de decodificación compatible");
      }
      let frameCount = 0;
      await zxingReader.decodeFromStream(stream, video, (result, error) => {
        if (!isOpen) return;
        frameCount += 1;

        if (result) {
          const code = typeof result.getText === "function" ? result.getText() : result.text;
          if (isAcceptableCode(code)) {
            finish(code);
          } else {
            setStatus(`Detecta "${code}" pero no encaja como código de producto. Prueba con otra caja.`);
          }
          return;
        }

        // NotFoundException se dispara en casi todos los fotogramas (normal:
        // significa "en este fotograma no hay nada que leer"). Solo interesa
        // avisar cuando el error es de otro tipo, porque eso sí es una pista.
        if (error?.name && error.name !== "NotFoundException") {
          setStatus(`Ve algo parecido a un código pero no lo lee bien (${error.name}). Acércate o aléjate un poco.`);
          return;
        }

        if (frameCount % HEARTBEAT_EVERY_N_FRAMES === 0) {
          setStatus(`Analizando… (${frameCount} intentos, sin resultado todavía)`);
        }
      });
      return;
    }

    let busy = false;
    let frameCount = 0;
    intervalId = window.setInterval(() => {
      if (!isOpen || busy) return;
      const frames = grabFrames();
      if (!frames) return;
      busy = true;
      frameCount += 1;

      const readCanvas = (canvas) => {
        try {
          const result = zxingReader.decodeFromCanvas(canvas);
          return (result && typeof result.getText === "function" ? result.getText() : result?.text) || null;
        } catch (error) {
          return null; // Fotograma sin código legible; se reintenta en el siguiente ciclo.
        }
      };

      const rawCode = readCanvas(frames.normal) || readCanvas(frames.flipped);
      busy = false;

      if (rawCode && isAcceptableCode(rawCode)) {
        finish(rawCode);
      } else if (rawCode) {
        setStatus(`Detecta "${rawCode}" pero no encaja como código de producto. Prueba con otra caja.`);
      } else if (frameCount % HEARTBEAT_EVERY_N_FRAMES === 0) {
        setStatus(`Analizando… (${frameCount} intentos, sin resultado todavía)`);
      }
    }, DECODE_INTERVAL_MS);
  }

  async function open() {
    if (!modal || !video || isOpen) return null;

    if (!isSupported()) {
      showToast("La cámara necesita una conexión https y un navegador actualizado.", "error");
      return null;
    }

    isOpen = true;
    const scanPromise = new Promise((resolve) => { resolveScan = resolve; });

    showModal();
    setStatus("Pidiendo acceso a la cámara…");

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      video.setAttribute("playsinline", "true");
      video.muted = true;
      video.srcObject = stream;
      await video.play();

      setupTorch();
      setStatus("Enfoca el código de barras del lomo o la contraportada.");
      scheduleHints();

      const usingNative = await startNativeDecoder();
      if (!usingNative) {
        setStatus("Preparando el lector…");
        await startZxingDecoder();
        setStatus("Enfoca el código de barras del lomo o la contraportada.");
      }
    } catch (error) {
      console.error("No se pudo iniciar el escáner:", error);
      const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
      const missing = error?.name === "NotFoundError" || error?.name === "OverconstrainedError";
      const readerFailed = /zxing/i.test(error?.message || "");
      showToast(
        denied
          ? "Da permiso a la cámara en el navegador para poder escanear."
          : missing
            ? "No se ha encontrado ninguna cámara en este dispositivo."
            : readerFailed
              ? "Falta el lector de códigos. Añade vendor/zxing.min.js y recarga."
              : "No se pudo abrir la cámara. Vuelve a intentarlo.",
        "error"
      );
      finish(null);
    }

    return scanPromise;
  }

  closeButton?.addEventListener("click", () => finish(null));
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) finish(null);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen) finish(null);
  });

  return { open, close: () => finish(null), isSupported };
}
