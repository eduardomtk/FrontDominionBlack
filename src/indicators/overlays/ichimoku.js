// src/indicators/overlays/ichimoku.js
// Observação: teu IndicatorLayer ainda não tem handler "ichimoku" (triple/double etc.)
// Então aqui eu retorno um "channel-like" básico (middle=tenkan, upper=kijun, lower=senkouA)
// e você já consegue desenhar 3 linhas de cara. Depois a gente evolui pro set completo.

function n(v, fallback = NaN) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}
function clampLen(length, min = 1) {
  return Math.max(min, Math.floor(Number(length) || min));
}

function highestHigh(candles, from, to) {
  let hh = -Infinity;
  for (let i = from; i <= to; i++) {
    const h = n(candles[i]?.high);
    if (Number.isFinite(h)) hh = Math.max(hh, h);
  }
  return hh;
}
function lowestLow(candles, from, to) {
  let ll = Infinity;
  for (let i = from; i <= to; i++) {
    const l = n(candles[i]?.low);
    if (Number.isFinite(l)) ll = Math.min(ll, l);
  }
  return ll;
}

export const ICHIMOKU_DEFINITION = {
  id: "ichimoku",
  name: "Ichimoku (Simplificado)",
  shortName: "ICHI",
  group: "trend",
  placement: "overlay",
  maxInstances: 1,
  params: [
    // ✅ curto prazo “adaptado”: 6/13/26 funciona bem em M1–M5
    { key: "tenkan", label: "Tenkan", type: "number", min: 2, max: 200, step: 1, default: 6 },
    { key: "kijun", label: "Kijun", type: "number", min: 2, max: 200, step: 1, default: 13 },
    { key: "senkouB", label: "Senkou B", type: "number", min: 2, max: 300, step: 1, default: 26 },
  ],
};

export function calcIchimokuOverlay(candles, { tenkan = 6, kijun = 13, senkouB = 26 } = {}) {
  const tLen = clampLen(tenkan, 2);
  const kLen = clampLen(kijun, 2);
  const bLen = clampLen(senkouB, 2);

  const tenkanLine = [];
  const kijunLine = [];
  const senkouALine = []; // (tenkan+kijun)/2
  const senkouBLine = [];

  for (let i = 0; i < (candles?.length || 0); i++) {
    const t = n(candles[i]?.time);
    if (!Number.isFinite(t)) continue;

    if (i >= tLen - 1) {
      const hh = highestHigh(candles, i - tLen + 1, i);
      const ll = lowestLow(candles, i - tLen + 1, i);
      if (Number.isFinite(hh) && Number.isFinite(ll)) tenkanLine.push({ time: t, value: (hh + ll) / 2 });
    }

    if (i >= kLen - 1) {
      const hh = highestHigh(candles, i - kLen + 1, i);
      const ll = lowestLow(candles, i - kLen + 1, i);
      if (Number.isFinite(hh) && Number.isFinite(ll)) kijunLine.push({ time: t, value: (hh + ll) / 2 });
    }

    // Senkou B (sem deslocamento por enquanto: overlay prático)
    if (i >= bLen - 1) {
      const hh = highestHigh(candles, i - bLen + 1, i);
      const ll = lowestLow(candles, i - bLen + 1, i);
      if (Number.isFinite(hh) && Number.isFinite(ll)) senkouBLine.push({ time: t, value: (hh + ll) / 2 });
    }
  }

  // Senkou A usando times alinhados (sem deslocamento)
  const kijunByTime = new Map();
  for (const p of kijunLine) kijunByTime.set(p.time, p.value);

  for (const p of tenkanLine) {
    const k = kijunByTime.get(p.time);
    if (!Number.isFinite(k)) continue;
    senkouALine.push({ time: p.time, value: (p.value + k) / 2 });
  }

  // ✅ retornando como "channel": middle=tenkan, upper=kijun, lower=senkouA
  // (senkouB a gente adiciona quando evoluir o IndicatorLayer pra suportar mais linhas)
  return {
    middle: tenkanLine,
    upper: kijunLine,
    lower: senkouALine,
    extra: { senkouB: senkouBLine },
  };
}
