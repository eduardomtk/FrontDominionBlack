// src/indicators/overlays/envelopes.js

function n(v, fallback = NaN) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}
function clampLen(length, min = 1) {
  return Math.max(min, Math.floor(Number(length) || min));
}
function pickSource(candle, source) {
  const o = n(candle.open), h = n(candle.high), l = n(candle.low), c = n(candle.close);
  switch (source) {
    case "hl2": return (h + l) / 2;
    case "hlc3": return (h + l + c) / 3;
    case "ohlc4": return (o + h + l + c) / 4;
    case "close":
    default: return c;
  }
}
function calcSMA(points, len) {
  const out = [];
  const nLen = clampLen(len, 1);
  const buf = [];
  for (const p of points) {
    const t = n(p?.time);
    const v = n(p?.value);
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;

    buf.push(v);
    if (buf.length > nLen) buf.shift();
    if (buf.length === nLen) out.push({ time: t, value: buf.reduce((a, x) => a + x, 0) / nLen });
  }
  return out;
}
function calcEMA(points, len) {
  const out = [];
  const nLen = clampLen(len, 1);
  const k = 2 / (nLen + 1);
  let prev = null;
  for (const p of points) {
    const t = n(p?.time);
    const v = n(p?.value);
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    prev = prev == null ? v : v * k + prev * (1 - k);
    out.push({ time: t, value: prev });
  }
  return out;
}

export const ENVELOPES_DEFINITION = {
  id: "envelopes",
  name: "Envelopes",
  shortName: "ENV",
  group: "trend",
  placement: "overlay",
  maxInstances: 1,
  params: [
    { key: "length", label: "Período", type: "number", min: 1, max: 500, step: 1, default: 20 },
    // ✅ BINÁRIAS curto prazo: 0.5% é mais útil que 1%
    { key: "percent", label: "% Envelope", type: "number", min: 0, max: 20, step: 0.1, default: 0.5 },
    {
      key: "maType",
      label: "Tipo MA",
      type: "select",
      options: [
        { value: "sma", label: "SMA" },
        { value: "ema", label: "EMA" },
      ],
      default: "ema",
    },
    {
      key: "source",
      label: "Preço",
      type: "select",
      options: [
        { value: "close", label: "Fechamento" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ],
      default: "close",
    },
  ],
};

export function calcEnvelopesOverlay(candles, { length = 20, percent = 0.5, source = "close", maType = "ema" } = {}) {
  const p = Math.max(0, Number(percent) || 0) / 100;

  const base = [];
  for (let i = 0; i < (candles?.length || 0); i++) {
    const c = candles[i];
    const t = n(c?.time);
    if (!Number.isFinite(t)) continue;
    const v = pickSource(c, source);
    if (!Number.isFinite(v)) continue;
    base.push({ time: t, value: v });
  }

  const basis = String(maType || "").toLowerCase() === "sma" ? calcSMA(base, length) : calcEMA(base, length);

  const upper = [];
  const lower = [];
  const middle = [];

  for (const b of basis) {
    const t = n(b?.time);
    const v = n(b?.value);
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    middle.push({ time: t, value: v });
    upper.push({ time: t, value: v * (1 + p) });
    lower.push({ time: t, value: v * (1 - p) });
  }

  return { upper, middle, lower };
}
