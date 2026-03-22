// src/indicators/overlays/fractal.js

function n(v, fallback = NaN) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}
function clampLen(length, min = 3) {
  return Math.max(min, Math.floor(Number(length) || min));
}

export const FRACTAL_DEFINITION = {
  id: "fractal",
  name: "Fractal",
  shortName: "FRAC",
  group: "trend",
  placement: "overlay",
  maxInstances: 1,
  params: [{ key: "period", label: "Período", type: "number", min: 3, max: 25, step: 2, default: 5 }],
};

export function calcFractalOverlay(candles, { period = 5 } = {}) {
  const p = clampLen(period, 3);
  const win = p % 2 === 1 ? p : p + 1;
  const left = Math.floor(win / 2);
  const right = left;

  const up = [];
  const down = [];

  if (!Array.isArray(candles) || candles.length < win) return { up, down };

  for (let i = left; i <= candles.length - 1 - right; i++) {
    const t = n(candles[i]?.time);
    const hi = n(candles[i]?.high);
    const lo = n(candles[i]?.low);
    if (!Number.isFinite(t) || !Number.isFinite(hi) || !Number.isFinite(lo)) continue;

    let isUp = true;
    let isDown = true;

    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      const h = n(candles[j]?.high);
      const l = n(candles[j]?.low);
      if (Number.isFinite(h) && h >= hi) isUp = false;
      if (Number.isFinite(l) && l <= lo) isDown = false;
      if (!isUp && !isDown) break;
    }

    // ✅ IMPORTANTÍSSIMO: devolve também "value" (preço) pra desenhar na tela
    if (isUp) up.push({ time: t, value: hi });
    if (isDown) down.push({ time: t, value: lo });
  }

  return { up, down };
}
