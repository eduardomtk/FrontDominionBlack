// src/indicators/overlays/pivots.js

function n(v, fallback = NaN) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function clampLen(length, min = 1) {
  return Math.max(min, Math.floor(Number(length) || min));
}

function dayKeyUTC(sec) {
  const d = new Date(sec * 1000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function computeDailyOHLC(candles) {
  // retorna mapa dayKey -> {h,l,c, firstTime, lastTime}
  const m = new Map();
  for (let i = 0; i < candles.length; i++) {
    const t = n(candles[i]?.time);
    if (!Number.isFinite(t)) continue;
    const h = n(candles[i]?.high);
    const l = n(candles[i]?.low);
    const c = n(candles[i]?.close);
    if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue;

    const k = dayKeyUTC(t);
    const cur = m.get(k);
    if (!cur) {
      m.set(k, { h, l, c, firstTime: t, lastTime: t });
    } else {
      cur.h = Math.max(cur.h, h);
      cur.l = Math.min(cur.l, l);
      cur.c = c;
      cur.lastTime = t;
    }
  }
  return m;
}

function classicPivots(prevDay) {
  const H = prevDay.h;
  const L = prevDay.l;
  const C = prevDay.c;

  const P = (H + L + C) / 3;
  const R1 = 2 * P - L;
  const S1 = 2 * P - H;
  const R2 = P + (H - L);
  const S2 = P - (H - L);
  const R3 = H + 2 * (P - L);
  const S3 = L - 2 * (H - P);

  return { P, R1, R2, R3, S1, S2, S3 };
}

// Produz séries “step” por dia (pivôs valem pro dia atual, calculados do dia anterior)
export function calcPivotsOverlay(candles, { showR3S3 = true } = {}) {
  const parts = {
    P: [],
    R1: [],
    R2: [],
    R3: [],
    S1: [],
    S2: [],
    S3: [],
  };

  if (!Array.isArray(candles) || candles.length < 5) return { parts };

  const dmap = computeDailyOHLC(candles);
  const days = Array.from(dmap.keys()).sort();

  for (let di = 1; di < days.length; di++) {
    const prevKey = days[di - 1];
    const curKey = days[di];

    const prevDay = dmap.get(prevKey);
    const curDay = dmap.get(curKey);
    if (!prevDay || !curDay) continue;

    const pv = classicPivots(prevDay);

    const t0 = curDay.firstTime;
    const t1 = curDay.lastTime;

    // duas pontas por dia (horizontal)
    const push = (k, v) => {
      parts[k].push({ time: t0, value: v });
      parts[k].push({ time: t1, value: v });
    };

    push("P", pv.P);
    push("R1", pv.R1);
    push("R2", pv.R2);
    push("S1", pv.S1);
    push("S2", pv.S2);

    if (showR3S3) {
      push("R3", pv.R3);
      push("S3", pv.S3);
    }
  }

  return { parts };
}

export const PIVOTS_DEFINITION = {
  id: "pivots",
  name: "Pivots (Daily)",
  shortName: "PIV",
  group: "trend",
  placement: "overlay",
  maxInstances: 1,
  params: [
    { key: "showR3S3", label: "Mostrar R3/S3", type: "boolean", default: true },
  ],
};
