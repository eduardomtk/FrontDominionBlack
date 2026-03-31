import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, CrosshairMode, LineStyle } from "lightweight-charts";
import { calculateIndicatorSeries } from "@/indicators/calculators";
import { buildPerformanceWindow } from "@/components/Chart/utils/renderWindow";

const HISTORY_RESET_EVENT = "__lwc_history_reset__";

function safeNum(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : NaN;
}

function rgba(rgb, a) {
  const aa = Math.max(0, Math.min(1, Number(a)));
  return `rgba(${rgb},${aa})`;
}

function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function normalizeHexColor(v, fallback = "#ffffff") {
  const s = typeof v === "string" ? v.trim() : "";
  if (/^#([0-9a-fA-F]{6})$/.test(s)) return s;
  if (/^#([0-9a-fA-F]{3})$/.test(s)) {
    const r = s[1],
      g = s[2],
      b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function hexToRgb(hex) {
  const h = normalizeHexColor(hex);
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return { r, g, b };
}

function rgbaFromHex(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  const aa = clamp(a, 0, 1);
  return `rgba(${r},${g},${b},${aa})`;
}

function lineStyleToLwc(style) {
  const s = String(style || "").toLowerCase();
  if (s === "dotted") return LineStyle.Dotted;
  if (s === "dashed") return LineStyle.Dashed;
  return LineStyle.Solid;
}

function applyOptionsSafe(series, opts) {
  if (!series?.applyOptions) return;
  try {
    series.applyOptions(opts);
  } catch {}
}

function isPanePlacement(placement) {
  const p = String(placement || "").toLowerCase();
  return p === "pane" || p === "separate";
}

function buildFullCandleSeries(candles, liveCandle) {
  const closed = Array.isArray(candles) ? candles : [];
  if (!liveCandle) return closed;

  const lt = safeNum(liveCandle?.time);
  if (!Number.isFinite(lt)) return closed;

  const last = closed[closed.length - 1];
  const lastT = last ? safeNum(last?.time) : NaN;

  if (Number.isFinite(lastT) && lastT === lt) {
    return [...closed.slice(0, -1), liveCandle];
  }
  return [...closed, liveCandle];
}

function getFullSeriesSig(full) {
  const arr = Array.isArray(full) ? full : [];
  const len = arr.length;
  if (!len) return "0";
  const last = arr[len - 1] || {};
  return [
    len,
    safeNum(last.time),
    safeNum(last.open),
    safeNum(last.high),
    safeNum(last.low),
    safeNum(last.close),
    safeNum(last.volume),
  ].join("|");
}

function alignLineToCandles(fullCandles, rawLine) {
  const candles = Array.isArray(fullCandles) ? fullCandles : [];
  const line = Array.isArray(rawLine) ? rawLine : [];

  const byTime = new Map();
  for (const p of line) {
    const t = safeNum(p?.time);
    const v = safeNum(p?.value);
    if (Number.isFinite(t) && Number.isFinite(v)) byTime.set(t, v);
  }

  const out = [];
  let last = null;
  let started = false;

  for (const c of candles) {
    const t = safeNum(c?.time);
    if (!Number.isFinite(t)) continue;

    if (byTime.has(t)) {
      last = byTime.get(t);
      started = true;
      out.push({ time: t, value: last });
      continue;
    }

    if (!started) continue;
    out.push({ time: t, value: last });
  }

  return out;
}

function alignStochToCandles(fullCandles, rawK, rawD) {
  const candles = Array.isArray(fullCandles) ? fullCandles : [];
  const k = Array.isArray(rawK) ? rawK : [];
  const d = Array.isArray(rawD) ? rawD : [];

  const kByTime = new Map();
  for (const p of k) {
    const t = safeNum(p?.time);
    const v = safeNum(p?.value);
    if (Number.isFinite(t) && Number.isFinite(v)) kByTime.set(t, v);
  }

  const dByTime = new Map();
  for (const p of d) {
    const t = safeNum(p?.time);
    const v = safeNum(p?.value);
    if (Number.isFinite(t) && Number.isFinite(v)) dByTime.set(t, v);
  }

  const outK = [];
  const outD = [];

  let lastK = null;
  let lastD = null;
  let startedK = false;
  let startedD = false;

  for (const c of candles) {
    const t = safeNum(c?.time);
    if (!Number.isFinite(t)) continue;

    if (kByTime.has(t)) {
      lastK = kByTime.get(t);
      startedK = true;
      outK.push({ time: t, value: lastK });
    } else if (startedK) {
      outK.push({ time: t, value: lastK });
    }

    if (dByTime.has(t)) {
      lastD = dByTime.get(t);
      startedD = true;
      outD.push({ time: t, value: lastD });
    } else if (startedD) {
      outD.push({ time: t, value: lastD });
    }
  }

  return { k: outK, d: outD };
}

function buildAnchorData(fullCandles) {
  const candles = Array.isArray(fullCandles) ? fullCandles : [];
  const out = [];

  for (const c of candles) {
    const t = safeNum(c?.time);
    if (!Number.isFinite(t)) continue;
    out.push({ time: t, value: 0 });
  }

  return out;
}

function alignHistogramToCandles(fullCandles, rawHist) {
  const candles = Array.isArray(fullCandles) ? fullCandles : [];
  const hist = Array.isArray(rawHist) ? rawHist : [];

  const byTime = new Map();
  for (const p of hist) {
    const t = safeNum(p?.time);
    const v = safeNum(p?.value);
    if (Number.isFinite(t) && Number.isFinite(v)) byTime.set(t, v);
  }

  const out = [];
  let started = false;

  for (const c of candles) {
    const t = safeNum(c?.time);
    if (!Number.isFinite(t)) continue;

    if (byTime.has(t)) {
      started = true;
      out.push({ time: t, value: byTime.get(t) });
      continue;
    }

    if (!started) continue;
    out.push({ time: t, value: 0 });
  }

  return out;
}

function clampLevel(v, fallback) {
  const x = Number(v);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.min(100, x));
}

function getLevelsFromSettings(settings, defaults) {
  const upper = clampLevel(settings?.upperLevel, defaults.upper);
  const lower = clampLevel(settings?.lowerLevel, defaults.lower);
  const mid = clampLevel(settings?.midLevel, defaults.mid);
  const showMid = settings?.showMidLevel === false ? false : true;
  return { upper, lower, mid, showMid };
}

function ensureLevelLine(
  refObj,
  key,
  series,
  price,
  colorRGBA,
  axisLabelVisible = false,
  title = "",
  lineWidth = 1,
  lineStyle = LineStyle.Dashed
) {
  if (!series) return null;

  const opts = {
    price,
    color: colorRGBA,
    lineWidth,
    lineStyle,
    axisLabelVisible: Boolean(axisLabelVisible),
    title: title || "",
  };

  if (!refObj[key]) {
    try {
      refObj[key] = series.createPriceLine(opts);
    } catch {
      refObj[key] = null;
    }
  } else {
    try {
      refObj[key].applyOptions?.(opts);
    } catch {}
  }

  return refObj[key];
}

function getMasterRightScaleWidth(masterChart, fallback) {
  let w = Number(fallback);
  if (!Number.isFinite(w) || w <= 0) w = 72;

  if (!masterChart?.priceScale) return w;

  try {
    const pw = masterChart.priceScale("right")?.width?.();
    const n = Number(pw);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {}

  try {
    const o = masterChart.priceScale("right")?.options?.();
    const mw = Number(o?.minimumWidth);
    if (Number.isFinite(mw) && mw > 0) return mw;
  } catch {}

  return w;
}

function safeGetLogicalRange(chart) {
  try {
    const r = chart?.timeScale?.()?.getVisibleLogicalRange?.();
    const from = Number(r?.from);
    const to = Number(r?.to);
    if (Number.isFinite(from) && Number.isFinite(to)) return { from, to };
  } catch {}
  return null;
}

function safeGetTimeRange(chart) {
  try {
    const r = chart?.timeScale?.()?.getVisibleRange?.();
    if (r?.from != null && r?.to != null) return { from: r.from, to: r.to };
  } catch {}
  return null;
}

function safeGetBarSpacing(chart) {
  try {
    const v = Number(chart?.timeScale?.()?.barSpacing?.());
    if (Number.isFinite(v) && v > 0) return v;
  } catch {}
  try {
    const v = Number(chart?.timeScale?.()?.getBarSpacing?.());
    if (Number.isFinite(v) && v > 0) return v;
  } catch {}
  try {
    const v = Number(chart?.timeScale?.()?.options?.()?.barSpacing);
    if (Number.isFinite(v) && v > 0) return v;
  } catch {}
  return NaN;
}

function safeGetRightOffset(chart) {
  try {
    const v = Number(chart?.timeScale?.()?.rightOffset?.());
    if (Number.isFinite(v)) return v;
  } catch {}
  try {
    const v = Number(chart?.timeScale?.()?.getRightOffset?.());
    if (Number.isFinite(v)) return v;
  } catch {}
  try {
    const v = Number(chart?.timeScale?.()?.options?.()?.rightOffset);
    if (Number.isFinite(v)) return v;
  } catch {}
  return NaN;
}

function applyPaneStaticViewportFromMaster(masterChart, paneChart, fallbackRightScaleWidth = 72) {
  if (!masterChart?.timeScale || !paneChart?.timeScale) return;

  const slaveTS = paneChart.timeScale();
  const opt = {
    shiftVisibleRangeOnNewBar: false,
    lockVisibleTimeRangeOnResize: true,
  };

  const bs = safeGetBarSpacing(masterChart);
  const ro = safeGetRightOffset(masterChart);

  if (Number.isFinite(bs) && bs > 0) opt.barSpacing = bs;
  if (Number.isFinite(ro)) opt.rightOffset = ro;

  try {
    slaveTS.applyOptions?.(opt);
  } catch {}

  const rightScaleMinW = getMasterRightScaleWidth(masterChart, fallbackRightScaleWidth);
  try {
    paneChart.priceScale("right")?.applyOptions?.({
      minimumWidth: Math.max(1, Math.round(rightScaleMinW)),
    });
  } catch {}

  try {
    const masterOpts = masterChart?.timeScale?.()?.options?.() || {};
    slaveTS.applyOptions?.({
      fixLeftEdge: typeof masterOpts.fixLeftEdge === "boolean" ? masterOpts.fixLeftEdge : true,
      fixRightEdge: typeof masterOpts.fixRightEdge === "boolean" ? masterOpts.fixRightEdge : true,
    });
  } catch {}
}

function getInstanceSignature(inst) {
  if (!inst) return "none";
  return JSON.stringify({
    id: inst.id ?? null,
    typeId: inst.typeId ?? null,
    settings: inst.settings || {},
    visible: inst.visible !== false,
    placement: inst.placement ?? null,
  });
}

export default function IndicatorPaneChart({
  type,
  engine,
  masterChart,
  masterContainer,
  indicatorInstances,
  showTimeScale = false,
  priceScaleMinWidth = 72,
  onPaneReady,
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRefs = useRef({});
  const unsubRef = useRef(null);
  const roRef = useRef(null);

  const [isPaneReady, setIsPaneReady] = useState(false);

  const pendingPaneApiRef = useRef(null);
  const didRegisterPaneRef = useRef(false);
  const revealRaf1Ref = useRef(0);
  const revealRaf2Ref = useRef(0);
  const batchRafRef = useRef(0);
  const latestBatchRef = useRef({ candles: [], liveCandle: null });

  const levelsRef = useRef({ lower: 20, mid: 50, upper: 80, showMid: true });
  const levelSigRef = useRef("");
  const bgStyleSigRef = useRef("");
  const autoscaleSigRef = useRef("");
  const calcCacheRef = useRef(new Map());
  const seriesDataSigRef = useRef({});

  const onPaneReadyRef = useRef(onPaneReady);
  useEffect(() => {
    onPaneReadyRef.current = onPaneReady;
  }, [onPaneReady]);

  const lastAnchorLenRef = useRef(0);
  const lastAnchorLastTimeRef = useRef(NaN);

  const paneType = String(type || "").toLowerCase();

  const relevantInstances = useMemo(() => {
    const list = Array.isArray(indicatorInstances) ? indicatorInstances : [];
    const visiblePane = list.filter((i) => i && i.visible && isPanePlacement(i.placement));

    if (paneType === "rsi") return visiblePane.filter((i) => String(i.typeId || "").toLowerCase() === "rsi");
    if (paneType === "stoch") return visiblePane.filter((i) => String(i.typeId || "").toLowerCase() === "stochastic");
    if (paneType === "macd") return visiblePane.filter((i) => String(i.typeId || "").toLowerCase() === "macd");
    if (paneType === "volume") return visiblePane.filter((i) => String(i.typeId || "").toLowerCase() === "volume");

    if (
      paneType === "atr" ||
      paneType === "adx" ||
      paneType === "cci" ||
      paneType === "williamsr" ||
      paneType === "momentum" ||
      paneType === "roc"
    ) {
      return visiblePane.filter((i) => String(i.typeId || "").toLowerCase() === paneType);
    }

    return [];
  }, [indicatorInstances, paneType]);

  useEffect(() => {
    const el = masterContainer?.current || masterContainer || null;
    if (!el?.addEventListener) return;

    const onReset = (ev) => {
      const d = ev?.detail || {};
      console.log(`[HISTORY_RESET][PANE:${paneType}] sync-only epoch=${d.epoch} sig="${d.sig}"`);
      try {
        requestAnimationFrame(() => {
          try {
            applyPaneStaticViewportFromMaster(masterChart, chartRef.current, priceScaleMinWidth);
          } catch {}
        });
      } catch {}
    };

    try {
      el.addEventListener(HISTORY_RESET_EVENT, onReset);
    } catch {}

    return () => {
      try {
        el.removeEventListener(HISTORY_RESET_EVENT, onReset);
      } catch {}
    };
  }, [masterContainer, paneType, masterChart, priceScaleMinWidth]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el?.addEventListener) return;

    const stopWheel = (ev) => {
      try { ev.preventDefault(); } catch {}
      try { ev.stopPropagation(); } catch {}
    };

    const stopDragStart = (ev) => {
      try { ev.stopPropagation(); } catch {}
    };

    try { el.addEventListener("wheel", stopWheel, { capture: true, passive: false }); } catch {}
    try { el.addEventListener("mousedown", stopDragStart, true); } catch {}
    try { el.addEventListener("pointerdown", stopDragStart, true); } catch {}
    try { el.addEventListener("touchstart", stopDragStart, { capture: true, passive: true }); } catch {}

    return () => {
      try { el.removeEventListener("wheel", stopWheel, true); } catch {}
      try { el.removeEventListener("mousedown", stopDragStart, true); } catch {}
      try { el.removeEventListener("pointerdown", stopDragStart, true); } catch {}
      try { el.removeEventListener("touchstart", stopDragStart, true); } catch {}
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const list = Array.isArray(relevantInstances) ? relevantInstances : [];

    const byType = new Map();
    for (const inst of list) {
      const t = String(inst?.typeId || "").toLowerCase();
      if (t) byType.set(t, inst);
    }

    const applyCommonLine = (series, inst, fallbackHex, fallbackOpacity = 0.85) => {
      if (!series || !inst) return;

      const st = inst.settings || {};

      const color = rgbaFromHex(st.styleLineColor ?? fallbackHex, st.styleLineOpacity ?? fallbackOpacity);
      const lineWidth = clamp(st.styleLineWidth ?? 1, 1, 6);
      const lineStyle = lineStyleToLwc(st.styleLineStyle ?? "solid");

      const showLabels = !!st.visibilityPriceScaleLabels;
      const showStatus = !!st.visibilityStatusValues;

      applyOptionsSafe(series, {
        color,
        lineWidth,
        lineStyle,
        priceLineVisible: showLabels,
        lastValueVisible: showLabels,
        crosshairMarkerVisible: showStatus,
      });
    };

    if (paneType === "rsi") {
      const rsiInst = byType.get("rsi") || null;
      applyCommonLine(seriesRefs.current.rsiLine, rsiInst, "#ffffff", 0.85);
    }

    if (paneType === "stoch") {
      const stochInst = byType.get("stochastic") || null;
      if (!stochInst) return;

      const st = stochInst.settings || {};
      const lineWidth = clamp(st.styleLineWidth ?? 1, 1, 6);
      const lineStyle = lineStyleToLwc(st.styleLineStyle ?? "solid");
      const showLabels = !!st.visibilityPriceScaleLabels;
      const showStatus = !!st.visibilityStatusValues;

      applyOptionsSafe(seriesRefs.current.stochK, {
        color: rgbaFromHex(st.styleKColor ?? "#00c176", st.styleKOpacity ?? 0.85),
        lineWidth,
        lineStyle,
        priceLineVisible: showLabels,
        lastValueVisible: showLabels,
        crosshairMarkerVisible: showStatus,
      });

      applyOptionsSafe(seriesRefs.current.stochD, {
        color: rgbaFromHex(st.styleDColor ?? "#ffffff", st.styleDOpacity ?? 0.7),
        lineWidth,
        lineStyle,
        priceLineVisible: showLabels,
        lastValueVisible: showLabels,
        crosshairMarkerVisible: showStatus,
      });
    }

    if (paneType === "macd") {
      const macdInst = byType.get("macd") || null;
      if (!macdInst) return;

      const st = macdInst.settings || {};
      const showLabels = !!st.visibilityPriceScaleLabels;
      const showStatus = !!st.visibilityStatusValues;

      applyOptionsSafe(seriesRefs.current.macdLine, {
        color: rgbaFromHex(st.styleMacdColor ?? "#ffffff", st.styleLineOpacity ?? 0.85),
        lineWidth: clamp(st.styleLineWidth ?? 1, 1, 6),
        lineStyle: lineStyleToLwc(st.styleLineStyle ?? "solid"),
        priceLineVisible: showLabels,
        lastValueVisible: showLabels,
        crosshairMarkerVisible: showStatus,
      });

      applyOptionsSafe(seriesRefs.current.sigLine, {
        color: rgbaFromHex(st.styleSignalColor ?? "#ffffff", st.styleSignalOpacity ?? 0.55),
        lineWidth: clamp(st.styleLineWidth ?? 1, 1, 6),
        lineStyle: lineStyleToLwc(st.styleLineStyle ?? "solid"),
        priceLineVisible: showLabels,
        lastValueVisible: showLabels,
        crosshairMarkerVisible: showStatus,
      });

      applyOptionsSafe(seriesRefs.current.hist, {
        priceLineVisible: showLabels,
        lastValueVisible: showLabels,
        crosshairMarkerVisible: showStatus,
      });
    }

    if (paneType === "volume") {
      const volInst = byType.get("volume") || null;
      if (!volInst) return;

      const st = volInst.settings || {};
      const showLabels = !!st.visibilityPriceScaleLabels;
      const showStatus = !!st.visibilityStatusValues;

      applyOptionsSafe(seriesRefs.current.vol, {
        priceLineVisible: showLabels,
        lastValueVisible: showLabels,
        crosshairMarkerVisible: showStatus,
      });
    }

    if (paneType === "atr" || paneType === "cci" || paneType === "williamsr" || paneType === "momentum" || paneType === "roc") {
      const inst = byType.get(paneType) || null;
      applyCommonLine(seriesRefs.current.line, inst, "#ffffff", 0.85);
    }

    if (paneType === "adx") {
      const inst = byType.get("adx") || null;
      if (!inst) return;

      const st = inst.settings || {};
      applyCommonLine(seriesRefs.current.adxLine, inst, "#ffffff", 0.85);

      const commonWidth = clamp(st.styleLineWidth ?? 1, 1, 6);
      const commonStyle = lineStyleToLwc(st.styleLineStyle ?? "solid");
      const showLabels = !!st.visibilityPriceScaleLabels;
      const showStatus = !!st.visibilityStatusValues;

      applyOptionsSafe(seriesRefs.current.plusDiLine, {
        color: rgbaFromHex(st.stylePlusColor ?? "#00c176", st.stylePlusOpacity ?? 0.75),
        lineWidth: commonWidth,
        lineStyle: commonStyle,
        priceLineVisible: showLabels,
        lastValueVisible: showLabels,
        crosshairMarkerVisible: showStatus,
      });

      applyOptionsSafe(seriesRefs.current.minusDiLine, {
        color: rgbaFromHex(st.styleMinusColor ?? "#ff4d4f", st.styleMinusOpacity ?? 0.7),
        lineWidth: commonWidth,
        lineStyle: commonStyle,
        priceLineVisible: showLabels,
        lastValueVisible: showLabels,
        crosshairMarkerVisible: showStatus,
      });
    }
  }, [relevantInstances, paneType]);

  const revealPaneWhenStable = () => {
    if (didRegisterPaneRef.current) return;

    const chart = chartRef.current;
    const payload = pendingPaneApiRef.current;
    if (!chart || !payload) return;

    didRegisterPaneRef.current = true;

    try {
      applyPaneStaticViewportFromMaster(masterChart, chart, priceScaleMinWidth);
    } catch {}

    const cb = onPaneReadyRef.current;
    if (typeof cb === "function") {
      try {
        cb(payload);
      } catch {}
    }

    if (revealRaf1Ref.current) {
      try {
        cancelAnimationFrame(revealRaf1Ref.current);
      } catch {}
      revealRaf1Ref.current = 0;
    }
    if (revealRaf2Ref.current) {
      try {
        cancelAnimationFrame(revealRaf2Ref.current);
      } catch {}
      revealRaf2Ref.current = 0;
    }

    revealRaf1Ref.current = requestAnimationFrame(() => {
      revealRaf1Ref.current = 0;
      revealRaf2Ref.current = requestAnimationFrame(() => {
        revealRaf2Ref.current = 0;
        try {
          applyPaneStaticViewportFromMaster(masterChart, chartRef.current, priceScaleMinWidth);
        } catch {}
        setIsPaneReady(true);
      });
    });
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    console.log(`[PANE_INIT:${paneType}] mount/sync`);

    setIsPaneReady(false);
    pendingPaneApiRef.current = null;
    didRegisterPaneRef.current = false;
    calcCacheRef.current = new Map();
    seriesDataSigRef.current = {};
    levelSigRef.current = "";
    bgStyleSigRef.current = "";
    autoscaleSigRef.current = "";

    if (revealRaf1Ref.current) {
      try {
        cancelAnimationFrame(revealRaf1Ref.current);
      } catch {}
      revealRaf1Ref.current = 0;
    }
    if (revealRaf2Ref.current) {
      try {
        cancelAnimationFrame(revealRaf2Ref.current);
      } catch {}
      revealRaf2Ref.current = 0;
    }
    if (batchRafRef.current) {
      try {
        cancelAnimationFrame(batchRafRef.current);
      } catch {}
      batchRafRef.current = 0;
    }

    try {
      unsubRef.current?.();
    } catch {}
    unsubRef.current = null;

    try {
      roRef.current?.disconnect?.();
    } catch {}
    roRef.current = null;

    try {
      chartRef.current?.remove?.();
    } catch {}
    chartRef.current = null;
    seriesRefs.current = {};

    lastAnchorLenRef.current = 0;
    lastAnchorLastTimeRef.current = NaN;

    const rect = el.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    const rightScaleMinW = getMasterRightScaleWidth(masterChart, priceScaleMinWidth);

    const chart = createChart(el, {
      width,
      height,
      layout: { background: { color: "rgba(0,0,0,0)" }, textColor: "#cbd5f5" },
      grid: { vertLines: { color: "#1e293b" }, horzLines: { color: "#1e293b" } },
      rightPriceScale: { visible: true, borderVisible: false, minimumWidth: rightScaleMinW },
      crosshair: { mode: CrosshairMode.Hidden },
      handleScroll: false,
      handleScale: false,
      timeScale: {
        visible: Boolean(showTimeScale),
        borderVisible: false,
        timeVisible: Boolean(showTimeScale),
        secondsVisible: Boolean(showTimeScale),
        lockVisibleTimeRangeOnResize: true,
        shiftVisibleRangeOnNewBar: false,
      },
    });

    chartRef.current = chart;

    try {
      chart.applyOptions({
        grid: { horzLines: { visible: false } },
      });
    } catch {}

    if (paneType === "rsi" || paneType === "stoch") {
      try {
        chart.applyOptions({
          localization: {
            priceFormatter: (price) => {
              const p = Number(price);
              if (!Number.isFinite(p)) return "";

              const lv = levelsRef.current || { lower: 20, mid: 50, upper: 80, showMid: true };
              const eps = 0.0001;

              if (Math.abs(p - lv.lower) < eps) return lv.lower.toFixed(2);
              if (Math.abs(p - lv.upper) < eps) return lv.upper.toFixed(2);
              if (lv.showMid && Math.abs(p - lv.mid) < eps) return lv.mid.toFixed(2);
              return "";
            },
          },
        });
      } catch {}
    }

    const anchor = chart.addLineSeries({
      priceScaleId: "__anchor",
      color: "rgba(0,0,0,0)",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    seriesRefs.current.__anchor = anchor;

    try {
      chart.priceScale("__anchor").applyOptions({
        visible: false,
        borderVisible: false,
        ticksVisible: false,
        autoScale: false,
        scaleMargins: { top: 0, bottom: 0 },
      });
    } catch {}

    if (paneType === "rsi") {
      const hlinesBg = chart.addBaselineSeries({
        priceScaleId: "right",
        topLineColor: "rgba(0,0,0,0)",
        bottomLineColor: "rgba(0,0,0,0)",
        topFillColor1: "rgba(0,0,0,0)",
        topFillColor2: "rgba(0,0,0,0)",
        bottomFillColor1: "rgba(0,0,0,0)",
        bottomFillColor2: "rgba(0,0,0,0)",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      seriesRefs.current.__hlinesBg = hlinesBg;

      const rsiLine = chart.addLineSeries({
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        color: "rgba(255,255,255,0.85)",
      });

      seriesRefs.current = { ...seriesRefs.current, rsiLine };
      seriesRefs.current.__levelLines = {};

      try {
        chart.priceScale("right").applyOptions({
          autoScale: true,
          scaleMargins: { top: 0.12, bottom: 0.1 },
        });
      } catch {}
    }

    if (paneType === "stoch") {
      const hlinesBg = chart.addBaselineSeries({
        priceScaleId: "right",
        topLineColor: "rgba(0,0,0,0)",
        bottomLineColor: "rgba(0,0,0,0)",
        topFillColor1: "rgba(0,0,0,0)",
        topFillColor2: "rgba(0,0,0,0)",
        bottomFillColor1: "rgba(0,0,0,0)",
        bottomFillColor2: "rgba(0,0,0,0)",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      seriesRefs.current.__hlinesBg = hlinesBg;

      const stochK = chart.addLineSeries({
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        color: "rgba(0,193,118,0.85)",
      });

      const stochD = chart.addLineSeries({
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        color: "rgba(255,255,255,0.70)",
      });

      seriesRefs.current = { ...seriesRefs.current, stochK, stochD };
      seriesRefs.current.__levelLines = {};

      try {
        chart.priceScale("right").applyOptions({
          autoScale: true,
          scaleMargins: { top: 0.12, bottom: 0.1 },
        });
      } catch {}
    }

    if (paneType === "macd") {
      const hist = chart.addHistogramSeries({
        priceLineVisible: false,
        lastValueVisible: false,
        base: 0,
      });

      const macdLine = chart.addLineSeries({
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        color: "rgba(255,255,255,0.85)",
      });

      const sigLine = chart.addLineSeries({
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        color: "rgba(255,255,255,0.55)",
      });

      macdLine.createPriceLine({
        price: 0,
        color: "rgba(255,255,255,0.14)",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: "",
      });

      seriesRefs.current = { ...seriesRefs.current, hist, macdLine, sigLine };

      try {
        chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.12, bottom: 0.1 } });
      } catch {}
    }

    if (paneType === "volume") {
      const vol = chart.addHistogramSeries({
        priceLineVisible: false,
        lastValueVisible: false,
        priceFormat: { type: "volume" },
      });

      seriesRefs.current = { ...seriesRefs.current, vol };

      try {
        chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.18, bottom: 0.1 } });
      } catch {}
    }

    if (paneType === "atr" || paneType === "cci" || paneType === "williamsr" || paneType === "momentum" || paneType === "roc") {
      const line = chart.addLineSeries({
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        color: "rgba(255,255,255,0.85)",
      });

      seriesRefs.current = { ...seriesRefs.current, line };

      try {
        chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.12, bottom: 0.1 } });
      } catch {}
    }

    if (paneType === "adx") {
      const adxLine = chart.addLineSeries({
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        color: "rgba(255,255,255,0.85)",
      });

      const plusDiLine = chart.addLineSeries({
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        color: "rgba(0,193,118,0.75)",
      });

      const minusDiLine = chart.addLineSeries({
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        color: "rgba(255,77,77,0.70)",
      });

      seriesRefs.current = { ...seriesRefs.current, adxLine, plusDiLine, minusDiLine };

      try {
        chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.12, bottom: 0.1 } });
      } catch {}
    }

    pendingPaneApiRef.current = {
      chart,
      container: el,
      getSeries: () => {
        const s = seriesRefs.current || {};
        return (
          s.rsiLine ||
          s.stochK ||
          s.stochD ||
          s.macdLine ||
          s.sigLine ||
          s.hist ||
          s.vol ||
          s.adxLine ||
          s.plusDiLine ||
          s.minusDiLine ||
          s.line ||
          null
        );
      },
    };

    try {
      applyPaneStaticViewportFromMaster(masterChart, chart, priceScaleMinWidth);
    } catch {}

    const ro = new ResizeObserver((entries) => {
      const cr = entries?.[0]?.contentRect;
      if (!cr || !chartRef.current) return;
      const w = Math.floor(cr.width);
      const h = Math.floor(cr.height);
      if (w > 0 && h > 0) chartRef.current.applyOptions({ width: w, height: h });
    });

    ro.observe(el);
    roRef.current = ro;

    return () => {
      if (revealRaf1Ref.current) {
        try {
          cancelAnimationFrame(revealRaf1Ref.current);
        } catch {}
        revealRaf1Ref.current = 0;
      }
      if (revealRaf2Ref.current) {
        try {
          cancelAnimationFrame(revealRaf2Ref.current);
        } catch {}
        revealRaf2Ref.current = 0;
      }
      if (batchRafRef.current) {
        try {
          cancelAnimationFrame(batchRafRef.current);
        } catch {}
        batchRafRef.current = 0;
      }

      pendingPaneApiRef.current = null;
      didRegisterPaneRef.current = false;
      setIsPaneReady(false);

      const cb2 = onPaneReadyRef.current;
      if (typeof cb2 === "function") {
        try {
          cb2(null);
        } catch {}
      }

      try {
        unsubRef.current?.();
      } catch {}
      unsubRef.current = null;

      try {
        roRef.current?.disconnect?.();
      } catch {}
      roRef.current = null;

      try {
        chartRef.current?.remove?.();
      } catch {}
      chartRef.current = null;
      seriesRefs.current = {};
    };
  }, [paneType, showTimeScale, priceScaleMinWidth, masterChart]);

  useEffect(() => {
    if (!engine) return;

    try {
      unsubRef.current?.();
    } catch {}
    unsubRef.current = null;

    const setSeriesDataSafe = (key, series, data, sig) => {
      if (!series?.setData) return;
      if (seriesDataSigRef.current[key] === sig) return;
      seriesDataSigRef.current[key] = sig;
      try {
        series.setData(data);
      } catch {}
    };

    const clearAllPaneSeries = (reason) => {
      const s = seriesRefs.current || {};
      const keys = [
        ["__anchor", s.__anchor],
        ["rsiLine", s.rsiLine],
        ["stochK", s.stochK],
        ["stochD", s.stochD],
        ["macdLine", s.macdLine],
        ["sigLine", s.sigLine],
        ["hist", s.hist],
        ["vol", s.vol],
        ["adxLine", s.adxLine],
        ["plusDiLine", s.plusDiLine],
        ["minusDiLine", s.minusDiLine],
        ["line", s.line],
        ["__hlinesBg", s.__hlinesBg],
      ];
      for (const [key, series] of keys) {
        try {
          series?.setData?.([]);
        } catch {}
        seriesDataSigRef.current[key] = "__empty__";
      }

      lastAnchorLenRef.current = 0;
      lastAnchorLastTimeRef.current = NaN;
      calcCacheRef.current.clear();

      console.log(`[PANE_DATA_CLEAR:${paneType}] reason=${reason}`);
    };

    const getCachedCalc = (inst, full) => {
      if (!inst) return null;
      const key = `${paneType}|${getInstanceSignature(inst)}|${getFullSeriesSig(full)}`;
      if (calcCacheRef.current.has(key)) return calcCacheRef.current.get(key);
      const res = calculateIndicatorSeries(inst, full);
      calcCacheRef.current.clear();
      calcCacheRef.current.set(key, res);
      return res;
    };

    const flushBatch = () => {
      batchRafRef.current = 0;
      const { candles, liveCandle } = latestBatchRef.current || {};
      const full = buildPerformanceWindow(candles, liveCandle, masterChart, {
        fallbackRecentBars: 1500,
        leftWarmupBars: 420,
        leftViewportBufferBars: 240,
        rightViewportBufferBars: 140,
        maxWindowBars: 3000,
        minWindowBars: 900,
      });
      const fullSig = getFullSeriesSig(full);

      if (!full.length) {
        clearAllPaneSeries("empty_batch");
        return;
      }

      const last = full[full.length - 1];
      const lastT = safeNum(last?.time);

      if (full.length !== lastAnchorLenRef.current || (Number.isFinite(lastT) && lastT !== lastAnchorLastTimeRef.current)) {
        lastAnchorLenRef.current = full.length;
        lastAnchorLastTimeRef.current = lastT;
        const anchorData = buildAnchorData(full);
        setSeriesDataSafe("__anchor", seriesRefs.current.__anchor, anchorData, `a|${full.length}|${lastT}`);
      }

      if (!didRegisterPaneRef.current) {
        revealPaneWhenStable();
      }

      if (paneType === "rsi") {
        const rsiInst = relevantInstances[0] || null;
        const levelLines = seriesRefs.current.__levelLines || (seriesRefs.current.__levelLines = {});
        const rsiLine = seriesRefs.current.rsiLine;
        const bgSeries = seriesRefs.current.__hlinesBg;

        let lv = { lower: 20, mid: 50, upper: 80, showMid: true };
        if (rsiInst) lv = getLevelsFromSettings(rsiInst.settings, lv);
        if (!(Number.isFinite(lv.lower) && Number.isFinite(lv.upper)) || lv.upper <= lv.lower) {
          lv = { lower: 20, mid: 50, upper: 80, showMid: true };
        }
        levelsRef.current = { ...lv };

        const levelSig = JSON.stringify(lv);
        if (autoscaleSigRef.current !== `rsi|${levelSig}`) {
          autoscaleSigRef.current = `rsi|${levelSig}`;
          try {
            rsiLine?.applyOptions?.({
              autoscaleInfoProvider: () => ({ priceRange: { minValue: lv.lower, maxValue: lv.upper } }),
            });
          } catch {}
        }

        const st = rsiInst?.settings || {};
        const bgEnabled = st.stylePaneBgEnabled === false ? false : true;
        const bgColor = rgbaFromHex(st.stylePaneBgColor ?? "#16a34a", st.stylePaneBgOpacity ?? 0.1);
        const bgSig = JSON.stringify({ bgEnabled, bgColor, lower: lv.lower, upper: lv.upper });

        if (bgSeries?.setData) {
          if (bgEnabled) {
            if (bgStyleSigRef.current !== `rsi|${bgSig}`) {
              bgStyleSigRef.current = `rsi|${bgSig}`;
              try {
                bgSeries.applyOptions?.({
                  baseValue: { type: "price", price: lv.lower },
                  topFillColor1: bgColor,
                  topFillColor2: bgColor,
                  bottomFillColor1: bgColor,
                  bottomFillColor2: bgColor,
                  topLineColor: "rgba(0,0,0,0)",
                  bottomLineColor: "rgba(0,0,0,0)",
                  visible: true,
                });
              } catch {}
            }

            const bgData = full.map((c) => ({ time: safeNum(c?.time), value: lv.upper })).filter((p) => Number.isFinite(p.time));
            setSeriesDataSafe("__hlinesBg", bgSeries, bgData, `rsi-bg|${fullSig}|${levelSig}`);
          } else {
            if (bgStyleSigRef.current !== "rsi|disabled") {
              bgStyleSigRef.current = "rsi|disabled";
              try {
                bgSeries.applyOptions?.({ visible: false });
              } catch {}
            }
            setSeriesDataSafe("__hlinesBg", bgSeries, [], "rsi-bg|empty");
          }
        }

        if (levelSigRef.current !== `rsi|${levelSig}`) {
          levelSigRef.current = `rsi|${levelSig}`;
          const cOuter = "rgba(255,255,255,0.22)";
          const cMid = "rgba(255,255,255,0.10)";

          ensureLevelLine(levelLines, "__rsiLowLine", rsiLine, lv.lower, cOuter, false, "", 2, LineStyle.Dashed);
          ensureLevelLine(levelLines, "__rsiHighLine", rsiLine, lv.upper, cOuter, false, "", 2, LineStyle.Dashed);
          if (lv.showMid) {
            ensureLevelLine(levelLines, "__rsiMidLine", rsiLine, lv.mid, cMid, false, "", 1, LineStyle.Dotted);
          } else {
            ensureLevelLine(levelLines, "__rsiMidLine", rsiLine, lv.mid, "rgba(0,0,0,0)", false, "", 1, LineStyle.Dotted);
          }
          ensureLevelLine(levelLines, "__rsiLowLabel", rsiLine, lv.lower, "rgba(0,0,0,0)", true, "", 1, LineStyle.Solid);
          ensureLevelLine(levelLines, "__rsiHighLabel", rsiLine, lv.upper, "rgba(0,0,0,0)", true, "", 1, LineStyle.Solid);
          ensureLevelLine(levelLines, "__rsiMidLabel", rsiLine, lv.mid, "rgba(0,0,0,0)", true, "", 1, LineStyle.Solid);
        }

        if (rsiInst) {
          const res = getCachedCalc(rsiInst, full);
          if (res?.kind === "line") {
            const aligned = alignLineToCandles(full, Array.isArray(res.data) ? res.data : []);
            setSeriesDataSafe("rsiLine", rsiLine, aligned, `rsi-line|${fullSig}|${levelSig}`);
          } else {
            setSeriesDataSafe("rsiLine", rsiLine, [], "rsi-line|empty");
          }
        } else {
          setSeriesDataSafe("rsiLine", rsiLine, [], "rsi-line|empty");
        }
        return;
      }

      if (paneType === "stoch") {
        const stochInst = relevantInstances[0] || null;
        const levelLines = seriesRefs.current.__levelLines || (seriesRefs.current.__levelLines = {});
        const stochK = seriesRefs.current.stochK;
        const stochD = seriesRefs.current.stochD;
        const bgSeries = seriesRefs.current.__hlinesBg;

        let lv = { lower: 20, mid: 50, upper: 80, showMid: true };
        if (stochInst) lv = getLevelsFromSettings(stochInst.settings, lv);
        if (!(Number.isFinite(lv.lower) && Number.isFinite(lv.upper)) || lv.upper <= lv.lower) {
          lv = { lower: 20, mid: 50, upper: 80, showMid: true };
        }
        levelsRef.current = { ...lv };

        const levelSig = JSON.stringify(lv);
        if (autoscaleSigRef.current !== `stoch|${levelSig}`) {
          autoscaleSigRef.current = `stoch|${levelSig}`;
          try {
            stochK?.applyOptions?.({
              autoscaleInfoProvider: () => ({ priceRange: { minValue: lv.lower, maxValue: lv.upper } }),
            });
            stochD?.applyOptions?.({
              autoscaleInfoProvider: () => ({ priceRange: { minValue: lv.lower, maxValue: lv.upper } }),
            });
          } catch {}
        }

        const st = stochInst?.settings || {};
        const bgEnabled = st.stylePaneBgEnabled === false ? false : true;
        const bgColor = rgbaFromHex(st.stylePaneBgColor ?? "#16a34a", st.stylePaneBgOpacity ?? 0.1);
        const bgSig = JSON.stringify({ bgEnabled, bgColor, lower: lv.lower, upper: lv.upper });

        if (bgSeries?.setData) {
          if (bgEnabled) {
            if (bgStyleSigRef.current !== `stoch|${bgSig}`) {
              bgStyleSigRef.current = `stoch|${bgSig}`;
              try {
                bgSeries.applyOptions?.({
                  baseValue: { type: "price", price: lv.lower },
                  topFillColor1: bgColor,
                  topFillColor2: bgColor,
                  bottomFillColor1: bgColor,
                  bottomFillColor2: bgColor,
                  topLineColor: "rgba(0,0,0,0)",
                  bottomLineColor: "rgba(0,0,0,0)",
                  visible: true,
                });
              } catch {}
            }

            const bgData = full.map((c) => ({ time: safeNum(c?.time), value: lv.upper })).filter((p) => Number.isFinite(p.time));
            setSeriesDataSafe("__hlinesBg", bgSeries, bgData, `stoch-bg|${fullSig}|${levelSig}`);
          } else {
            if (bgStyleSigRef.current !== "stoch|disabled") {
              bgStyleSigRef.current = "stoch|disabled";
              try {
                bgSeries.applyOptions?.({ visible: false });
              } catch {}
            }
            setSeriesDataSafe("__hlinesBg", bgSeries, [], "stoch-bg|empty");
          }
        }

        if (levelSigRef.current !== `stoch|${levelSig}`) {
          levelSigRef.current = `stoch|${levelSig}`;
          const cOuter = "rgba(255,255,255,0.22)";
          const cMid = "rgba(255,255,255,0.10)";

          ensureLevelLine(levelLines, "__stochLowLine", stochK, lv.lower, cOuter, false, "", 2, LineStyle.Dashed);
          ensureLevelLine(levelLines, "__stochHighLine", stochK, lv.upper, cOuter, false, "", 2, LineStyle.Dashed);
          if (lv.showMid) {
            ensureLevelLine(levelLines, "__stochMidLine", stochK, lv.mid, cMid, false, "", 1, LineStyle.Dotted);
          } else {
            ensureLevelLine(levelLines, "__stochMidLine", stochK, lv.mid, "rgba(0,0,0,0)", false, "", 1, LineStyle.Dotted);
          }
          ensureLevelLine(levelLines, "__stochLowLabel", stochK, lv.lower, "rgba(0,0,0,0)", true, "", 1, LineStyle.Solid);
          ensureLevelLine(levelLines, "__stochHighLabel", stochK, lv.upper, "rgba(0,0,0,0)", true, "", 1, LineStyle.Solid);
          ensureLevelLine(levelLines, "__stochMidLabel", stochK, lv.mid, "rgba(0,0,0,0)", true, "", 1, LineStyle.Solid);
        }

        if (stochInst) {
          const res = getCachedCalc(stochInst, full);
          if (res?.kind === "stoch") {
            const d = res.data || {};
            const aligned = alignStochToCandles(full, Array.isArray(d.k) ? d.k : [], Array.isArray(d.d) ? d.d : []);
            setSeriesDataSafe("stochK", stochK, aligned.k, `stoch-k|${fullSig}|${levelSig}`);
            setSeriesDataSafe("stochD", stochD, aligned.d, `stoch-d|${fullSig}|${levelSig}`);
          } else {
            setSeriesDataSafe("stochK", stochK, [], "stoch-k|empty");
            setSeriesDataSafe("stochD", stochD, [], "stoch-d|empty");
          }
        } else {
          setSeriesDataSafe("stochK", stochK, [], "stoch-k|empty");
          setSeriesDataSafe("stochD", stochD, [], "stoch-d|empty");
        }
        return;
      }

      if (paneType === "macd") {
        const inst = relevantInstances[0];
        if (!inst) {
          setSeriesDataSafe("hist", seriesRefs.current.hist, [], "macd-hist|empty");
          setSeriesDataSafe("macdLine", seriesRefs.current.macdLine, [], "macd-line|empty");
          setSeriesDataSafe("sigLine", seriesRefs.current.sigLine, [], "macd-sig|empty");
          return;
        }

        const res = getCachedCalc(inst, full);
        if (res?.kind === "macd") {
          const d = res.data || {};
          const macd = Array.isArray(d.macd) ? d.macd : [];
          const sig = Array.isArray(d.signal) ? d.signal : [];
          const hist = Array.isArray(d.hist) ? d.hist : [];

          setSeriesDataSafe("macdLine", seriesRefs.current.macdLine, alignLineToCandles(full, macd), `macd-line|${fullSig}`);
          setSeriesDataSafe("sigLine", seriesRefs.current.sigLine, alignLineToCandles(full, sig), `macd-sig|${fullSig}`);

          const histAligned = alignHistogramToCandles(full, hist)
            .map((p) => {
              const v = safeNum(p?.value);
              const t = safeNum(p?.time);
              if (!Number.isFinite(v) || !Number.isFinite(t)) return null;
              const color = v >= 0 ? rgba("0,193,118", 0.55) : rgba("255,77,77", 0.55);
              return { time: t, value: v, color };
            })
            .filter(Boolean);

          setSeriesDataSafe("hist", seriesRefs.current.hist, histAligned, `macd-hist|${fullSig}`);
        }
        return;
      }

      if (paneType === "volume") {
        const inst = relevantInstances[0];
        if (!inst) {
          setSeriesDataSafe("vol", seriesRefs.current.vol, [], "vol|empty");
          return;
        }

        const res = getCachedCalc(inst, full);
        if (res?.kind === "volume") {
          const vol = Array.isArray(res.data) ? res.data : [];

          const byTimeClose = new Map();
          for (const c of full) {
            const t = safeNum(c?.time);
            const o = safeNum(c?.open);
            const cl = safeNum(c?.close);
            if (Number.isFinite(t) && Number.isFinite(o) && Number.isFinite(cl)) {
              byTimeClose.set(t, { o, cl });
            }
          }

          const volAligned = alignHistogramToCandles(
            full,
            vol.map((p) => ({ time: p?.time, value: p?.value }))
          );

          const vdata = volAligned
            .map((p) => {
              const t = safeNum(p?.time);
              const v = safeNum(p?.value);
              if (!Number.isFinite(t) || !Number.isFinite(v)) return null;

              const oc = byTimeClose.get(t);
              const up = oc ? oc.cl >= oc.o : true;

              if (v === 0) return { time: t, value: 0, color: "rgba(0,0,0,0)" };

              return {
                time: t,
                value: v,
                color: up ? rgba("0,193,118", 0.45) : rgba("255,77,77", 0.45),
              };
            })
            .filter(Boolean);

          setSeriesDataSafe("vol", seriesRefs.current.vol, vdata, `vol|${fullSig}`);
        }
        return;
      }

      if (paneType === "atr" || paneType === "cci" || paneType === "williamsr" || paneType === "momentum" || paneType === "roc") {
        const inst = relevantInstances[0];
        const line = seriesRefs.current.line;

        if (!inst) {
          setSeriesDataSafe("line", line, [], `line|${paneType}|empty`);
          return;
        }

        const res = getCachedCalc(inst, full);
        if (res?.kind === "line") {
          setSeriesDataSafe("line", line, alignLineToCandles(full, Array.isArray(res.data) ? res.data : []), `line|${paneType}|${fullSig}`);
        } else {
          setSeriesDataSafe("line", line, [], `line|${paneType}|empty`);
        }
        return;
      }

      if (paneType === "adx") {
        const inst = relevantInstances[0];
        const adxLine = seriesRefs.current.adxLine;
        const plusDiLine = seriesRefs.current.plusDiLine;
        const minusDiLine = seriesRefs.current.minusDiLine;

        if (!inst) {
          setSeriesDataSafe("adxLine", adxLine, [], "adx|empty");
          setSeriesDataSafe("plusDiLine", plusDiLine, [], "+di|empty");
          setSeriesDataSafe("minusDiLine", minusDiLine, [], "-di|empty");
          return;
        }

        const res = getCachedCalc(inst, full);
        if (res?.kind === "adx") {
          const d = res.data || {};
          const adx = Array.isArray(d.adx) ? d.adx : [];
          const plusDI = Array.isArray(d.plusDI) ? d.plusDI : [];
          const minusDI = Array.isArray(d.minusDI) ? d.minusDI : [];

          setSeriesDataSafe("adxLine", adxLine, alignLineToCandles(full, adx), `adx|${fullSig}`);
          setSeriesDataSafe("plusDiLine", plusDiLine, alignLineToCandles(full, plusDI), `+di|${fullSig}`);
          setSeriesDataSafe("minusDiLine", minusDiLine, alignLineToCandles(full, minusDI), `-di|${fullSig}`);
        } else {
          setSeriesDataSafe("adxLine", adxLine, [], "adx|empty");
          setSeriesDataSafe("plusDiLine", plusDiLine, [], "+di|empty");
          setSeriesDataSafe("minusDiLine", minusDiLine, [], "-di|empty");
        }
      }
    };

    const scheduleFlush = () => {
      if (batchRafRef.current) return;
      batchRafRef.current = requestAnimationFrame(flushBatch);
    };

    let rangeRafId = 0;
    const onMasterRangeChange = () => {
      if (rangeRafId) return;
      rangeRafId = requestAnimationFrame(() => {
        rangeRafId = 0;
        scheduleFlush();
      });
    };

    try {
      masterChart?.timeScale?.()?.subscribeVisibleTimeRangeChange?.(onMasterRangeChange);
    } catch {}

    unsubRef.current = engine.subscribeCandles((candles, liveCandle) => {
      latestBatchRef.current = { candles, liveCandle };
      scheduleFlush();
    });

    return () => {
      if (rangeRafId) {
        try {
          cancelAnimationFrame(rangeRafId);
        } catch {}
        rangeRafId = 0;
      }
      try {
        masterChart?.timeScale?.()?.unsubscribeVisibleTimeRangeChange?.(onMasterRangeChange);
      } catch {}
      if (batchRafRef.current) {
        try {
          cancelAnimationFrame(batchRafRef.current);
        } catch {}
        batchRafRef.current = 0;
      }
      try {
        unsubRef.current?.();
      } catch {}
      unsubRef.current = null;
    };
  }, [engine, paneType, relevantInstances, masterChart]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        opacity: isPaneReady ? 1 : 0,
        visibility: isPaneReady ? "visible" : "hidden",
        touchAction: "none",
        userSelect: "none",
      }}
    />
  );
}
