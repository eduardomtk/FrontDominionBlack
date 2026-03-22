// src/indicators/calculators.js

import { calcSMAOverlay } from "@/indicators/overlays/sma";
import { calcEMAOverlay } from "@/indicators/overlays/ema";
import { calcWMAOverlay } from "@/indicators/overlays/wma";
import { calcHMAOverlay } from "@/indicators/overlays/hma";
import { calcVWMAOverlay } from "@/indicators/overlays/vwma";

import { calcBollingerOverlay } from "@/indicators/overlays/bollinger";
import { calcVWAPOverlay } from "@/indicators/overlays/vwap";
import { calcDonchianOverlay } from "@/indicators/overlays/donchian";
import { calcKeltnerOverlay } from "@/indicators/overlays/keltner";
import { calcEnvelopesOverlay } from "@/indicators/overlays/envelopes";

import { calcParabolicSAROverlay } from "@/indicators/overlays/psar";
import { calcSuperTrendOverlay } from "@/indicators/overlays/supertrend";
import { calcFractalOverlay } from "@/indicators/overlays/fractal";

import { calcATRBandsOverlay } from "@/indicators/overlays/atrBands";
import { calcIchimokuOverlay } from "@/indicators/overlays/ichimoku";

// ✅ overlays separados (sem duplicar HMA)
import { calcZigZagOverlay } from "@/indicators/overlays/zigzag";
import { calcRegressionChannelOverlay } from "@/indicators/overlays/regressionChannel";
import { calcPivotsOverlay } from "@/indicators/overlays/pivots";
import { calcAutoSROverlay } from "@/indicators/overlays/autoSR";
import { calcAnchoredVWAPOverlay } from "@/indicators/overlays/anchoredVwap";

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

// ================== RSI ==================
export function calcRSI(candles, { length = 14 } = {}) {
  const out = [];
  const nLen = clampLen(length, 2);

  if (!Array.isArray(candles) || candles.length < nLen + 1) return out;

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= nLen; i++) {
    const cur = n(candles[i]?.close);
    const prev = n(candles[i - 1]?.close);
    if (!Number.isFinite(cur) || !Number.isFinite(prev)) return out;

    const diff = cur - prev;
    if (diff >= 0) gainSum += diff;
    else lossSum += -diff;
  }

  let avgGain = gainSum / nLen;
  let avgLoss = lossSum / nLen;

  const rsiFrom = (g, l) => {
    if (l === 0) return 100;
    const rs = g / l;
    return 100 - 100 / (1 + rs);
  };

  let lastRSI = rsiFrom(avgGain, avgLoss);

  out.push({ time: Number(candles[nLen]?.time), value: lastRSI });

  for (let i = nLen + 1; i < candles.length; i++) {
    const cur = n(candles[i]?.close);
    const prev = n(candles[i - 1]?.close);

    if (!Number.isFinite(cur) || !Number.isFinite(prev)) {
      out.push({ time: Number(candles[i]?.time), value: lastRSI });
      continue;
    }

    const diff = cur - prev;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (nLen - 1) + gain) / nLen;
    avgLoss = (avgLoss * (nLen - 1) + loss) / nLen;

    lastRSI = rsiFrom(avgGain, avgLoss);
    out.push({ time: Number(candles[i]?.time), value: lastRSI });
  }

  return out;
}

// ================== EMA helper (mantido para MACD etc.) ==================
export function calcEMA(candles, { length = 20, source = "close" } = {}) {
  const out = [];
  const nLen = clampLen(length, 1);
  const k = 2 / (nLen + 1);

  let emaPrev = null;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const time = Number(c?.time);
    if (!Number.isFinite(time)) continue;

    const v = pickSource(c, source);

    if (!Number.isFinite(v)) {
      if (emaPrev != null && Number.isFinite(emaPrev)) {
        out.push({ time, value: emaPrev });
      }
      continue;
    }

    emaPrev = emaPrev == null ? v : v * k + emaPrev * (1 - k);
    out.push({ time, value: emaPrev });
  }

  return out;
}

// ================== MACD ==================
export function calcMACD(candles, { fast = 12, slow = 26, signal = 9, source = "close" } = {}) {
  const f = clampLen(fast, 1);
  const s = clampLen(slow, 1);
  const sigLen = clampLen(signal, 1);

  if (!Array.isArray(candles) || candles.length < Math.max(f, s) + sigLen) {
    return { macd: [], signal: [], hist: [] };
  }

  const emaFast = calcEMA(candles, { length: f, source });
  const emaSlow = calcEMA(candles, { length: s, source });

  const slowByTime = new Map();
  for (const p of emaSlow) {
    const t = n(p?.time);
    const v = n(p?.value);
    if (Number.isFinite(t) && Number.isFinite(v)) slowByTime.set(t, v);
  }

  const macdLine = [];
  for (const p of emaFast) {
    const t = n(p?.time);
    const vF = n(p?.value);
    const vS = slowByTime.get(t);
    if (!Number.isFinite(t) || !Number.isFinite(vF) || !Number.isFinite(vS)) continue;
    macdLine.push({ time: t, value: vF - vS });
  }

  if (macdLine.length < sigLen) return { macd: [], signal: [], hist: [] };

  const fake = macdLine.map((p) => ({ time: p.time, close: p.value }));
  const signalLine = calcEMA(fake, { length: sigLen, source: "close" });

  const sigByTime = new Map();
  for (const p of signalLine) {
    const t = n(p?.time);
    const v = n(p?.value);
    if (Number.isFinite(t) && Number.isFinite(v)) sigByTime.set(t, v);
  }

  const hist = [];
  const signalOut = [];
  for (const p of macdLine) {
    const t = n(p?.time);
    const m = n(p?.value);
    const sig = sigByTime.get(t);
    if (!Number.isFinite(t) || !Number.isFinite(m) || !Number.isFinite(sig)) continue;

    signalOut.push({ time: t, value: sig });
    hist.push({ time: t, value: m - sig });
  }

  return { macd: macdLine, signal: signalOut, hist };
}

// ================== STOCHASTIC ==================
export function calcStochastic(candles, { kLength = 14, dLength = 3, smoothK = 3 } = {}) {
  const outK = [];
  const outD = [];

  const kLen = clampLen(kLength, 2);
  const dLen = clampLen(dLength, 1);
  const sK = clampLen(smoothK, 1);

  if (!Array.isArray(candles) || candles.length < kLen + dLen) {
    return { k: [], d: [] };
  }

  const rawK = [];
  let lastK = null;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const t = n(c?.time);
    const cl = n(c?.close);
    if (!Number.isFinite(t) || !Number.isFinite(cl)) continue;

    let hh = -Infinity;
    let ll = Infinity;

    for (let j = Math.max(0, i - kLen + 1); j <= i; j++) {
      const h = n(candles[j]?.high);
      const l = n(candles[j]?.low);
      if (!Number.isFinite(h) || !Number.isFinite(l)) continue;
      if (h > hh) hh = h;
      if (l < ll) ll = l;
    }

    if (!Number.isFinite(hh) || !Number.isFinite(ll)) continue;

    if (hh === ll) {
      const fallbackK = lastK == null ? 50 : lastK;
      rawK.push({ time: t, value: fallbackK });
      lastK = fallbackK;
      continue;
    }

    const k = ((cl - ll) / (hh - ll)) * 100;
    rawK.push({ time: t, value: k });
    lastK = k;
  }

  const smoothKSeries = [];
  {
    const buf = [];
    for (let i = 0; i < rawK.length; i++) {
      const p = rawK[i];
      buf.push(p.value);
      if (buf.length > sK) buf.shift();
      if (buf.length === sK) {
        const v = buf.reduce((a, x) => a + x, 0) / sK;
        smoothKSeries.push({ time: p.time, value: v });
      }
    }
  }

  {
    const buf = [];
    for (let i = 0; i < smoothKSeries.length; i++) {
      const p = smoothKSeries[i];
      buf.push(p.value);
      if (buf.length > dLen) buf.shift();
      if (buf.length === dLen) {
        const v = buf.reduce((a, x) => a + x, 0) / dLen;
        outD.push({ time: p.time, value: v });
      }
    }
  }

  for (const p of smoothKSeries) outK.push(p);

  return { k: outK, d: outD };
}

// ================== VOLUME ==================
export function calcVolume(candles) {
  const out = [];
  if (!Array.isArray(candles) || !candles.length) return out;

  for (const c of candles) {
    const t = n(c?.time);
    if (!Number.isFinite(t)) continue;

    let v = n(c?.volume);
    if (!Number.isFinite(v)) v = n(c?.tickVolume);
    if (!Number.isFinite(v)) {
      const o = n(c?.open);
      const cl = n(c?.close);
      const h = n(c?.high);
      const l = n(c?.low);
      if (Number.isFinite(o) && Number.isFinite(cl) && Number.isFinite(h) && Number.isFinite(l)) {
        v = Math.abs(cl - o) + Math.max(0, h - l);
      } else {
        v = NaN;
      }
    }

    if (!Number.isFinite(v)) continue;
    out.push({ time: t, value: v });
  }

  return out;
}

// ================== ATR (Wilder / RMA) ==================
export function calcATR(candles, { length = 14 } = {}) {
  const out = [];
  const nLen = clampLen(length, 1);

  if (!Array.isArray(candles) || !candles.length) return out;

  let trCount = 0;
  let trSum = 0;
  let lastATR = null;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const t = n(c?.time);
    if (!Number.isFinite(t)) continue;

    const h = n(c?.high);
    const l = n(c?.low);
    const pc = n(candles[i - 1]?.close);

    if (!Number.isFinite(h) || !Number.isFinite(l)) {
      if (lastATR != null) out.push({ time: t, value: lastATR });
      continue;
    }

    const tr =
      i === 0 || !Number.isFinite(pc)
        ? h - l
        : Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));

    if (!Number.isFinite(tr)) {
      if (lastATR != null) out.push({ time: t, value: lastATR });
      continue;
    }

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

// ================== ADX / DMI ==================
export function calcADX(candles, { length = 14 } = {}) {
  const adx = [];
  const plusDI = [];
  const minusDI = [];

  const nLen = clampLen(length, 2);
  let trSum = 0,
    plusSum = 0,
    minusSum = 0;

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const t = n(c?.time);
    if (!Number.isFinite(t)) continue;

    const up = n(c.high) - n(p.high);
    const down = n(p.low) - n(c.low);

    const plusDM = up > down && up > 0 ? up : 0;
    const minusDM = down > up && down > 0 ? down : 0;

    const tr = Math.max(
      n(c.high) - n(c.low),
      Math.abs(n(c.high) - n(p.close)),
      Math.abs(n(c.low) - n(p.close))
    );

    trSum += tr;
    plusSum += plusDM;
    minusSum += minusDM;

    if (i >= nLen) {
      const pDI = trSum === 0 ? 0 : (plusSum / trSum) * 100;
      const mDI = trSum === 0 ? 0 : (minusSum / trSum) * 100;

      plusDI.push({ time: t, value: pDI });
      minusDI.push({ time: t, value: mDI });

      const dx = pDI + mDI === 0 ? 0 : (Math.abs(pDI - mDI) / (pDI + mDI)) * 100;

      const prevADX = adx.length ? adx[adx.length - 1].value : dx;
      const curADX = (prevADX * (nLen - 1) + dx) / nLen;

      adx.push({ time: t, value: curADX });
    }
  }

  return { adx, plusDI, minusDI };
}

// ================== CCI ==================
export function calcCCI(candles, { length = 20 } = {}) {
  const out = [];
  const nLen = clampLen(length, 2);
  const buf = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const t = n(c?.time);
    if (!Number.isFinite(t)) continue;

    const tp = (n(c.high) + n(c.low) + n(c.close)) / 3;
    if (!Number.isFinite(tp)) continue;

    buf.push(tp);
    if (buf.length > nLen) buf.shift();

    if (buf.length === nLen) {
      const mean = buf.reduce((a, x) => a + x, 0) / nLen;
      const dev = buf.reduce((a, x) => a + Math.abs(x - mean), 0) / nLen || 1;
      out.push({ time: t, value: (tp - mean) / (0.015 * dev) });
    }
  }

  return out;
}

// ================== WILLIAMS %R ==================
export function calcWilliamsR(candles, { length = 14 } = {}) {
  const out = [];
  const nLen = clampLen(length, 2);

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const t = n(c?.time);
    if (i < nLen - 1 || !Number.isFinite(t)) continue;

    let hh = -Infinity;
    let ll = Infinity;

    for (let j = i - nLen + 1; j <= i; j++) {
      hh = Math.max(hh, n(candles[j]?.high));
      ll = Math.min(ll, n(candles[j]?.low));
    }

    if (!Number.isFinite(hh) || !Number.isFinite(ll) || hh === ll) continue;
    out.push({ time: t, value: ((hh - n(c.close)) / (hh - ll)) * -100 });
  }

  return out;
}

// ================== MOMENTUM ==================
export function calcMomentum(candles, { length = 10 } = {}) {
  const out = [];
  const nLen = clampLen(length, 1);

  for (let i = nLen; i < candles.length; i++) {
    const c = candles[i];
    const t = n(c?.time);
    const prev = n(candles[i - nLen]?.close);
    const cur = n(c?.close);

    if (!Number.isFinite(t) || !Number.isFinite(prev) || !Number.isFinite(cur)) continue;

    out.push({ time: t, value: cur - prev });
  }

  return out;
}

// ================== ROC ==================
export function calcROC(candles, { length = 12 } = {}) {
  const out = [];
  const nLen = clampLen(length, 1);

  for (let i = nLen; i < candles.length; i++) {
    const c = candles[i];
    const t = n(c?.time);
    const prev = n(candles[i - nLen]?.close);
    const cur = n(c?.close);

    if (!Number.isFinite(t) || !Number.isFinite(prev) || prev === 0) continue;
    out.push({ time: t, value: ((cur - prev) / prev) * 100 });
  }

  return out;
}

// ================== Dispatcher (ÚNICO) ==================
export function calculateIndicatorSeries(indicator, candles) {
  const { typeId, settings } = indicator;

  switch (typeId) {
    // ✅ OVERLAYS (agora em arquivos separados)
    case "sma":
      return { kind: "line", data: calcSMAOverlay(candles, settings) };
    case "ema":
      return { kind: "line", data: calcEMAOverlay(candles, settings) };
    case "wma":
      return { kind: "line", data: calcWMAOverlay(candles, settings) };
    case "hma":
      return { kind: "line", data: calcHMAOverlay(candles, settings) };
    case "vwma":
      return { kind: "line", data: calcVWMAOverlay(candles, settings) };

    case "bollinger":
      return { kind: "bands", data: calcBollingerOverlay(candles, settings) };

    case "vwap":
      return { kind: "line", data: calcVWAPOverlay(candles, settings) };
    case "donchian":
      return { kind: "channel", data: calcDonchianOverlay(candles, settings) };
    case "keltner":
      return { kind: "channel", data: calcKeltnerOverlay(candles, settings) };
    case "envelopes":
      return { kind: "channel", data: calcEnvelopesOverlay(candles, settings) };
    case "atrbands":
      return { kind: "channel", data: calcATRBandsOverlay(candles, settings) };

    case "psar":
      return { kind: "psar", data: calcParabolicSAROverlay(candles, settings) };

    case "supertrend":
      return { kind: "supertrend", data: calcSuperTrendOverlay(candles, settings) };

    case "fractal":
      return { kind: "fractal", data: calcFractalOverlay(candles, settings) };

    case "ichimoku":
      return { kind: "ichimoku", data: calcIchimokuOverlay(candles, settings) };

    case "zigzag":
      return { kind: "line", data: calcZigZagOverlay(candles, settings) };

    case "regressionchannel":
    case "regressionChannel":
      return { kind: "channel", data: calcRegressionChannelOverlay(candles, settings) };

    case "pivots":
      return { kind: "multi", data: calcPivotsOverlay(candles, settings) };

    case "autosr":
      return { kind: "multi", data: calcAutoSROverlay(candles, settings) };

    case "anchoredvwap":
    case "anchoredVwap":
      return { kind: "line", data: calcAnchoredVWAPOverlay(candles, settings) };

    // ✅ PANES (mantidos como estão no teu projeto)
    case "rsi":
      return { kind: "line", data: calcRSI(candles, settings) };
    case "stochastic":
      return { kind: "stoch", data: calcStochastic(candles, settings) };
    case "macd":
      return { kind: "macd", data: calcMACD(candles, settings) };
    case "volume":
      return { kind: "volume", data: calcVolume(candles) };

    case "atr":
      return { kind: "line", data: calcATR(candles, settings) };
    case "adx":
      return { kind: "adx", data: calcADX(candles, settings) };
    case "cci":
      return { kind: "line", data: calcCCI(candles, settings) };
    case "williamsr":
      return { kind: "line", data: calcWilliamsR(candles, settings) };
    case "momentum":
      return { kind: "line", data: calcMomentum(candles, settings) };
    case "roc":
      return { kind: "line", data: calcROC(candles, settings) };

    default:
      return { kind: "none", data: [] };
  }
}
