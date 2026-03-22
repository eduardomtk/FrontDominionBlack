// src/indicators/overlays/bollinger.js

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

export const BOLLINGER_DEFINITION = {
  id: "bollinger",
  name: "Bandas de Bollinger",
  shortName: "BB",
  group: "volatility",
  placement: "overlay",
  maxInstances: 2,
  params: [
    { key: "length", label: "Período", type: "number", min: 5, max: 500, step: 1, default: 20 },
    { key: "multiplier", label: "Desvios Padrão", type: "number", min: 0.1, max: 10, step: 0.1, default: 2 },
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

export function calcBollingerOverlay(candles, { length = 20, multiplier = 2, source = "close" } = {}) {
  const outMiddle = [];
  const outUpper = [];
  const outLower = [];

  const nLen = clampLen(length, 1);
  const k = Number(multiplier) || 2;
  const buf = [];

  for (let i = 0; i < (candles?.length || 0); i++) {
    const c = candles[i];
    const time = n(c?.time);
    if (!Number.isFinite(time)) continue;

    const v = pickSource(c, source);
    if (!Number.isFinite(v)) continue;

    buf.push(v);
    if (buf.length > nLen) buf.shift();

    if (buf.length === nLen) {
      const mean = buf.reduce((acc, x) => acc + x, 0) / nLen;
      const variance = buf.reduce((acc, x) => acc + (x - mean) * (x - mean), 0) / nLen;
      const std = Math.sqrt(variance);

      outMiddle.push({ time, value: mean });
      outUpper.push({ time, value: mean + k * std });
      outLower.push({ time, value: mean - k * std });
    }
  }

  return { middle: outMiddle, upper: outUpper, lower: outLower };
}
