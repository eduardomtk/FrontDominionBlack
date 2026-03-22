// src/indicators/overlays/supertrend.js

function n(v, fallback = NaN) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}
function clampLen(length, min = 1) {
  return Math.max(min, Math.floor(Number(length) || min));
}
function calcATR(candles, len) {
  const out = [];
  const nLen = clampLen(len, 1);

  let trCount = 0;
  let trSum = 0;
  let lastATR = null;

  for (let i = 0; i < (candles?.length || 0); i++) {
    const c = candles[i];
    const t = n(c?.time);
    if (!Number.isFinite(t)) continue;

    const h = n(c?.high);
    const l = n(c?.low);
    const pc = n(candles[i - 1]?.close);

    if (!Number.isFinite(h) || !Number.isFinite(l)) continue;

    const tr =
      i === 0 || !Number.isFinite(pc)
        ? h - l
        : Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));

    if (!Number.isFinite(tr)) continue;

    if (trCount < nLen) {
      trSum += tr;
      trCount += 1;
      if (trCount === nLen) {
        lastATR = trSum / nLen;
        out.push({ time: t, value: lastATR });
      }
      continue;
    }

    lastATR = (lastATR * (nLen - 1) + tr) / nLen;
    out.push({ time: t, value: lastATR });
  }

  return out;
}

export const SUPERTREND_DEFINITION = {
  id: "supertrend",
  name: "SuperTrend",
  shortName: "ST",
  group: "trend",
  placement: "overlay",
  maxInstances: 1,
  params: [
    // ✅ BINÁRIAS curto prazo
    { key: "atrLength", label: "ATR Período", type: "number", min: 1, max: 200, step: 1, default: 10 },
    { key: "multiplier", label: "Multiplicador", type: "number", min: 0.1, max: 10, step: 0.1, default: 2 },
  ],
};

// ✅ Agora devolve UMA ÚNICA SÉRIE com direção (dir)
// dir: 1 = up (verde), 0 = down (vermelho)
export function calcSuperTrendOverlay(candles, { atrLength = 10, multiplier = 2 } = {}) {
  const line = [];

  const atr = calcATR(candles, atrLength);
  const atrByTime = new Map();
  for (const p of atr) {
    const t = n(p?.time);
    const v = n(p?.value);
    if (Number.isFinite(t) && Number.isFinite(v)) atrByTime.set(t, v);
  }

  const m = Number(multiplier) || 2;

  let trendUp = null;
  let trendDown = null;
  let trend = true;

  for (let i = 0; i < (candles?.length || 0); i++) {
    const c = candles[i];
    const t = n(c?.time);
    const h = n(c?.high);
    const l = n(c?.low);
    const cl = n(c?.close);
    const a = atrByTime.get(t);

    if (!Number.isFinite(t) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(cl) || !Number.isFinite(a)) {
      continue;
    }

    const hl2 = (h + l) / 2;
    const offset = a * m;

    const up = hl2 - offset;
    const down = hl2 + offset;

    const prevClose = n(candles[i - 1]?.close);

    if (trendUp != null && Number.isFinite(prevClose) && prevClose > trendUp) trendUp = Math.max(up, trendUp);
    else trendUp = up;

    if (trendDown != null && Number.isFinite(prevClose) && prevClose < trendDown) trendDown = Math.min(down, trendDown);
    else trendDown = down;

    if (trendDown != null && cl > trendDown) trend = true;
    else if (trendUp != null && cl < trendUp) trend = false;

    const tsl = trend ? trendUp : trendDown;

    if (!Number.isFinite(tsl)) continue;

    line.push({ time: t, value: tsl, dir: trend ? 1 : 0 });
  }

  return { line };
}
