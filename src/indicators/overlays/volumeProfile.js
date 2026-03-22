// src/indicators/overlays/hma.js

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
    case "open": return o;
    case "high": return h;
    case "low": return l;
    case "hl2": return (h + l) / 2;
    case "hlc3": return (h + l + c) / 3;
    case "ohlc4": return (o + h + l + c) / 4;
    case "close":
    default: return c;
  }
}

function wmaSeries(points, len) {
  const out = [];
  const nLen = clampLen(len, 1);
  const denom = (nLen * (nLen + 1)) / 2;
  const buf = [];

  for (const p of points) {
    const time = n(p?.time);
    const v = n(p?.value);
    if (!Number.isFinite(time) || !Number.isFinite(v)) continue;

    buf.push(v);
    if (buf.length > nLen) buf.shift();

    if (buf.length === nLen) {
      let num = 0;
      for (let k = 0; k < nLen; k++) num += buf[k] * (k + 1);
      out.push({ time, value: num / denom });
    }
  }
  return out;
}

export const HMA_DEFINITION = {
  id: "hma",
  name: "HMA (Hull Moving Average)",
  shortName: "HMA",
  group: "trend",
  placement: "overlay",
  maxInstances: 2,
  params: [
    // ✅ curto prazo: 16 costuma ficar excelente em M1–M5
    { key: "length", label: "Período", type: "number", min: 1, max: 500, step: 1, default: 16 },
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

export function calcHMAOverlay(candles, { length = 16, source = "close" } = {}) {
  const L = clampLen(length, 1);
  const half = clampLen(Math.floor(L / 2) || 1, 1);
  const sqrtL = clampLen(Math.floor(Math.sqrt(L)) || 1, 1);

  // base points
  const base = [];
  for (let i = 0; i < (candles?.length || 0); i++) {
    const c = candles[i];
    const time = n(c?.time);
    if (!Number.isFinite(time)) continue;
    const v = pickSource(c, source);
    if (!Number.isFinite(v)) continue;
    base.push({ time, value: v });
  }

  const w1 = wmaSeries(base, half);
  const w2 = wmaSeries(base, L);

  const w2ByTime = new Map();
  for (const p of w2) {
    const t = n(p?.time);
    const v = n(p?.value);
    if (Number.isFinite(t) && Number.isFinite(v)) w2ByTime.set(t, v);
  }

  const diff = [];
  for (const p of w1) {
    const t = n(p?.time);
    const v1 = n(p?.value);
    const v2 = w2ByTime.get(t);
    if (!Number.isFinite(t) || !Number.isFinite(v1) || !Number.isFinite(v2)) continue;
    diff.push({ time: t, value: 2 * v1 - v2 });
  }

  return wmaSeries(diff, sqrtL);
}
