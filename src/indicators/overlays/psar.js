// src/indicators/overlays/psar.js

function n(v, fallback = NaN) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

export const PSAR_DEFINITION = {
  id: "psar",
  name: "Parabolic SAR",
  shortName: "PSAR",
  group: "trend",
  placement: "overlay",
  maxInstances: 1,
  params: [
    { key: "start", label: "Início", type: "number", min: 0.001, max: 0.2, step: 0.001, default: 0.02 },
    { key: "increment", label: "Incremento", type: "number", min: 0.001, max: 0.2, step: 0.001, default: 0.02 },
    { key: "max", label: "Máx", type: "number", min: 0.01, max: 1, step: 0.01, default: 0.2 },
    {
      key: "precision",
      label: "Precisão",
      type: "select",
      options: [
        { value: "default", label: "Padrão" },
        { value: "0", label: "0" },
        { value: "1", label: "0,1" },
        { value: "2", label: "0,01" },
        { value: "3", label: "0,001" },
        { value: "4", label: "0,0001" },
      ],
      default: "default",
    },
  ],
};

export function calcParabolicSAROverlay(candles, { step = 0.02, max = 0.2 } = {}) {
  const out = [];
  const afStep = Math.max(0.001, Number(step) || 0.02);
  const afMax = Math.max(afStep, Number(max) || 0.2);

  if (!Array.isArray(candles) || candles.length < 2) return out;

  let isUp = n(candles[1]?.close) >= n(candles[0]?.close);
  let af = afStep;

  let ep = isUp ? n(candles[0]?.high) : n(candles[0]?.low);
  let sar = isUp ? n(candles[0]?.low) : n(candles[0]?.high);

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const t = n(c?.time);
    const h = n(c?.high);
    const l = n(c?.low);

    if (!Number.isFinite(t) || !Number.isFinite(h) || !Number.isFinite(l)) continue;

    sar = sar + af * (ep - sar);

    if (isUp) {
      const l1 = n(candles[i - 1]?.low);
      const l2 = n(candles[i - 2]?.low);
      if (Number.isFinite(l1)) sar = Math.min(sar, l1);
      if (Number.isFinite(l2)) sar = Math.min(sar, l2);

      if (l < sar) {
        isUp = false;
        sar = ep;
        ep = l;
        af = afStep;
      } else {
        if (h > ep) {
          ep = h;
          af = Math.min(af + afStep, afMax);
        }
      }
    } else {
      const h1 = n(candles[i - 1]?.high);
      const h2 = n(candles[i - 2]?.high);
      if (Number.isFinite(h1)) sar = Math.max(sar, h1);
      if (Number.isFinite(h2)) sar = Math.max(sar, h2);

      if (h > sar) {
        isUp = true;
        sar = ep;
        ep = h;
        af = afStep;
      } else {
        if (l < ep) {
          ep = l;
          af = Math.min(af + afStep, afMax);
        }
      }
    }

    out.push({ time: t, value: sar });
  }

  return out;
}
