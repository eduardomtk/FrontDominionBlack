// src/indicators/overlays/autosr.js

function n(v, fallback = NaN) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function clampLen(length, min = 1) {
  return Math.max(min, Math.floor(Number(length) || min));
}

function pickHL(c) {
  return { h: n(c?.high), l: n(c?.low), t: n(c?.time) };
}

// AutoSR por clustering de níveis via “toques” (rápido e prático)
// - lookback: quantas velas olhar
// - maxLevels: quantos níveis retornar
// - sensitivity: tolerância (0.5..3). Maior = agrupa mais
export function calcAutoSROverlay(candles, { lookback = 300, maxLevels = 6, sensitivity = 1.2 } = {}) {
  const parts = {}; // "L1".."Ln" => [{time,value}...]

  const lb = clampLen(lookback, 50);
  const maxL = clampLen(maxLevels, 2);
  const sens = Math.max(0.5, Number(sensitivity) || 1.2);

  if (!Array.isArray(candles) || candles.length < 20) return { parts };

  const start = Math.max(0, candles.length - lb);
  const slice = candles.slice(start);

  // estima "step" via range médio (proxy rápido)
  let avgRange = 0;
  let count = 0;
  for (let i = 0; i < slice.length; i++) {
    const h = n(slice[i]?.high);
    const l = n(slice[i]?.low);
    if (!Number.isFinite(h) || !Number.isFinite(l)) continue;
    avgRange += Math.max(0, h - l);
    count++;
  }
  avgRange = count ? avgRange / count : 0;
  const tol = Math.max(1e-8, avgRange * 0.35 * sens);

  // buckets por preço arredondado
  const bucket = new Map(); // key -> { priceSum, touches }
  const addTouch = (price) => {
    if (!Number.isFinite(price)) return;
    const key = Math.round(price / tol);
    const cur = bucket.get(key);
    if (!cur) bucket.set(key, { priceSum: price, touches: 1 });
    else {
      cur.priceSum += price;
      cur.touches += 1;
    }
  };

  // conta toques em highs/lows
  for (let i = 0; i < slice.length; i++) {
    const { h, l } = pickHL(slice[i]);
    addTouch(h);
    addTouch(l);
  }

  // seleciona os melhores níveis por toque
  const levels = Array.from(bucket.entries())
    .map(([key, v]) => ({ key, price: v.priceSum / v.touches, touches: v.touches }))
    .sort((a, b) => b.touches - a.touches)
    .slice(0, maxL)
    .sort((a, b) => a.price - b.price);

  if (!levels.length) return { parts };

  // cria “linhas horizontais” ocupando toda a janela visível (slice)
  let t0 = n(slice[0]?.time);
  let t1 = n(slice[slice.length - 1]?.time);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return { parts };

  for (let i = 0; i < levels.length; i++) {
    const k = `L${i + 1}`;
    const v = levels[i].price;
    parts[k] = [{ time: t0, value: v }, { time: t1, value: v }];
  }

  return { parts };
}

export const AUTOSR_DEFINITION = {
  id: "autosr",
  name: "Auto SR (Suporte/Resistência)",
  shortName: "SR",
  group: "trend",
  placement: "overlay",
  maxInstances: 1,
  params: [
    { key: "lookback", label: "Lookback", type: "number", min: 50, max: 2000, step: 10, default: 300 },
    { key: "maxLevels", label: "Qtd níveis", type: "number", min: 2, max: 12, step: 1, default: 6 },
    { key: "sensitivity", label: "Sensibilidade", type: "number", min: 0.5, max: 3, step: 0.1, default: 1.2 },
  ],
};
