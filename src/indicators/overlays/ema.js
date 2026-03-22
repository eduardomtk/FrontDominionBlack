// src/indicators/overlays/ema.js

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

export const EMA_DEFINITION = {
  id: "ema",
  name: "EMA (Média Móvel Exponencial)",
  shortName: "EMA",
  group: "trend",
  placement: "overlay",
  maxInstances: 4,
  params: [
    // ✅ BINÁRIAS curto prazo (EMA 9 é a base)
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

export function calcEMAOverlay(candles, { length = 9, source = "close" } = {}) {
  const out = [];
  const nLen = clampLen(length, 1);
  const k = 2 / (nLen + 1);

  let prev = null;

  for (let i = 0; i < (candles?.length || 0); i++) {
    const c = candles[i];
    const time = n(c?.time);
    if (!Number.isFinite(time)) continue;

    const v = pickSource(c, source);

    if (!Number.isFinite(v)) {
      if (prev != null && Number.isFinite(prev)) out.push({ time, value: prev });
      continue;
    }

    prev = prev == null ? v : v * k + prev * (1 - k);
    out.push({ time, value: prev });
  }

  return out;
}
