// src/indicators/overlays/hma.js

function n(v, fallback = NaN) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function clampLen(length, min = 1) {
  return Math.max(min, Math.floor(Number(length) || min));
}

function pickSource(candle, source) {
  const o = n(candle.open);
  const h = n(candle.high);
  const l = n(candle.low);
  const c = n(candle.close);

  switch (source) {
    case "open":
      return o;
    case "high":
      return h;
    case "low":
      return l;
    case "hl2":
      return (h + l) / 2;
    case "hlc3":
      return (h + l + c) / 3;
    case "ohlc4":
      return (o + h + l + c) / 4;
    case "close":
    default:
      return c;
  }
}

// WMA (Weighted Moving Average)
function wmaSeries(values, length) {
  const len = clampLen(length, 1);
  const out = new Array(values.length).fill(NaN);

  const denom = (len * (len + 1)) / 2;
  for (let i = 0; i < values.length; i++) {
    if (i < len - 1) continue;

    let num = 0;
    let w = 1;
    for (let j = i - len + 1; j <= i; j++) {
      const v = values[j];
      if (!Number.isFinite(v)) {
        num = NaN;
        break;
      }
      num += v * w;
      w++;
    }
    if (!Number.isFinite(num)) continue;
    out[i] = num / denom;
  }

  return out;
}

// HMA = WMA( 2*WMA(src, n/2) - WMA(src, n), sqrt(n) )
export function calcHMAOverlay(candles, { length = 16, source = "close" } = {}) {
  const out = [];
  const len = clampLen(length, 1);
  const half = clampLen(Math.floor(len / 2), 1);
  const sqrtLen = clampLen(Math.round(Math.sqrt(len)), 1);

  const times = [];
  const src = [];

  for (let i = 0; i < candles.length; i++) {
    const t = n(candles[i]?.time);
    if (!Number.isFinite(t)) continue;
    const v = pickSource(candles[i], source);
    times.push(t);
    src.push(Number.isFinite(v) ? v : NaN);
  }

  const wmaHalf = wmaSeries(src, half);
  const wmaFull = wmaSeries(src, len);

  const diff = new Array(src.length).fill(NaN);
  for (let i = 0; i < src.length; i++) {
    const a = wmaHalf[i];
    const b = wmaFull[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    diff[i] = 2 * a - b;
  }

  const hma = wmaSeries(diff, sqrtLen);

  for (let i = 0; i < hma.length; i++) {
    const t = times[i];
    const v = hma[i];
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    out.push({ time: t, value: v });
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
