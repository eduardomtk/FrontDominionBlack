// src/indicators/overlays/wma.js

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

export const WMA_DEFINITION = {
  id: "wma",
  name: "WMA (Média Móvel Ponderada)",
  shortName: "WMA",
  group: "trend",
  placement: "overlay",
  maxInstances: 3,
  params: [
    { key: "length", label: "Período", type: "number", min: 1, max: 500, step: 1, default: 9 },
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

export function calcWMAOverlay(candles, { length = 9, source = "close" } = {}) {
  const out = [];
  const nLen = clampLen(length, 1);
  const buf = [];

  const denom = (nLen * (nLen + 1)) / 2;

  for (let i = 0; i < (candles?.length || 0); i++) {
    const c = candles[i];
    const time = n(c?.time);
    if (!Number.isFinite(time)) continue;

    const v = pickSource(c, source);
    if (!Number.isFinite(v)) continue;

    buf.push(v);
    if (buf.length > nLen) buf.shift();

    if (buf.length === nLen) {
      let num = 0;
      for (let k = 0; k < nLen; k++) {
        num += buf[k] * (k + 1);
      }
      out.push({ time, value: num / denom });
    }
  }

  return out;
}
