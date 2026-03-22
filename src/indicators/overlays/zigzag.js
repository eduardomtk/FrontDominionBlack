// src/indicators/overlays/zigzag.js

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

/**
 * ZigZag por reversão percentual (ideal pra binárias curto prazo).
 * - deviationPct: % mínimo de reversão pra confirmar pivô (ex 0.2%)
 * - depth: mínimo de barras entre pivôs (suaviza ruído)
 * - backstep: anti-serrilhado (mínimo extra entre pivôs)
 */
export function calcZigZagOverlay(
  candles,
  { deviationPct = 0.2, depth = 5, backstep = 1, source = "hl2" } = {}
) {
  const out = [];
  if (!Array.isArray(candles) || candles.length < 3) return out;

  const dev = Math.max(0.01, Number(deviationPct) || 0.2) / 100;
  const dep = clampLen(depth, 2);
  const bs = clampLen(backstep, 1);
  const minBars = Math.max(dep, bs);

  // Pré-série (time, price)
  const pts = [];
  for (let i = 0; i < candles.length; i++) {
    const t = n(candles[i]?.time);
    if (!Number.isFinite(t)) continue;
    const v = pickSource(candles[i], source);
    if (!Number.isFinite(v)) continue;
    pts.push({ time: t, value: v, idx: i });
  }
  if (pts.length < 3) return out;

  let trend = 0; // 1 up, -1 down, 0 unknown

  let lastPivot = pts[0];
  let lastPivotPos = 0; // posição em pts[]
  out.push({ time: lastPivot.time, value: lastPivot.value });

  // extremos candidatos
  let highExtreme = pts[0];
  let lowExtreme = pts[0];

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];

    // atualiza extremos
    if (p.value >= highExtreme.value) highExtreme = p;
    if (p.value <= lowExtreme.value) lowExtreme = p;

    // detecta tendência inicial quando der uma “mexida” mínima
    if (trend === 0) {
      const upMove = (p.value - lowExtreme.value) / Math.max(1e-12, lowExtreme.value);
      const downMove = (highExtreme.value - p.value) / Math.max(1e-12, highExtreme.value);
      if (upMove >= dev) trend = 1;
      else if (downMove >= dev) trend = -1;
      // segue coletando extremos até descobrir trend
      continue;
    }

    if (trend === 1) {
      // estamos em alta: confirma topo quando reverter dev%
      const revDown = (highExtreme.value - p.value) / Math.max(1e-12, highExtreme.value);
      if (revDown >= dev && i - lastPivotPos >= minBars) {
        out.push({ time: highExtreme.time, value: highExtreme.value });
        lastPivot = highExtreme;
        lastPivotPos = i;
        trend = -1;

        // reseta extremos a partir do ponto atual
        lowExtreme = p;
        highExtreme = p;
      }
    } else if (trend === -1) {
      // estamos em baixa: confirma fundo quando reverter dev%
      const revUp = (p.value - lowExtreme.value) / Math.max(1e-12, lowExtreme.value);
      if (revUp >= dev && i - lastPivotPos >= minBars) {
        out.push({ time: lowExtreme.time, value: lowExtreme.value });
        lastPivot = lowExtreme;
        lastPivotPos = i;
        trend = 1;

        // reseta extremos a partir do ponto atual
        lowExtreme = p;
        highExtreme = p;
      }
    }
  }

  // conecta ao último candle (linha viva)
  const last = pts[pts.length - 1];
  if (!out.length || out[out.length - 1].time !== last.time) {
    out.push({ time: last.time, value: last.value });
  }

  out.sort((a, b) => a.time - b.time);
  return out;
}

export const ZIGZAG_DEFINITION = {
  id: "zigzag",
  name: "ZigZag",
  shortName: "ZIG",
  group: "trend",
  placement: "overlay",
  maxInstances: 1,
  params: [
    // ✅ defaults “binárias”: bem mais responsivo (micro swing)
    { key: "deviationPct", label: "Reversão (%)", type: "number", min: 0.05, max: 20, step: 0.05, default: 0.2 },
    { key: "depth", label: "Depth", type: "number", min: 2, max: 300, step: 1, default: 5 },
    { key: "backstep", label: "Backstep", type: "number", min: 1, max: 50, step: 1, default: 1 },
    {
      key: "source",
      label: "Preço",
      type: "select",
      options: [
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "close", label: "Fechamento" },
        { value: "ohlc4", label: "OHLC4" },
      ],
      default: "hl2",
    },
  ],
};
