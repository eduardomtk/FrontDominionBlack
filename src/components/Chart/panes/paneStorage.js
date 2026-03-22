// src/chart/panes/paneStorage.js

const BASE_KEY = "chart.panes.v1";

/**
 * Namespace opcional para separar layouts.
 * Ex.: "main" (default), "eurusd", "workspace:trading", etc.
 * Se não passar namespace, usa BASE_KEY puro (compatibilidade).
 */
function makeKey(namespace) {
  const ns = typeof namespace === "string" ? namespace.trim() : "";
  if (!ns) return BASE_KEY;
  return `${BASE_KEY}:${ns}`;
}

function safeNum(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : NaN;
}

function clamp(n, min, max) {
  const x = safeNum(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function sanitizePane(p) {
  if (!p || typeof p !== "object") return null;

  const id = typeof p.id === "string" ? p.id : "";
  const type = typeof p.type === "string" ? p.type : "";

  if (!id) return null;

  const minHeight = clamp(p.minHeight, 40, 2000);
  const maxHeight = clamp(p.maxHeight, 80, 4000);
  const height = clamp(p.height, minHeight, maxHeight);

  const isVisible = typeof p.isVisible === "boolean" ? p.isVisible : true;

  return {
    id: String(id),
    type: String(type),
    height,
    minHeight,
    maxHeight,
    isVisible,
  };
}

/**
 * Carrega panes do storage.
 * - Se namespace não for informado, tenta BASE_KEY (comportamento atual).
 * - Se namespace for informado, tenta BASE_KEY:namespace e, se vazio, faz fallback no BASE_KEY.
 */
export function loadPanesFromStorage({ namespace } = {}) {
  try {
    const key = makeKey(namespace);

    const raw = localStorage.getItem(key);
    let parsed = null;

    if (raw) {
      parsed = JSON.parse(raw);
    } else if (key !== BASE_KEY) {
      // fallback compatível com versões antigas
      const rawLegacy = localStorage.getItem(BASE_KEY);
      if (rawLegacy) parsed = JSON.parse(rawLegacy);
    }

    if (!parsed || typeof parsed !== "object") return null;

    const panes = Array.isArray(parsed.panes) ? parsed.panes : null;
    if (!panes) return null;

    const out = panes
      .map(sanitizePane)
      .filter(Boolean);

    return out;
  } catch {
    return null;
  }
}

/**
 * Salva panes no storage.
 * - Se namespace não for informado, salva no BASE_KEY (compatibilidade).
 * - Se namespace for informado, salva em BASE_KEY:namespace.
 */
export function savePanesToStorage(panes, { namespace } = {}) {
  try {
    const key = makeKey(namespace);

    const list = Array.isArray(panes) ? panes : [];
    const payload = {
      panes: list
        .map(sanitizePane)
        .filter(Boolean),
      ts: Date.now(),
      v: 1,
    };

    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // no-op
  }
}

/**
 * Opcional: permite “limpar” panes do storage para um namespace.
 */
export function clearPanesFromStorage({ namespace } = {}) {
  try {
    const key = makeKey(namespace);
    localStorage.removeItem(key);
  } catch {
    // no-op
  }
}
