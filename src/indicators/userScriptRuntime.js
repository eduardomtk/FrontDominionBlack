// src/indicators/userScriptRuntime.js

/**
 * Runtime simples para scripts do usuário.
 *
 * Regras do script:
 * - Deve definir uma função global `main(input)`.
 * - input = { candles, settings, meta, utils }
 *
 * Retornos aceitos:
 * - Array de pontos: [{ time, value }, ...] -> line
 * - { kind:'line', data:[{time,value}] }
 * - { kind:'bands'|'channel', data:{ upper:[], middle:[], lower:[] } }
 * - { kind:'supertrend', data:{ up:[], down:[] } } // aceita whitespace {time}
 * - { kind:'markers', data:[{ time, position, shape, color, text, size }] }
 *
 * Observação:
 * - Isso executa JS do usuário no browser. Superfície pequena: candles/settings/utils.
 */

const _cache = new Map();

function _num(x, fallback = NaN) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function _normalizeLine(data) {
  const arr = Array.isArray(data) ? data : [];
  const out = [];
  for (const p of arr) {
    const t = _num(p?.time);
    const v = _num(p?.value);
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    out.push({ time: t, value: v });
  }
  return out;
}

// supertrend: aceita whitespace -> {time} sem value
function _normalizeLineWhitespace(data) {
  const arr = Array.isArray(data) ? data : [];
  const out = [];
  for (const p of arr) {
    const t = _num(p?.time);
    if (!Number.isFinite(t)) continue;
    if ("value" in (p || {})) {
      const v = _num(p?.value);
      if (Number.isFinite(v)) out.push({ time: t, value: v });
      else out.push({ time: t });
    } else {
      out.push({ time: t });
    }
  }
  return out;
}

function _normalizeTriple(data) {
  const d = data && typeof data === "object" ? data : {};
  const upper = _normalizeLine(d.upper);
  const middle = _normalizeLine(d.middle);
  const lower = _normalizeLine(d.lower);
  if (!upper.length && !middle.length && !lower.length) return null;
  return { upper, middle, lower };
}

function _normalizeMarkers(data) {
  const arr = Array.isArray(data) ? data : [];
  const out = [];

  for (const m of arr) {
    const t = _num(m?.time);
    if (!Number.isFinite(t)) continue;

    const position = String(m?.position || "inBar");
    const shape = String(m?.shape || "circle");
    const color = typeof m?.color === "string" && m.color ? m.color : "#ffffff";
    const text = typeof m?.text === "string" ? m.text : undefined;
    const size = _num(m?.size, undefined);

    const mm = { time: t, position, shape, color };
    if (text) mm.text = text;
    if (Number.isFinite(size)) mm.size = Math.max(1, Math.min(6, Math.floor(size)));

    out.push(mm);
  }

  return out;
}

// Utils úteis (sem DOM)
const utils = {
  src(c, key = "close") {
    const k = String(key || "close").toLowerCase();
    const o = _num(c?.open);
    const h = _num(c?.high);
    const l = _num(c?.low);
    const cl = _num(c?.close);

    if (k === "open") return o;
    if (k === "high") return h;
    if (k === "low") return l;
    if (k === "hl2") return (h + l) / 2;
    if (k === "hlc3") return (h + l + cl) / 3;
    if (k === "ohlc4") return (o + h + l + cl) / 4;
    return cl;
  },

  clamp(x, a, b) {
    const n = _num(x);
    if (!Number.isFinite(n)) return a;
    return Math.max(a, Math.min(b, n));
  },
};

function compile(code) {
  const key = String(code || "");
  if (_cache.has(key)) return _cache.get(key);

  const wrapped = `
"use strict";
let main = undefined;
${key}
return (typeof main === "function") ? main : null;
`;

  let getMainFn = null;
  try {
    getMainFn = new Function(wrapped); // eslint-disable-line no-new-func
  } catch {
    getMainFn = () => null;
  }

  const compiled = { getMainFn };
  _cache.set(key, compiled);
  return compiled;
}

export function runUserScriptIndicator({ code, candles, settings, meta }) {
  const compiled = compile(code);
  const mainFn = compiled?.getMainFn?.();
  if (typeof mainFn !== "function") return { kind: "none" };

  let result = null;
  try {
    result = mainFn({
      candles: Array.isArray(candles) ? candles : [],
      settings: settings || {},
      meta: meta || {},
      utils,
    });
  } catch {
    return { kind: "none" };
  }

  // Array direto => line
  if (Array.isArray(result)) {
    const line = _normalizeLine(result);
    return line.length ? { kind: "line", data: line } : { kind: "none" };
  }

  if (!result || typeof result !== "object") return { kind: "none" };

  const kind = String(result.kind || "line").toLowerCase();
  const data = result.data;

  if (kind === "line") {
    const line = _normalizeLine(data);
    return line.length ? { kind: "line", data: line } : { kind: "none" };
  }

  if (kind === "bands" || kind === "channel") {
    const triple = _normalizeTriple(data);
    return triple ? { kind, data: triple } : { kind: "none" };
  }

  if (kind === "supertrend") {
    const d = data && typeof data === "object" ? data : {};
    const up = _normalizeLineWhitespace(d.up);
    const down = _normalizeLineWhitespace(d.down);
    if (!up.length && !down.length) return { kind: "none" };
    return { kind: "supertrend", data: { up, down } };
  }

  if (kind === "markers") {
    const markers = _normalizeMarkers(data);
    return markers.length ? { kind: "markers", data: markers } : { kind: "none" };
  }

  return { kind: "none" };
}
