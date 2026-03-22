// src/indicators/overlays/keltner.js

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
    case "hlc3": return (h + l + c) / 3;
    case "hl2": return (h + l) / 2;
    case "ohlc4": return (o + h + l + c) / 4;
    case "close":
    default: return c;
  }
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
function calcATR(candles, len) {
  const out = [];
  const nLen = clampLen(len, 1);

  let trCount = 0;
  let trSum = 0;
  let last = null;

  for (let i = 0; i < (candles?.length || 0); i++) {
    const c = candles[i];
    const t = n(c?.time);
    if (!Number.isFinite(t)) continue;

    const h = n(c?.high);
    const l = n(c?.low);
    const pc = n(candles[i - 1]?.close);

    if (!Number.isFinite(h) || !Number.isFinite(l)) {
      if (last != null) out.push({ time: t, value: last });
      continue;
    }

    const tr =
      i === 0 || !Number.isFinite(pc)
        ? h - l
        : Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));

    if (!Number.isFinite(tr)) {
      if (last != null) out.push({ time: t, value: last });
      continue;
    }

    if (trCount < nLen) {
      trSum += tr;
      trCount += 1;
      if (trCount === nLen) {
        last = trSum / nLen;
        out.push({ time: t, value: last });
      }
      continue;
    }

    last = (last * (nLen - 1) + tr) / nLen;
    out.push({ time: t, value: last });
  }

  return out;
}

export const KELTNER_DEFINITION = {
  id: "keltner",
  name: "Keltner Channels",
  shortName: "KELT",
  group: "volatility",
  placement: "overlay",
  maxInstances: 1,
  params: [
    { key: "length", label: "EMA Período", type: "number", min: 1, max: 500, step: 1, default: 20 },
    { key: "atrLength", label: "ATR Período", type: "number", min: 1, max: 200, step: 1, default: 10 },
    // ✅ BINÁRIAS curto prazo: 1.5 é mais “rápido” que 2
    { key: "multiplier", label: "Multiplicador", type: "number", min: 0.1, max: 10, step: 0.1, default: 1.5 },
    {
      key: "source",
      label: "Preço (EMA)",
      type: "select",
      options: [
        { value: "hlc3", label: "HLC3" },
        { value: "hl2", label: "HL2" },
        { value: "close", label: "Fechamento" },
        { value: "ohlc4", label: "OHLC4" },
      ],
      default: "hlc3",
    },
  ],
};

export function calcKeltnerOverlay(candles, { length = 20, atrLength = 10, multiplier = 1.5, source = "hlc3" } = {}) {
  const base = [];
  for (let i = 0; i < (candles?.length || 0); i++) {
    const c = candles[i];
    const t = n(c?.time);
    if (!Number.isFinite(t)) continue;
    const v = pickSource(c, source);
    if (!Number.isFinite(v)) continue;
    base.push({ time: t, value: v });
  }

  const mid = calcEMA(base, length);
  const atr = calcATR(candles, atrLength);

  const atrByTime = new Map();
  for (const p of atr) {
    const t = n(p?.time);
    const v = n(p?.value);
    if (Number.isFinite(t) && Number.isFinite(v)) atrByTime.set(t, v);
  }

  const upper = [];
  const lower = [];
  const middle = [];

  const k = Number(multiplier) || 1.5;

  for (const m of mid) {
    const t = n(m?.time);
    const v = n(m?.value);
    const a = atrByTime.get(t);
    if (!Number.isFinite(t) || !Number.isFinite(v) || !Number.isFinite(a)) continue;

    middle.push({ time: t, value: v });
    upper.push({ time: t, value: v + k * a });
    lower.push({ time: t, value: v - k * a });
  }

  return { upper, middle, lower };
}
