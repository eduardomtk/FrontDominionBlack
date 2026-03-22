// src/indicators/overlays/atrBands.js

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
  let last = null;

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

export const ATRBANDS_DEFINITION = {
  id: "atrbands",
  name: "ATR Bands",
  shortName: "ATRb",
  group: "volatility",
  placement: "overlay",
  maxInstances: 1,
  params: [
    // ✅ curto prazo
    { key: "atrLength", label: "ATR Período", type: "number", min: 1, max: 200, step: 1, default: 10 },
    { key: "multiplier", label: "Multiplicador", type: "number", min: 0.1, max: 10, step: 0.1, default: 1 },
  ],
};

export function calcATRBandsOverlay(candles, { atrLength = 10, multiplier = 1 } = {}) {
  const upper = [];
  const lower = [];
  const middle = [];

  const atr = calcATR(candles, atrLength);
  const atrByTime = new Map();
  for (const p of atr) {
    const t = n(p?.time);
    const v = n(p?.value);
    if (Number.isFinite(t) && Number.isFinite(v)) atrByTime.set(t, v);
  }

  const k = Number(multiplier) || 1;

  for (let i = 0; i < (candles?.length || 0); i++) {
    const c = candles[i];
    const t = n(c?.time);
    const cl = n(c?.close);
    const a = atrByTime.get(t);
    if (!Number.isFinite(t) || !Number.isFinite(cl) || !Number.isFinite(a)) continue;

    middle.push({ time: t, value: cl });
    upper.push({ time: t, value: cl + k * a });
    lower.push({ time: t, value: cl - k * a });
  }

  return { upper, middle, lower };
}
