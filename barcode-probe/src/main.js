import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

const LOG_KEY = "uga-barcode-probe.log";

const el = {
  reader: document.getElementById("reader"),
  start: document.getElementById("startCam"),
  stop: document.getElementById("stopCam"),
  file: document.getElementById("fileInput"),
  status: document.getElementById("status"),
  last: document.getElementById("last"),
  copy: document.getElementById("copyLast"),
  log: document.getElementById("log"),
  clear: document.getElementById("clearLog"),
};

/** @type {Html5Qrcode | null} */
let scanner = null;
let lastText = "";
let lastAt = 0;

const formats = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.AZTEC,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.PDF_417,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
];

function loadLog() {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLog(entries) {
  localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(0, 100)));
}

function setStatus(text, kind = "") {
  el.status.textContent = text;
  el.status.className = `status ${kind}`;
}

function renderLog() {
  const entries = loadLog();
  el.log.innerHTML = "";
  if (!entries.length) {
    el.log.innerHTML = `<li class="meta" style="border:0;background:transparent;color:#737373">No scans yet.</li>`;
    return;
  }
  for (const entry of entries) {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="meta">${entry.when} · ${entry.format || "unknown"} · via ${entry.source}</div>
      <div class="value">${escapeHtml(entry.text)}</div>
    `;
    el.log.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function record(text, format, source) {
  const now = Date.now();
  // Debounce identical back-to-back camera reads.
  if (text === lastText && now - lastAt < 1500) return;
  lastText = text;
  lastAt = now;

  const entry = {
    text,
    format: format || "",
    source,
    when: new Date().toLocaleTimeString(),
    at: now,
  };

  el.last.textContent = JSON.stringify(
    { text, format: entry.format, source, when: entry.when },
    null,
    2,
  );
  el.last.classList.remove("empty");
  el.copy.disabled = false;

  const entries = [entry, ...loadLog().filter((e) => e.text !== text || e.format !== format)];
  saveLog(entries);
  renderLog();
  setStatus(`Scanned ${format || "code"}`, "ok");

  if (navigator.vibrate) navigator.vibrate(40);
}

async function ensureScanner() {
  if (!scanner) scanner = new Html5Qrcode("reader", { verbose: false });
  return scanner;
}

async function startCamera() {
  try {
    const s = await ensureScanner();
    if (s.isScanning) return;

    setStatus("Starting camera…");
    await s.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: (viewW, viewH) => {
          const side = Math.min(viewW, viewH) * 0.72;
          return { width: side, height: side * 0.55 };
        },
        aspectRatio: 1.333,
        formatsToSupport: formats,
      },
      (text, result) => {
        const format = result?.result?.format?.formatName || "";
        record(text, format, "camera");
      },
      () => {
        // frame with no code — ignore
      },
    );
    el.start.disabled = true;
    el.stop.disabled = false;
    setStatus("Point at the barcode / QR on the shelf label");
  } catch (err) {
    console.error(err);
    setStatus(
      err?.message?.includes("Permission")
        ? "Camera permission denied"
        : `Camera failed: ${err?.message || err}. Try “pick a photo” instead.`,
      "err",
    );
  }
}

async function stopCamera() {
  try {
    if (scanner?.isScanning) await scanner.stop();
  } catch {
    /* already stopped */
  }
  el.start.disabled = false;
  el.stop.disabled = true;
  setStatus("Camera idle");
}

async function scanFile(file) {
  try {
    await stopCamera();
    const s = await ensureScanner();
    setStatus("Reading photo…");
    const result = await s.scanFileV2(file, true);
    record(
      result.decodedText,
      result.result?.format?.formatName || "",
      "photo",
    );
  } catch (err) {
    console.error(err);
    setStatus(
      `No barcode found in that photo. (${err?.message || "decode failed"})`,
      "err",
    );
  }
}

el.start.addEventListener("click", () => void startCamera());
el.stop.addEventListener("click", () => void stopCamera());
el.file.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (file) void scanFile(file);
});
el.clear.addEventListener("click", () => {
  saveLog([]);
  renderLog();
});
el.copy.addEventListener("click", async () => {
  if (!lastText) return;
  await navigator.clipboard.writeText(lastText);
  setStatus("Copied raw value", "ok");
});

renderLog();

if (!window.isSecureContext) {
  setStatus(
    "This page is not a secure context. Camera needs HTTPS or localhost — use “pick a photo” on plain HTTP, or open via Vite on this phone’s localhost tunnel.",
    "err",
  );
}
