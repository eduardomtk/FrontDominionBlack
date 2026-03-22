// src/indicators/overlays/anchoredVwap.js

function n(v, fallback = NaN) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function clamp(nv, a, b) {
  const x = Number(nv);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
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

function dayKeyUTC(sec) {
  const d = new Date(sec * 1000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

export function calcAnchoredVWAPOverlay(
  candles,
  { source = "hlc3", anchorMode = "dayUTC", anchorTime = 0 } = {}
) {
  const out = [];
  if (!Array.isArray(candles) || !candles.length) return out;

  const mode = String(anchorMode || "dayUTC");
  const at = n(anchorTime, 0);

  let cumPV = 0;
  let cumV = 0;
  let last = null;

  let anchorDay = null;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const t = n(c?.time);
    if (!Number.isFinite(t)) continue;

    // reset conforme modo
    if (mode === "dayUTC") {
      const dk = dayKeyUTC(t);
      if (anchorDay == null) anchorDay = dk;
      if (dk !== anchorDay) {
        anchorDay = dk;
        cumPV = 0;
        cumV = 0;
      }
    } else if (mode === "fixedTime") {
      // acumula apenas depois do anchorTime
      if (Number.isFinite(at) && at > 0 && t < at) continue;
    } else {
      // "visible": não reseta (apenas acumula na janela)
      // (nada)
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

export const ANCHORED_VWAP_DEFINITION = {
  id: "anchoredVwap",
  name: "Anchored VWAP (Unshared)",
  shortName: "AVWAP",
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
    {
      key: "anchorMode",
      label: "Âncora",
      type: "select",
      options: [
        { value: "dayUTC", label: "Dia (UTC)" },
        { value: "visible", label: "Janela (sem reset)" },
        { value: "fixedTime", label: "Timestamp fixo" },
      ],
      default: "dayUTC",
    },
    { key: "anchorTime", label: "Anchor time (seg)", type: "number", min: 0, max: 9999999999, step: 1, default: 0 },
  ],
};
