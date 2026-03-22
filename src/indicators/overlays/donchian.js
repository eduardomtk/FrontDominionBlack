// src/indicators/overlays/donchian.js

function n(v, fallback = NaN) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}
function clampLen(length, min = 1) {
  return Math.max(min, Math.floor(Number(length) || min));
}

export const DONCHIAN_DEFINITION = {
  id: "donchian",
  name: "Donchian Channels",
  shortName: "DON",
  group: "volatility",
  placement: "overlay",
  maxInstances: 1,
  params: [{ key: "length", label: "Período", type: "number", min: 1, max: 500, step: 1, default: 20 }],
};

export function calcDonchianOverlay(candles, { length = 20 } = {}) {
  const nLen = clampLen(length, 1);
  const upper = [];
  const lower = [];
  const middle = [];

  for (let i = 0; i < (candles?.length || 0); i++) {
    const t = n(candles[i]?.time);
    if (!Number.isFinite(t) || i < nLen - 1) continue;

    let hh = -Infinity;
    let ll = Infinity;

    for (let j = i - nLen + 1; j <= i; j++) {
      const h = n(candles[j]?.high);
      const l = n(candles[j]?.low);
      if (Number.isFinite(h)) hh = Math.max(hh, h);
      if (Number.isFinite(l)) ll = Math.min(ll, l);
    }

    if (!Number.isFinite(hh) || !Number.isFinite(ll)) continue;

    const mid = (hh + ll) / 2;
    upper.push({ time: t, value: hh });
    lower.push({ time: t, value: ll });
    middle.push({ time: t, value: mid });
  }

  return { upper, middle, lower };
}
