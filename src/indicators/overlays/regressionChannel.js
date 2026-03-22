// src/indicators/overlays/regressionChannel.js

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

export function calcRegressionChannelOverlay(
  candles,
  { length = 50, multiplier = 2, source = "close" } = {}
) {
  const len = clampLen(length, 5);
  const mult = Math.max(0.1, Number(multiplier) || 2);

  const middle = [];
  const upper = [];
  const lower = [];

  if (!Array.isArray(candles) || candles.length < len) return { middle, upper, lower };

  // Para performance, faz regressão “rolling” simples (por janela)
  for (let i = len - 1; i < candles.length; i++) {
    // coleta janela
    const xs = [];
    const ys = [];
    const ts = [];

    for (let j = i - len + 1; j <= i; j++) {
      const t = n(candles[j]?.time);
      const y = pickSource(candles[j], source);
      if (!Number.isFinite(t) || !Number.isFinite(y)) continue;
      ts.push(t);
      ys.push(y);
      xs.push(xs.length); // 0..k-1
    }

    if (ys.length < Math.max(5, Math.floor(len * 0.8))) continue;

    // regressão linear
    const k = ys.length;
    let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
    for (let a = 0; a < k; a++) {
      const x = xs[a];
      const y = ys[a];
      sumX += x;
      sumY += y;
      sumXX += x * x;
      sumXY += x * y;
    }

    const denom = k * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-12) continue;

    const slope = (k * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / k;

    // desvio padrão dos resíduos
    let rss = 0;
    for (let a = 0; a < k; a++) {
      const x = xs[a];
      const yHat = intercept + slope * x;
      const r = ys[a] - yHat;
      rss += r * r;
    }
    const stdev = Math.sqrt(rss / Math.max(1, k));

    const tNow = n(candles[i]?.time);
    if (!Number.isFinite(tNow)) continue;

    const xNow = k - 1;
    const reg = intercept + slope * xNow;

    middle.push({ time: tNow, value: reg });
    upper.push({ time: tNow, value: reg + mult * stdev });
    lower.push({ time: tNow, value: reg - mult * stdev });
  }

  return { middle, upper, lower };
}

export const REGRESSION_CHANNEL_DEFINITION = {
  id: "regressionChannel",
  name: "Regression Channel",
  shortName: "REG",
  group: "trend",
  placement: "overlay",
  maxInstances: 1,
  params: [
    { key: "length", label: "Período", type: "number", min: 10, max: 500, step: 1, default: 50 },
    { key: "multiplier", label: "Bandas (σ)", type: "number", min: 0.5, max: 5, step: 0.1, default: 2 },
    {
      key: "source",
      label: "Preço",
      type: "select",
      options: [
        { value: "close", label: "Fechamento" },
        { value: "hl2", label: "HL2" },
        { value: "hlc3", label: "HLC3" },
        { value: "ohlc4", label: "OHLC4" },
      ],
      default: "close",
    },
  ],
};
