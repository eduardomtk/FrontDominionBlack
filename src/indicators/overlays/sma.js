// src/indicators/overlays/sma.js

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

export const SMA_DEFINITION = {
  id: "sma",
  name: "SMA (Média Móvel Simples)",
  shortName: "SMA",
  group: "trend",
  placement: "overlay",
  maxInstances: 4,
  params: [
    // ✅ BINÁRIAS curto prazo
    { key: "length", label: "Período", type: "number", min: 1, max: 500, step: 1, default: 9 },
    {
      key: "source",
      label: "Preço",
      type: "select",
      options: [
        { value: "close", label: "Fechamento" },
        { value: "open", label: "Abertura" },
        { value: "high", label: "Máxima" },
        { value: "low", label: "Mínima" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ],
      default: "close",
    },
  ],
};

export function calcSMAOverlay(candles, { length = 9, source = "close" } = {}) {
  const out = [];
  const nLen = clampLen(length, 1);
  const buf = [];

  let last = null;
  let started = false;

  for (let i = 0; i < (candles?.length || 0); i++) {
    const c = candles[i];
    const time = n(c?.time);
    if (!Number.isFinite(time)) continue;

    const v = pickSource(c, source);
    if (!Number.isFinite(v)) {
      if (started && Number.isFinite(last)) out.push({ time, value: last });
      continue;
    }

    buf.push(v);
    if (buf.length > nLen) buf.shift();

    if (buf.length === nLen) {
      const sum = buf.reduce((acc, x) => acc + x, 0);
      last = sum / nLen;
      started = true;
      out.push({ time, value: last });
    }
  }
  return out;
}
