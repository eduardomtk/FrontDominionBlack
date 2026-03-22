// src/indicators/overlays/vwma.js

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

export const VWMA_DEFINITION = {
  id: "vwma",
  name: "VWMA (Média Ponderada por Volume)",
  shortName: "VWMA",
  group: "volume",
  placement: "overlay",
  maxInstances: 1,
  params: [
    // ✅ curto prazo: 20 é padrão bom e estável
    { key: "length", label: "Período", type: "number", min: 1, max: 500, step: 1, default: 20 },
    {
      key: "source",
      label: "Preço",
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

export function calcVWMAOverlay(candles, { length = 20, source = "hlc3" } = {}) {
  const out = [];
  const nLen = clampLen(length, 1);

  const bufPV = [];
  const bufV = [];

  let last = null;

  for (let i = 0; i < (candles?.length || 0); i++) {
    const c = candles[i];
    const time = n(c?.time);
    if (!Number.isFinite(time)) continue;

    const price = pickSource(c, source);
    let vol = n(c?.volume);
    if (!Number.isFinite(vol)) vol = n(c?.tickVolume);

    if (!Number.isFinite(price) || !Number.isFinite(vol) || vol <= 0) {
      if (last != null) out.push({ time, value: last });
      continue;
    }

    bufPV.push(price * vol);
    bufV.push(vol);

    if (bufPV.length > nLen) bufPV.shift();
    if (bufV.length > nLen) bufV.shift();

    if (bufPV.length === nLen) {
      const sumPV = bufPV.reduce((a, x) => a + x, 0);
      const sumV = bufV.reduce((a, x) => a + x, 0);
      if (sumV > 0) {
        last = sumPV / sumV;
        out.push({ time, value: last });
      }
    }
  }

  return out;
}
