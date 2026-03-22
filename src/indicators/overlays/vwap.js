// src/indicators/overlays/vwap.js

function n(v, fallback = NaN) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
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

export const VWAP_DEFINITION = {
  id: "vwap",
  name: "VWAP",
  shortName: "VWAP",
  group: "volume",
  placement: "overlay",
  maxInstances: 1,
  params: [
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
    { key: "resetDaily", label: "Reset diário (UTC)", type: "boolean", default: true },
  ],
};

export function calcVWAPOverlay(candles, { source = "hlc3", resetDaily = true } = {}) {
  const out = [];
  let cumPV = 0;
  let cumV = 0;
  let lastDayKey = null;
  let last = null;

  for (let i = 0; i < (candles?.length || 0); i++) {
    const c = candles[i];
    const t = n(c?.time);
    if (!Number.isFinite(t)) continue;

    if (resetDaily) {
      const d = new Date(t * 1000);
      const dayKey = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      if (lastDayKey == null) lastDayKey = dayKey;
      if (dayKey !== lastDayKey) {
        lastDayKey = dayKey;
        cumPV = 0;
        cumV = 0;
      }
    }

    const price = pickSource(c, source);
    let vol = n(c?.volume);
    if (!Number.isFinite(vol)) vol = n(c?.tickVolume);

    if (!Number.isFinite(price) || !Number.isFinite(vol) || vol <= 0) {
      if (last != null) out.push({ time: t, value: last });
      continue;
    }

    cumPV += price * vol;
    cumV += vol;
    if (cumV <= 0) continue;

    last = cumPV / cumV;
    out.push({ time: t, value: last });
  }

  return out;
}
