import { useEffect, useMemo, useRef, useState, useCallback } from "react";

import MainChart from "../MainChart";
import PairSelectorButton from "./PairSelectorButton";
import PairSelectorPanel from "./PairSelectorPanel";
import FloatingToolbar from "./FloatingToolbar";
import TimeframePanel from "./TimeframePanel";
import ChartTypePanel from "./ChartTypePanel";
import IndicatorsPanel from "./IndicatorsPanel";
import DrawingToolsPanel from "./DrawingToolsPanel";
import ScrollToRealtimeButton from "./ScrollToRealtimeButton";

import { usePairUI } from "../../../context/PairUIContext";
import { useIndicators } from "@/context/IndicatorsContext";
import { useCandleEngine } from "@/context/CandleContext";
import { useMarketStore } from "@/stores/market.store";

import { PaneManagerProvider, usePaneManager } from "@/components/Chart/panes/PaneManagerContext";
import PaneSplitter from "@/components/Chart/panes/PaneSplitter";
import PaneHost from "@/components/Chart/panes/PaneHost";
import IndicatorPaneChart from "@/components/Chart/panes/IndicatorPaneChart";
import TimeScaleFooterChart from "@/components/Chart/panes/TimeScaleFooterChart";
import { PANE_TYPES } from "@/components/Chart/panes/paneTypes";

import { ensureViewportBroker, disposeViewportBroker } from "@/components/Chart/panes/ViewportBroker";

import SoundManager from "@/sound/SoundManager.js";

import DrawingOverlay from "@/components/Chart/Drawings/DrawingOverlay";
import { LightweightChartsTransform } from "@/components/Chart/Drawings/transform/LightweightChartsTransform";
import DrawingQuickToolbar from "@/components/Chart/Drawings/DrawingQuickToolbar";

import useDrawingsPersistence from "@/components/Chart/Drawings/persistence/useDrawingsPersistence";
import useIndicatorsPersistence from "@/components/Chart/Indicators/persistence/useIndicatorsPersistence";

import { useTranslation } from "react-i18next";

function normalizeTf(tf) {
  const s = String(tf || "").trim().toUpperCase();
  if (s === "M1" || s === "M5" || s === "M15" || s === "M30" || s === "H1") return s;
  if (s === "1M" || s === "1MIN" || s === "1MINUTE" || s === "1") return "M1";
  if (s === "5M" || s === "5MIN" || s === "5MINUTE" || s === "5") return "M5";
  if (s === "15M" || s === "15MIN" || s === "15MINUTE" || s === "15") return "M15";
  if (s === "30M" || s === "30MIN" || s === "30MINUTE" || s === "30") return "M30";
  if (s === "1H" || s === "H1" || s === "60M" || s === "60" || s === "60MIN") return "H1";
  return "M1";
}

function isPanePlacement(placement) {
  const p = String(placement || "").toLowerCase();
  return p === "pane" || p === "separate";
}

function paneKeyFromInstance(inst) {
  if (!isPanePlacement(inst?.placement)) return null;

  const t = String(inst?.typeId || "").toLowerCase();

  if (t === "rsi") return PANE_TYPES.RSI;
  if (t === "stochastic") return PANE_TYPES.STOCH;
  if (t === "macd") return PANE_TYPES.MACD;
  if (t === "volume") return PANE_TYPES.VOLUME;

  if (t === "atr") return PANE_TYPES.ATR;
  if (t === "adx") return PANE_TYPES.ADX;
  if (t === "cci") return PANE_TYPES.CCI;
  if (t === "williamsr") return PANE_TYPES.WILLIAMSR;
  if (t === "momentum") return PANE_TYPES.MOMENTUM;
  if (t === "roc") return PANE_TYPES.ROC;

  return null;
}

function isForexSymbol(symbol) {
  const s = String(symbol || "").toUpperCase().trim();
  const pair = s.includes("/") ? s.replace("/", "") : s;
  return /^[A-Z]{6}$/.test(pair);
}

function getPriceScaleMinWidth(symbol) {
  if (isForexSymbol(symbol)) return 72;
  return 96;
}


function findNearestTimeIndex(sortedTimes, targetTime) {
  const arr = Array.isArray(sortedTimes) ? sortedTimes : [];
  const len = arr.length;
  const t = Number(targetTime);
  if (!len || !Number.isFinite(t)) return null;

  let lo = 0;
  let hi = len - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const value = Number(arr[mid]);
    if (!Number.isFinite(value)) return null;
    if (value === t) return mid;
    if (value < t) lo = mid + 1;
    else hi = mid - 1;
  }

  if (lo <= 0) return 0;
  if (lo >= len) return len - 1;

  const prev = Number(arr[lo - 1]);
  const next = Number(arr[lo]);
  if (!Number.isFinite(prev)) return lo;
  if (!Number.isFinite(next)) return lo - 1;
  return Math.abs(t - prev) <= Math.abs(next - t) ? lo - 1 : lo;
}

const WORKSPACE_BOOT_SNAPSHOT_CACHE_VERSION = "v5";
const WORKSPACE_BOOT_SNAPSHOT_CACHE_TTL_MS = 90 * 1000;
const WORKSPACE_BOOT_SNAPSHOT_MAX_CANDLES = 3000;
const WORKSPACE_BOOT_TF_MAP = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600 };

function workspaceBootSnapshotStorageKey(key) {
  return `market-history:${WORKSPACE_BOOT_SNAPSHOT_CACHE_VERSION}:${String(key || "")}`;
}

function workspaceBootNormalizeEpochSeconds(t) {
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  if (n >= 1e12) return Math.floor(n / 1000);
  return Math.floor(n);
}

function workspaceBootSanitizeCandles(data) {
  const arr = Array.isArray(data) ? data : [];
  const normalized = arr
    .filter(Boolean)
    .map((c) => ({
      time: workspaceBootNormalizeEpochSeconds(c?.time ?? c?.t),
      open: Number(c?.open ?? c?.o),
      high: Number(c?.high ?? c?.h),
      low: Number(c?.low ?? c?.l),
      close: Number(c?.close ?? c?.c),
      volume: Number(c?.volume ?? c?.v) || 0,
    }))
    .filter((c) => Number.isFinite(c.time) && [c.open, c.high, c.low, c.close].every(Number.isFinite))
    .sort((a, b) => a.time - b.time);

  const out = [];
  for (const c of normalized) {
    const last = out[out.length - 1];
    if (!last || last.time !== c.time) out.push(c);
    else out[out.length - 1] = c;
  }

  return out.slice(-WORKSPACE_BOOT_SNAPSHOT_MAX_CANDLES);
}

function workspaceBootSanitizeCandleLike(data) {
  if (!data) return null;
  const c = data?.candle || data;
  const time = workspaceBootNormalizeEpochSeconds(c?.time ?? c?.t);
  const open = Number(c?.open ?? c?.o);
  const high = Number(c?.high ?? c?.h);
  const low = Number(c?.low ?? c?.l);
  const close = Number(c?.close ?? c?.c);
  const volume = Number(c?.volume ?? c?.v) || 0;
  if (!Number.isFinite(time) || ![open, high, low, close].every(Number.isFinite)) return null;
  return { time, open, high, low, close, volume };
}

function workspaceBootBucketTime(t, timeframeSec) {
  const sec = workspaceBootNormalizeEpochSeconds(t);
  const tf = Number(timeframeSec) || 60;
  if (!Number.isFinite(sec) || !Number.isFinite(tf) || tf <= 0) return null;
  return Math.floor(sec / tf) * tf;
}

function readWorkspaceBootSnapshot(key) {
  if (typeof localStorage === "undefined" || !key) return null;
  try {
    const raw = localStorage.getItem(workspaceBootSnapshotStorageKey(key));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const ts = Number(parsed?.ts || 0);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    if (Date.now() - ts > WORKSPACE_BOOT_SNAPSHOT_CACHE_TTL_MS) return null;

    const candles = workspaceBootSanitizeCandles(parsed?.candles);
    const tf = String(parsed?.timeframe || key.split("|")[1] || "M1").toUpperCase().trim();
    const timeframeSec = Number(parsed?.timeframeSec) || WORKSPACE_BOOT_TF_MAP[tf] || 60;
    const nowBucket = workspaceBootBucketTime(Math.floor(Date.now() / 1000), timeframeSec);

    let liveCandle = workspaceBootSanitizeCandleLike(parsed?.liveCandle);
    if (liveCandle) {
      const liveBucket = workspaceBootBucketTime(liveCandle.time, timeframeSec);
      if (nowBucket != null && liveBucket != null && liveBucket !== nowBucket) {
        liveCandle = null;
      }
    }

    if (!candles.length || !liveCandle) return null;
    return { candles, liveCandle, timeframe: tf, timeframeSec, ts };
  } catch {
    return null;
  }
}

function getRightScaleWidthFromChart(chart, fallback = 72) {
  let w = Number(fallback);
  if (!Number.isFinite(w) || w <= 0) w = 72;

  try {
    const width = Number(chart?.priceScale?.("right")?.width?.());
    if (Number.isFinite(width) && width > 0) return width;
  } catch {}

  try {
    const minWidth = Number(chart?.priceScale?.("right")?.options?.()?.minimumWidth);
    if (Number.isFinite(minWidth) && minWidth > 0) return minWidth;
  } catch {}

  return w;
}

const DEFAULT_PANE_HEIGHTS = {
  [PANE_TYPES.RSI]: 95,
  [PANE_TYPES.STOCH]: 95,
  [PANE_TYPES.MACD]: 95,
  [PANE_TYPES.VOLUME]: 80,

  [PANE_TYPES.ATR]: 85,
  [PANE_TYPES.ADX]: 95,
  [PANE_TYPES.CCI]: 85,
  [PANE_TYPES.WILLIAMSR]: 85,
  [PANE_TYPES.MOMENTUM]: 85,
  [PANE_TYPES.ROC]: 85,
};

const TIME_FOOTER_HEIGHT = 28;
const TIME_FOOTER_SEPARATOR = 1;

const VIEWPORT_PRESET = {
  RIGHT_OFFSET: 15,
  BAR_SPACING: 10.5,
};

const VIEWPORT_LIMITS = {
  MIN_LEFT_FROM: -8.0,
  MAX_VISIBLE_BARS: 260,
};

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function inferPrecisionFromMinMove(minMove) {
  const mm = Number(minMove);
  if (!Number.isFinite(mm) || mm <= 0) return 2;
  const s = mm.toString();
  const idx = s.indexOf(".");
  if (idx === -1) return 0;
  return clamp(s.length - idx - 1, 0, 10);
}

function getSeriesPrecision(series) {
  try {
    const opt = series?.options?.();
    const pf = opt?.priceFormat;
    if (pf && typeof pf.precision === "number" && Number.isFinite(pf.precision)) return clamp(pf.precision, 0, 10);
    if (pf && typeof pf.minMove === "number" && Number.isFinite(pf.minMove)) return inferPrecisionFromMinMove(pf.minMove);
    if (typeof opt?.minMove === "number" && Number.isFinite(opt.minMove)) return inferPrecisionFromMinMove(opt.minMove);
  } catch {}
  return 2;
}

function formatPriceForSeries(price, series) {
  const p = Number(price);
  if (!Number.isFinite(p)) return "";
  const prec = getSeriesPrecision(series);
  return p.toFixed(prec);
}

function getCrosshairViewportState() {
  if (typeof window === "undefined") {
    return {
      width: 1440,
      height: 900,
      isPortrait: false,
      isLandscape: true,
      isMobile: false,
      showDomCrosshair: true,
    };
  }

  const width = Math.max(
    0,
    window.innerWidth ||
      document.documentElement?.clientWidth ||
      document.body?.clientWidth ||
      0
  );

  const height = Math.max(
    0,
    window.innerHeight ||
      document.documentElement?.clientHeight ||
      document.body?.clientHeight ||
      0
  );

  const isPortrait = height >= width;
  const isLandscape = !isPortrait;
  const isMobile = width <= 767;

  return {
    width,
    height,
    isPortrait,
    isLandscape,
    isMobile,
    showDomCrosshair: !isMobile,
  };
}

function useChartMonths() {
  const { t } = useTranslation("chartWorkspace");

  return useMemo(
    () => ({
      get: (index) => {
        const keys = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
        const key = keys[clamp(index, 0, 11)];
        return t(`chartWorkspace:months.${key}`) || keys[index];
      },
    }),
    [t]
  );
}

function formatTimeLabel(timeValue, getMonth) {
  const t = timeValue;
  if (t == null) return "";

  if (typeof t === "object" && t && "year" in t && "month" in t && "day" in t) {
    const yy = String(t.year).slice(-2);
    const m = getMonth(clamp(Number(t.month) - 1, 0, 11));
    const dd = String(t.day).padStart(2, "0");
    return `${dd} ${m} ${yy}`;
  }

  const ts = Number(t);
  if (!Number.isFinite(ts)) return "";

  const d = new Date(ts * 1000);

  const dd = String(d.getDate()).padStart(2, "0");
  const m = getMonth(d.getMonth());
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  return `${dd} ${m} ${yy}  ${hh}:${mm}`;
}

function WorkspacePanes({
  runtimeChartKey,
  symbol,
  activeDrawingTool,
  setActiveDrawingTool,
  drawingsApiRef,
  onDrawingsChange,
  onDrawingsCommit,
  onDrawingsOverlayReady,
}) {
  const { get: getMonth } = useChartMonths();

  const engine = useCandleEngine();
  const { instances: indicatorInstances } = useIndicators();
  const { panes, upsertPane, removePane, resizePaneWithConstraints } = usePaneManager();

  const [masterChartState, setMasterChartState] = useState(null);
  const [showScrollToRealtime, setShowScrollToRealtime] = useState(false);

  const [crosshairViewport, setCrosshairViewport] = useState(() => getCrosshairViewportState());

  const pairCandlesCount = useMarketStore((state) => {
    const candles = state.pairs?.[runtimeChartKey]?.candles;
    return Array.isArray(candles) ? candles.length : 0;
  });
  const pairHasLive = useMarketStore((state) => !!state.pairs?.[runtimeChartKey]?.liveCandle);
  const pairOldestTime = useMarketStore((state) => Number(state.pairs?.[runtimeChartKey]?.candles?.[0]?.time || 0) || 0);
  const pairLoadMorePending = useMarketStore((state) => !!state.pairs?.[runtimeChartKey]?._historyLoadMorePending);
  const pairHasMoreHistory = useMarketStore((state) => state.pairs?.[runtimeChartKey]?.hasMoreHistory !== false);
  const activeTimeframe = useMemo(() => normalizeTf(String(runtimeChartKey || "").split("|")[1] || "M1"), [runtimeChartKey]);

  const hasBootSnapshot = useMemo(() => !!readWorkspaceBootSnapshot(runtimeChartKey), [runtimeChartKey]);
  const hasUsableChartData = pairCandlesCount > 0 || pairHasLive || hasBootSnapshot;
  const showDomCrosshair = !!crosshairViewport.showDomCrosshair && hasUsableChartData;

  const masterChart = masterChartState?.chart || null;
  const masterContainer = masterChartState?.container || null;
  const getMasterSeries = masterChartState?.getSeries || null;

  const layoutRef = useRef(null);
  const [layoutHeight, setLayoutHeight] = useState(0);

  const viewportBrokerRef = useRef(null);
  const masterChartRef = useRef(null);
  const requestMoreHistory = useMarketStore((state) => state.loadMoreHistory);
  const prependGuardRef = useRef({ key: "", baseCount: 0, range: null, oldestTime: 0, requestedAt: 0, active: false });

  const paneApiRef = useRef(new Map());
  const paneUnsubRef = useRef(new Map());

  const detachPaneFromBroker = useCallback((key) => {
    if (!key) return;
    const unsub = paneUnsubRef.current.get(key);
    if (typeof unsub === "function") {
      try {
        unsub();
      } catch {}
    }
    paneUnsubRef.current.delete(key);
  }, []);

  const attachPaneToBroker = useCallback(
    (key, api) => {
      if (!key || !api) return;

      const broker = viewportBrokerRef.current;
      if (!broker || typeof broker.addSlave !== "function") return;

      const slaveChart = api?.chart;
      if (!slaveChart) return;

      detachPaneFromBroker(key);

      try {
        const unsub = broker.addSlave(slaveChart, { id: key });
        if (typeof unsub === "function") paneUnsubRef.current.set(key, unsub);
      } catch {}
    },
    [detachPaneFromBroker]
  );

  useEffect(() => {
    let raf = 0;

    const updateViewport = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        setCrosshairViewport(getCrosshairViewportState());
      });
    };

    updateViewport();

    window.addEventListener("resize", updateViewport, { passive: true });
    window.addEventListener("orientationchange", updateViewport, { passive: true });

    const vv = window.visualViewport;
    if (vv?.addEventListener) {
      vv.addEventListener("resize", updateViewport, { passive: true });
      vv.addEventListener("scroll", updateViewport, { passive: true });
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);

      if (vv?.removeEventListener) {
        vv.removeEventListener("resize", updateViewport);
        vv.removeEventListener("scroll", updateViewport);
      }
    };
  }, []);

  useEffect(() => {
    const nextMaster = masterChart || null;
    const prevMaster = masterChartRef.current || null;

    if (prevMaster === nextMaster) return;

    if (prevMaster) {
      try {
        disposeViewportBroker(prevMaster);
      } catch {}
    }

    masterChartRef.current = nextMaster;

    for (const [k] of paneUnsubRef.current.entries()) {
      detachPaneFromBroker(k);
    }

    if (nextMaster) {
      try {
        viewportBrokerRef.current = ensureViewportBroker(nextMaster);
      } catch {
        viewportBrokerRef.current = null;
      }
    } else {
      viewportBrokerRef.current = null;
    }

    if (viewportBrokerRef.current) {
      for (const [k, api] of paneApiRef.current.entries()) {
        attachPaneToBroker(k, api);
      }
      try {
        viewportBrokerRef.current.forceSync?.("masterChanged");
      } catch {}
    }
  }, [masterChart, attachPaneToBroker, detachPaneFromBroker]);

  useEffect(() => {
    const el = masterContainer;
    if (!el?.addEventListener) return;

    const state = {
      active: false,
      raf: 0,
      wheelTimer: 0,
      winUp: null,
    };

    const getBroker = () => viewportBrokerRef.current;

    const syncNow = (why) => {
      const b = getBroker();
      if (!b) return;
      try {
        if (typeof b.forceSyncNow === "function") b.forceSyncNow(why);
        else b.forceSync?.(why);
      } catch {}
    };

    const start = (why) => {
      const b = getBroker();
      try {
        b?.setInteractionActive?.(true);
      } catch {}

      if (state.active) return;
      state.active = true;

      syncNow(`${why || "interaction"}:start`);

      const tick = () => {
        if (!state.active) return;
        syncNow("interaction");
        state.raf = requestAnimationFrame(tick);
      };

      state.raf = requestAnimationFrame(tick);
    };

    const stop = (why) => {
      if (state.wheelTimer) {
        try {
          clearTimeout(state.wheelTimer);
        } catch {}
        state.wheelTimer = 0;
      }

      if (state.raf) {
        try {
          cancelAnimationFrame(state.raf);
        } catch {}
        state.raf = 0;
      }

      state.active = false;

      const b = getBroker();
      try {
        b?.setInteractionActive?.(false);
      } catch {}

      syncNow(`${why || "interaction"}:end`);
    };

    const onWheel = () => {
      start("wheel");
      if (state.wheelTimer) {
        try {
          clearTimeout(state.wheelTimer);
        } catch {}
      }
      state.wheelTimer = window.setTimeout(() => stop("wheelIdle"), 220);
    };

    const onPointerDown = (e) => {
      if (e && typeof e.button === "number" && e.button !== 0) return;

      start("pointer");

      if (state.winUp) return;

      const onUp = () => {
        try {
          window.removeEventListener("pointerup", onUp, true);
          window.removeEventListener("pointercancel", onUp, true);
          window.removeEventListener("blur", onUp, true);
        } catch {}
        state.winUp = null;
        stop("pointerUp");
      };

      state.winUp = onUp;

      try {
        window.addEventListener("pointerup", onUp, true);
        window.addEventListener("pointercancel", onUp, true);
        window.addEventListener("blur", onUp, true);
      } catch {}
    };

    el.addEventListener("pointerdown", onPointerDown, true);
    el.addEventListener("wheel", onWheel, { capture: true, passive: true });

    return () => {
      try {
        el.removeEventListener("pointerdown", onPointerDown, true);
      } catch {}
      try {
        el.removeEventListener("wheel", onWheel, true);
      } catch {}

      if (state.winUp) {
        try {
          window.removeEventListener("pointerup", state.winUp, true);
          window.removeEventListener("pointercancel", state.winUp, true);
          window.removeEventListener("blur", state.winUp, true);
        } catch {}
        state.winUp = null;
      }

      stop("cleanup");
    };
  }, [masterContainer]);

  useEffect(() => {
    return () => {
      for (const [k] of paneUnsubRef.current.entries()) {
        detachPaneFromBroker(k);
      }

      const m = masterChartRef.current;
      if (m) {
        try {
          disposeViewportBroker(m);
        } catch {}
      }

      viewportBrokerRef.current = null;
      masterChartRef.current = null;

      paneApiRef.current.clear();
      paneUnsubRef.current.clear();
    };
  }, [detachPaneFromBroker]);

  const setPaneApi = useCallback(
    (key, api) => {
      if (!key) return;

      if (!api) {
        paneApiRef.current.delete(key);
        detachPaneFromBroker(key);
        return;
      }

      paneApiRef.current.set(key, api);
      attachPaneToBroker(key, api);

      try {
        viewportBrokerRef.current?.forceSync?.("paneReady");
      } catch {}
    },
    [attachPaneToBroker, detachPaneFromBroker]
  );

  useEffect(() => {
    const el = layoutRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const cr = entries?.[0]?.contentRect;
      if (!cr) return;
      setLayoutHeight(Math.max(0, Math.floor(cr.height)));
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const requiredPanes = useMemo(() => {
    const list = Array.isArray(indicatorInstances) ? indicatorInstances : [];
    const visible = list.filter((i) => i && i.visible);

    const needed = new Set();
    for (const inst of visible) {
      const key = paneKeyFromInstance(inst);
      if (key) needed.add(key);
    }
    return needed;
  }, [indicatorInstances]);

  useEffect(() => {
    if (requiredPanes.has(PANE_TYPES.RSI)) upsertPane(PANE_TYPES.RSI, { height: DEFAULT_PANE_HEIGHTS[PANE_TYPES.RSI], minHeight: 56, maxHeight: 320 });
    else removePane(PANE_TYPES.RSI);

    if (requiredPanes.has(PANE_TYPES.STOCH)) upsertPane(PANE_TYPES.STOCH, { height: DEFAULT_PANE_HEIGHTS[PANE_TYPES.STOCH], minHeight: 56, maxHeight: 320 });
    else removePane(PANE_TYPES.STOCH);

    if (requiredPanes.has(PANE_TYPES.MACD)) upsertPane(PANE_TYPES.MACD, { height: DEFAULT_PANE_HEIGHTS[PANE_TYPES.MACD], minHeight: 56, maxHeight: 360 });
    else removePane(PANE_TYPES.MACD);

    if (requiredPanes.has(PANE_TYPES.VOLUME)) upsertPane(PANE_TYPES.VOLUME, { height: DEFAULT_PANE_HEIGHTS[PANE_TYPES.VOLUME], minHeight: 48, maxHeight: 280 });
    else removePane(PANE_TYPES.VOLUME);

    if (requiredPanes.has(PANE_TYPES.ATR)) upsertPane(PANE_TYPES.ATR, { height: DEFAULT_PANE_HEIGHTS[PANE_TYPES.ATR], minHeight: 56, maxHeight: 280 });
    else removePane(PANE_TYPES.ATR);

    if (requiredPanes.has(PANE_TYPES.ADX)) upsertPane(PANE_TYPES.ADX, { height: DEFAULT_PANE_HEIGHTS[PANE_TYPES.ADX], minHeight: 56, maxHeight: 320 });
    else removePane(PANE_TYPES.ADX);

    if (requiredPanes.has(PANE_TYPES.CCI)) upsertPane(PANE_TYPES.CCI, { height: DEFAULT_PANE_HEIGHTS[PANE_TYPES.CCI], minHeight: 56, maxHeight: 280 });
    else removePane(PANE_TYPES.CCI);

    if (requiredPanes.has(PANE_TYPES.WILLIAMSR)) upsertPane(PANE_TYPES.WILLIAMSR, { height: DEFAULT_PANE_HEIGHTS[PANE_TYPES.WILLIAMSR], minHeight: 56, maxHeight: 280 });
    else removePane(PANE_TYPES.WILLIAMSR);

    if (requiredPanes.has(PANE_TYPES.MOMENTUM)) upsertPane(PANE_TYPES.MOMENTUM, { height: DEFAULT_PANE_HEIGHTS[PANE_TYPES.MOMENTUM], minHeight: 56, maxHeight: 280 });
    else removePane(PANE_TYPES.MOMENTUM);

    if (requiredPanes.has(PANE_TYPES.ROC)) upsertPane(PANE_TYPES.ROC, { height: DEFAULT_PANE_HEIGHTS[PANE_TYPES.ROC], minHeight: 56, maxHeight: 280 });
    else removePane(PANE_TYPES.ROC);
  }, [requiredPanes, upsertPane, removePane]);

  const visiblePanes = useMemo(() => {
    return (Array.isArray(panes) ? panes : []).filter((p) => p && p.isVisible);
  }, [panes]);

  const mainHeightRef = useMemo(() => {
    const panesTotal = visiblePanes.reduce((acc, p) => acc + (Number(p.height) || 0), 0);
    const footerTotal = TIME_FOOTER_HEIGHT + TIME_FOOTER_SEPARATOR;
    const estimate = layoutHeight - panesTotal - footerTotal;
    return Math.max(0, estimate);
  }, [layoutHeight, visiblePanes]);

  const timeMapRef = useRef({
    times: [],
    baseTime: NaN,
    lastTime: NaN,
    step: 60,
    ready: false,
  });

  useEffect(() => {
    let unsub = null;
    try {
      unsub = engine?.subscribeCandles?.((candles, liveCandle) => {
        const closed = Array.isArray(candles) ? candles : [];
        if (!closed.length && !liveCandle) return;

        const arr = [...closed];
        try {
          const lt = Number(liveCandle?.time);
          if (Number.isFinite(lt)) {
            const lastClosedT = Number(arr[arr.length - 1]?.time);
            if (!Number.isFinite(lastClosedT) || lastClosedT !== lt) {
              arr.push(liveCandle);
            }
          }
        } catch {}

        const times = arr.map((c) => Number(c?.time)).filter((t) => Number.isFinite(t));
        if (!times.length) return;

        const baseTime = Number(times[0]);
        const lastTime = Number(times[times.length - 1]);
        if (!Number.isFinite(baseTime) || !Number.isFinite(lastTime)) return;

        let step = 60;
        if (times.length >= 2) {
          const t1 = Number(times[times.length - 2]);
          const t2 = Number(times[times.length - 1]);
          const d = t2 - t1;
          if (Number.isFinite(d) && d > 0) step = d;
        }

        timeMapRef.current = { times, baseTime, lastTime, step, ready: true };
      });
    } catch {
      unsub = null;
    }

    return () => {
      try {
        unsub?.();
      } catch {}
    };
  }, [engine]);

  const logicalToMappedTime = useCallback((logicalValue) => {
    const map = timeMapRef.current;
    if (!map?.ready) return null;

    const idx = Math.round(Number(logicalValue));
    if (!Number.isFinite(idx)) return null;

    const times = Array.isArray(map.times) ? map.times : [];
    const len = times.length;
    if (!len) return null;

    if (idx >= 0 && idx < len) {
      const t = Number(times[idx]);
      return Number.isFinite(t) ? t : null;
    }

    const step = Number(map.step);
    if (!Number.isFinite(step) || step <= 0) return null;

    if (idx >= len) {
      const last = Number(times[len - 1] ?? map.lastTime);
      if (!Number.isFinite(last)) return null;
      const deltaBars = idx - (len - 1);
      return last + deltaBars * step;
    }

    const first = Number(times[0] ?? map.baseTime);
    if (!Number.isFinite(first)) return null;
    return first + idx * step;
  }, []);

  const mappedTimeToLogical = useCallback((mappedTime) => {
    const map = timeMapRef.current;
    if (!map?.ready) return null;

    const t = Number(mappedTime);
    const times = Array.isArray(map.times) ? map.times : [];
    const len = times.length;
    const step = Number(map.step);

    if (!Number.isFinite(t) || !len || !Number.isFinite(step) || step <= 0) return null;

    const first = Number(times[0] ?? map.baseTime);
    const last = Number(times[len - 1] ?? map.lastTime);
    if (!Number.isFinite(first) || !Number.isFinite(last)) return null;

    if (t <= first) {
      const deltaBars = Math.round((t - first) / step);
      return Number.isFinite(deltaBars) ? deltaBars : null;
    }

    if (t >= last) {
      const deltaBars = Math.round((t - last) / step);
      const out = (len - 1) + deltaBars;
      return Number.isFinite(out) ? out : null;
    }

    const nearestIdx = findNearestTimeIndex(times, t);
    if (nearestIdx == null) return null;

    const nearestTime = Number(times[nearestIdx]);
    if (!Number.isFinite(nearestTime)) return null;

    if (nearestTime === t) return nearestIdx;

    const diffBars = Math.round((t - nearestTime) / step);
    const out = nearestIdx + diffBars;
    return Number.isFinite(out) ? out : nearestIdx;
  }, []);

  const syncScrollToRealtimeVisibility = useCallback(() => {
    const chart = masterChart;
    const ts = chart?.timeScale?.();
    const range = ts?.getVisibleLogicalRange?.();

    const times = timeMapRef.current?.times;
    const len = Array.isArray(times) ? times.length : 0;

    if (!range || len <= 0) {
      setShowScrollToRealtime(false);
      return;
    }

    const rangeTo = Number(range?.to);
    if (!Number.isFinite(rangeTo)) {
      setShowScrollToRealtime(false);
      return;
    }

    const lastLogical = len - 1;
    const liveBarStillVisible = rangeTo >= lastLogical - 0.15;

    setShowScrollToRealtime(!liveBarStillVisible);
  }, [masterChart]);

  const keyboardPanAnimationRef = useRef({
    raf: 0,
    interactionActive: false,
  });

  const realtimeResetRef = useRef({
    raf: 0,
    verifyRaf: 0,
    token: 0,
  });

  const stopKeyboardPanAnimation = useCallback(() => {
    const state = keyboardPanAnimationRef.current;

    if (state.raf) {
      try {
        cancelAnimationFrame(state.raf);
      } catch {}
      state.raf = 0;
    }

    if (state.interactionActive) {
      try {
        viewportBrokerRef.current?.setInteractionActive?.(false);
      } catch {}
      state.interactionActive = false;
    }
  }, []);

  const stopRealtimeResetAnimation = useCallback(() => {
    const state = realtimeResetRef.current;

    if (state.raf) {
      try {
        cancelAnimationFrame(state.raf);
      } catch {}
      state.raf = 0;
    }

    if (state.verifyRaf) {
      try {
        cancelAnimationFrame(state.verifyRaf);
      } catch {}
      state.verifyRaf = 0;
    }

    state.token += 1;
  }, []);

  const scrollToRealtime = useCallback(() => {
    stopKeyboardPanAnimation();
    stopRealtimeResetAnimation();

    const chart = masterChart;
    const ts = chart?.timeScale?.();
    if (!chart || !ts) return;

    const resetState = realtimeResetRef.current;
    const token = resetState.token;

    const getSafeVisibleRange = () => {
      try {
        const range = ts.getVisibleLogicalRange?.();
        if (!range) return null;

        const from = Number(range.from);
        const to = Number(range.to);
        if (!Number.isFinite(from) || !Number.isFinite(to)) return null;

        return { from, to };
      } catch {
        return null;
      }
    };

    const getBaseIndex = () => {
      let bi = NaN;

      try {
        bi = Number(ts.getBaseIndex?.());
      } catch {}

      const times = timeMapRef.current?.times;
      const lastLogical = Array.isArray(times) && times.length ? times.length - 1 : NaN;

      if (Number.isFinite(lastLogical)) {
        if (!Number.isFinite(bi) || lastLogical > bi) bi = lastLogical;
      }

      return Number.isFinite(bi) ? bi : NaN;
    };

    const getTargetRange = (widthOverride = NaN) => {
      const current = getSafeVisibleRange();
      const currentWidth = current ? Number(current.to) - Number(current.from) : NaN;
      const widthBars = Number.isFinite(widthOverride) && widthOverride > 0.5
        ? widthOverride
        : (Number.isFinite(currentWidth) && currentWidth > 0.5 ? currentWidth : 120);

      const baseIndex = getBaseIndex();
      if (!Number.isFinite(baseIndex)) return null;

      const targetTo = Number(baseIndex) + Number(VIEWPORT_PRESET.RIGHT_OFFSET);
      const targetFrom = targetTo - widthBars;

      if (!Number.isFinite(targetFrom) || !Number.isFinite(targetTo)) return null;

      return { from: targetFrom, to: targetTo, widthBars };
    };

    const applyPreset = () => {
      try {
        ts.applyOptions?.({
          rightOffset: VIEWPORT_PRESET.RIGHT_OFFSET,
          barSpacing: VIEWPORT_PRESET.BAR_SPACING,
        });
      } catch {}
    };

    const forceSync = (reason) => {
      try {
        viewportBrokerRef.current?.setInteractionActive?.(false);
      } catch {}

      try {
        viewportBrokerRef.current?.forceSyncNow?.(reason);
      } catch {
        try {
          viewportBrokerRef.current?.forceSync?.(reason);
        } catch {}
      }
    };

    applyPreset();
    forceSync("scrollToRealtime:start");

    const startRange = getSafeVisibleRange();
    const startWidth = startRange ? Number(startRange.to) - Number(startRange.from) : NaN;
    const initialTarget = getTargetRange(startWidth);
    if (!startRange || !initialTarget) {
      syncScrollToRealtimeVisibility();
      return;
    }

    const animateDuration = 150;
    const startedAt = typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const setExactTarget = (reason, widthHint = NaN) => {
      const target = getTargetRange(widthHint);
      if (!target) return null;

      applyPreset();

      try {
        ts.setVisibleLogicalRange?.({ from: target.from, to: target.to });
      } catch {}

      forceSync(reason);
      return target;
    };

    const verifyAndLock = (attempt = 0, widthHint = initialTarget.widthBars, stableHits = 0) => {
      if (realtimeResetRef.current.token !== token) return;

      const current = getSafeVisibleRange();
      const target = getTargetRange(widthHint);
      if (!current || !target) {
        syncScrollToRealtimeVisibility();
        return;
      }

      const deltaTo = Math.abs(Number(current.to) - Number(target.to));
      const deltaFrom = Math.abs(Number(current.from) - Number(target.from));
      const nearTarget = deltaTo <= 0.12 && deltaFrom <= 0.12;

      if (!nearTarget) {
        setExactTarget("scrollToRealtime:verify", target.widthBars);
      }

      const nextStableHits = nearTarget ? (stableHits + 1) : 0;
      if (attempt >= 14 || nextStableHits >= 2) {
        setExactTarget("scrollToRealtime:final", target.widthBars);
        syncScrollToRealtimeVisibility();
        return;
      }

      realtimeResetRef.current.verifyRaf = requestAnimationFrame(() => {
        verifyAndLock(attempt + 1, target.widthBars, nextStableHits);
      });
    };

    const tick = (nowArg) => {
      if (realtimeResetRef.current.token !== token) return;

      const now = typeof nowArg === "number"
        ? nowArg
        : (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());

      const progress = Math.min(1, Math.max(0, (now - startedAt) / animateDuration));
      const eased = easeOutCubic(progress);
      const liveTarget = getTargetRange(initialTarget.widthBars) || initialTarget;

      const frameRange = {
        from: Number(startRange.from) + ((Number(liveTarget.from) - Number(startRange.from)) * eased),
        to: Number(startRange.to) + ((Number(liveTarget.to) - Number(startRange.to)) * eased),
      };

      applyPreset();

      try {
        ts.setVisibleLogicalRange?.(frameRange);
      } catch {}

      forceSync("scrollToRealtime:anim");

      if (progress < 1) {
        realtimeResetRef.current.raf = requestAnimationFrame(tick);
        return;
      }

      realtimeResetRef.current.raf = 0;
      setExactTarget("scrollToRealtime:end", liveTarget.widthBars);
      verifyAndLock(0, liveTarget.widthBars, 0);
    };

    resetState.raf = requestAnimationFrame(tick);
  }, [masterChart, stopKeyboardPanAnimation, stopRealtimeResetAnimation, syncScrollToRealtimeVisibility]);

  useEffect(() => {
    const guard = prependGuardRef.current;
    if (!guard.active) return;
    if (guard.key !== runtimeChartKey) {
      prependGuardRef.current = { key: runtimeChartKey, baseCount: 0, range: null, oldestTime: 0, requestedAt: 0, active: false };
      return;
    }

    if (pairCandlesCount > guard.baseCount && pairOldestTime > 0 && guard.oldestTime > 0 && pairOldestTime < guard.oldestTime) {
      const delta = pairCandlesCount - guard.baseCount;
      const ts = masterChart?.timeScale?.();
      const range = guard.range;
      if (ts && range && delta > 0) {
        try {
          ts.setVisibleLogicalRange?.({
            from: Number(range.from) + delta,
            to: Number(range.to) + delta,
          });
        } catch {}
      }
      prependGuardRef.current = { key: runtimeChartKey, baseCount: 0, range: null, oldestTime: 0, requestedAt: 0, active: false };
      return;
    }

    if (!pairLoadMorePending && Date.now() - Number(guard.requestedAt || 0) > 300) {
      prependGuardRef.current = { key: runtimeChartKey, baseCount: 0, range: null, oldestTime: 0, requestedAt: 0, active: false };
    }
  }, [masterChart, pairCandlesCount, pairLoadMorePending, pairOldestTime, runtimeChartKey]);

  useEffect(() => {
    const chart = masterChart;
    const ts = chart?.timeScale?.();
    if (!ts || typeof ts.subscribeVisibleLogicalRangeChange !== "function") return;

    let clamping = false;
    const onRangeChange = (rangeArg) => {
      if (!ts) return;
      const range = rangeArg || ts.getVisibleLogicalRange?.();
      const from = Number(range?.from);
      const to = Number(range?.to);

      if (!clamping && range) {
        let nextRange = null;

        const LEFT_CLAMP_EPS = 1.1;
        if (Number.isFinite(from) && from < (VIEWPORT_LIMITS.MIN_LEFT_FROM - LEFT_CLAMP_EPS)) {
          const shift = VIEWPORT_LIMITS.MIN_LEFT_FROM - from;
          nextRange = { from: from + shift, to: to + shift };
        }

        // Clamp mais suave: deixamos uma pequena folga negativa antes de corrigir.
        // Isso evita que o wheel zoom “brigue” com o limitador e jogue o gráfico para os lados.

        if (nextRange) {
          clamping = true;
          try { ts.setVisibleLogicalRange?.(nextRange); } catch {}
          requestAnimationFrame(() => { clamping = false; });
        }
      }

      syncScrollToRealtimeVisibility();

      const NEAR_LEFT_TRIGGER = 35;
      if (
        Number.isFinite(from) &&
        from <= NEAR_LEFT_TRIGGER &&
        pairOldestTime > 0 &&
        pairHasMoreHistory &&
        !pairLoadMorePending
      ) {
        prependGuardRef.current = {
          key: runtimeChartKey,
          baseCount: pairCandlesCount,
          range: Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null,
          oldestTime: pairOldestTime,
          requestedAt: Date.now(),
          active: true,
        };

        try {
          requestMoreHistory?.(symbol, activeTimeframe, pairOldestTime);
        } catch {}
      }
    };

    try {
      ts.subscribeVisibleLogicalRangeChange(onRangeChange);
    } catch {}

    syncScrollToRealtimeVisibility();

    return () => {
      try {
        ts.unsubscribeVisibleLogicalRangeChange?.(onRangeChange);
      } catch {}
    };
  }, [activeTimeframe, masterChart, pairCandlesCount, pairHasMoreHistory, pairLoadMorePending, pairOldestTime, requestMoreHistory, runtimeChartKey, symbol, syncScrollToRealtimeVisibility]);

  useEffect(() => {
    prependGuardRef.current = { key: runtimeChartKey, baseCount: 0, range: null, oldestTime: 0, requestedAt: 0, active: false };
    syncScrollToRealtimeVisibility();
  }, [runtimeChartKey, visiblePanes.length, syncScrollToRealtimeVisibility]);

  const isTypingTarget = useCallback((target) => {
    if (!target || typeof Element === "undefined" || !(target instanceof Element)) return false;
    if (target.isContentEditable) return true;

    const editableHost = target.closest?.(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]'
    );

    return Boolean(editableHost);
  }, []);

  const getCurrentRightOffset = useCallback((timeScaleApi) => {
    let ro = NaN;

    if (timeScaleApi?.rightOffset) {
      try {
        ro = Number(timeScaleApi.rightOffset());
      } catch {}
    }

    if (!Number.isFinite(ro)) {
      try {
        const opts = timeScaleApi?.options?.() || {};
        const optRo = Number(opts.rightOffset);
        if (Number.isFinite(optRo)) ro = optRo;
      } catch {}
    }

    return Number.isFinite(ro) ? ro : VIEWPORT_PRESET.RIGHT_OFFSET;
  }, []);

  const buildShiftedLogicalRange = useCallback(
    (timeScaleApi, baseRange, deltaBars) => {
      const delta = Number(deltaBars);
      if (!timeScaleApi || !baseRange || !Number.isFinite(delta) || delta === 0) return null;

      const nextRange = {
        from: Number(baseRange.from) + delta,
        to: Number(baseRange.to) + delta,
      };

      if (!Number.isFinite(nextRange.from) || !Number.isFinite(nextRange.to)) return null;

      const times = timeMapRef.current?.times;
      const totalBars = Array.isArray(times) ? times.length : 0;

      if (totalBars > 0) {
        const maxVisibleTo = (totalBars - 1) + getCurrentRightOffset(timeScaleApi);
        if (Number.isFinite(maxVisibleTo) && nextRange.to > maxVisibleTo) {
          const overshoot = nextRange.to - maxVisibleTo;
          nextRange.from -= overshoot;
          nextRange.to = maxVisibleTo;
        }
      }

      return nextRange;
    },
    [getCurrentRightOffset]
  );

  const syncViewportAfterKeyboardMove = useCallback((reason) => {
    try {
      viewportBrokerRef.current?.forceSyncNow?.(reason);
    } catch {
      try {
        viewportBrokerRef.current?.forceSync?.(reason);
      } catch {}
    }

    syncScrollToRealtimeVisibility();
  }, [syncScrollToRealtimeVisibility]);

  const moveViewportByBars = useCallback(
    (deltaBars, options = {}) => {
      const chart = masterChart;
      const ts = chart?.timeScale?.();
      const range = ts?.getVisibleLogicalRange?.();
      const delta = Number(deltaBars);
      const animated = options?.animated === true;
      const duration = Number(options?.durationMs);
      const animationDuration = Number.isFinite(duration) && duration > 0 ? duration : 260;

      if (!chart || !ts || !range || !Number.isFinite(delta) || delta === 0) return;

      const nextRange = buildShiftedLogicalRange(ts, range, delta);
      if (!nextRange) return;

      if (!animated) {
        stopKeyboardPanAnimation();

        try {
          ts.setVisibleLogicalRange?.(nextRange);
        } catch {
          return;
        }

        syncViewportAfterKeyboardMove("keyboardArrowNavigation");
        return;
      }

      const startRange = {
        from: Number(range.from),
        to: Number(range.to),
      };

      if (
        !Number.isFinite(startRange.from) ||
        !Number.isFinite(startRange.to) ||
        (Math.abs(nextRange.from - startRange.from) < 0.0001 && Math.abs(nextRange.to - startRange.to) < 0.0001)
      ) {
        return;
      }

      stopKeyboardPanAnimation();

      const state = keyboardPanAnimationRef.current;
      const startedAt = typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();

      const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

      try {
        viewportBrokerRef.current?.setInteractionActive?.(true);
        state.interactionActive = true;
      } catch {
        state.interactionActive = false;
      }

      const tick = (nowArg) => {
        const now = typeof nowArg === "number"
          ? nowArg
          : (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());

        const elapsed = Math.max(0, now - startedAt);
        const progress = Math.min(1, elapsed / animationDuration);
        const eased = easeOutCubic(progress);

        const frameRange = {
          from: startRange.from + ((nextRange.from - startRange.from) * eased),
          to: startRange.to + ((nextRange.to - startRange.to) * eased),
        };

        try {
          ts.setVisibleLogicalRange?.(frameRange);
        } catch {
          stopKeyboardPanAnimation();
          return;
        }

        syncViewportAfterKeyboardMove("keyboardArrowNavigationAnimated");

        if (progress < 1) {
          state.raf = requestAnimationFrame(tick);
          return;
        }

        state.raf = 0;

        try {
          ts.setVisibleLogicalRange?.(nextRange);
        } catch {}

        if (state.interactionActive) {
          try {
            viewportBrokerRef.current?.setInteractionActive?.(false);
          } catch {}
          state.interactionActive = false;
        }

        syncViewportAfterKeyboardMove("keyboardArrowNavigationAnimated:end");
      };

      state.raf = requestAnimationFrame(tick);
    },
    [masterChart, buildShiftedLogicalRange, stopKeyboardPanAnimation, syncViewportAfterKeyboardMove]
  );

  useEffect(() => {
    const handler = (e) => {
      const key = String(e.key || "").toLowerCase();
      if (key !== "arrowleft" && key !== "arrowright") return;
      if (e.ctrlKey || e.metaKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.altKey && e.shiftKey) {
        if (key !== "arrowright") return;
        e.preventDefault();
        e.stopPropagation();
        scrollToRealtime();
        return;
      }

      if (e.shiftKey) return;

      const barsToMove = e.altKey ? 50 : 1;
      const direction = key === "arrowright" ? 1 : -1;

      e.preventDefault();
      e.stopPropagation();
      moveViewportByBars(direction * barsToMove, {
        animated: e.altKey,
        durationMs: 280,
      });
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isTypingTarget, moveViewportByBars, scrollToRealtime]);

  useEffect(() => () => {
    stopKeyboardPanAnimation();
    stopRealtimeResetAnimation();
  }, [stopKeyboardPanAnimation, stopRealtimeResetAnimation]);

  const priceScaleMinWidth = useMemo(() => getPriceScaleMinWidth(symbol), [symbol]);

  const vLineRef = useRef(null);
  const hLineRef = useRef(null);
  const priceLabelRef = useRef(null);
  const timeLabelRef = useRef(null);

  const crosshairSnapRef = useRef({ t: NaN, p: NaN, xPane: NaN, at: 0 });

  const rafRef = useRef(0);
  const lastPtRef = useRef({ x: NaN, y: NaN });

  const clearNativeCrosshair = useCallback(() => {
    try {
      masterChart?.clearCrosshairPosition?.();
    } catch {}

    for (const [, api] of paneApiRef.current) {
      try {
        api?.chart?.clearCrosshairPosition?.();
      } catch {}
    }
  }, [masterChart]);

  const isOverScrollToRealtimeButton = useCallback((clientX, clientY, evtTarget = null) => {
    if (typeof document === "undefined") return false;

    try {
      if (evtTarget instanceof Element && evtTarget.closest?.(".scroll-to-realtime-button")) {
        return true;
      }
    } catch {}

    try {
      const hoveredEl = document.elementFromPoint(clientX, clientY);
      if (hoveredEl instanceof Element && hoveredEl.closest?.(".scroll-to-realtime-button")) {
        return true;
      }
    } catch {}

    try {
      const buttonEl = document.querySelector(".scroll-to-realtime-button");
      if (!buttonEl) return false;

      const rect = buttonEl.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    } catch {}

    return false;
  }, []);

  const hideCrosshair = useCallback(() => {
    if (vLineRef.current) vLineRef.current.style.display = "none";
    if (hLineRef.current) hLineRef.current.style.display = "none";
    if (priceLabelRef.current) priceLabelRef.current.style.display = "none";
    if (timeLabelRef.current) timeLabelRef.current.style.display = "none";

    clearNativeCrosshair();

    try {
      crosshairSnapRef.current = { t: NaN, p: NaN, xPane: NaN, at: 0 };
    } catch {}
  }, [clearNativeCrosshair]);

  const showCrosshair = useCallback(() => {
    if (vLineRef.current) vLineRef.current.style.display = "block";
    if (hLineRef.current) hLineRef.current.style.display = "block";
    if (priceLabelRef.current) priceLabelRef.current.style.display = "block";
    if (timeLabelRef.current) timeLabelRef.current.style.display = "block";
  }, []);

  const applyCrosshair = useCallback(
    (clientX, clientY) => {
      if (!showDomCrosshair) {
        hideCrosshair();
        return;
      }

      const host = layoutRef.current;
      if (!host) return;

      if (isOverScrollToRealtimeButton(clientX, clientY)) {
        hideCrosshair();
        return;
      }

      const hostRect = host.getBoundingClientRect();
      const xHostRaw = clientX - hostRect.left;
      const yHostRaw = clientY - hostRect.top;

      if (xHostRaw < 0 || yHostRaw < 0 || xHostRaw > hostRect.width || yHostRaw > hostRect.height) {
        hideCrosshair();
        return;
      }

      let snappedXHost = xHostRaw;
      let snappedTime = null;

      if (masterChart && masterContainer && typeof getMasterSeries === "function") {
        const containerRect = masterContainer.getBoundingClientRect();

        const xChart = clientX - containerRect.left;
        const yChart = clientY - containerRect.top;

        try {
          const ts = masterChart.timeScale?.();
          const series = getMasterSeries();

          const logical = ts?.coordinateToLogical?.(xChart);

          if (Number.isFinite(Number(logical))) {
            const snappedLogical = Math.round(Number(logical));
            const xSnappedChart = ts?.logicalToCoordinate?.(snappedLogical);

            if (Number.isFinite(Number(xSnappedChart))) {
              snappedXHost = containerRect.left - hostRect.left + Number(xSnappedChart);

              const mapped = logicalToMappedTime(snappedLogical);
              if (mapped != null) snappedTime = mapped;
              else {
                const lwTime = ts?.coordinateToTime?.(Number(xSnappedChart)) ?? null;
                snappedTime = lwTime;
              }

              const p = series?.coordinateToPrice?.(yChart);
              const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

              crosshairSnapRef.current = {
                t: Number(snappedTime),
                p: Number(p),
                xPane: Number(xSnappedChart),
                at: now,
              };

              try {
                masterChart.setCrosshairPosition?.(p, snappedTime, series);
              } catch {}
            }
          }
        } catch {}
      }

      if (vLineRef.current) vLineRef.current.style.left = `${Math.round(snappedXHost)}px`;

      if (timeLabelRef.current) {
        const ttxt = formatTimeLabel(snappedTime, getMonth);
        if (ttxt) {
          timeLabelRef.current.textContent = ttxt;

          const footerTop = hostRect.height - TIME_FOOTER_HEIGHT;
          const footerCenterY = footerTop + (TIME_FOOTER_HEIGHT / 2);
          const rightScale = getRightScaleWidthFromChart(masterChart, priceScaleMinWidth);

          timeLabelRef.current.style.top = `${Math.round(footerCenterY)}px`;
          timeLabelRef.current.style.transform = "translate(-50%, -50%)";

          const w = timeLabelRef.current.offsetWidth || 0;
          const minX = 8 + w / 2;
          const maxX = hostRect.width - rightScale - 8 - w / 2;
          const clampedX = clamp(snappedXHost, minX, Math.max(minX, maxX));

          timeLabelRef.current.style.left = `${Math.round(clampedX)}px`;
          timeLabelRef.current.style.display = "block";
        } else {
          timeLabelRef.current.style.display = "none";
        }
      }

      let active = null;
      if (masterContainer && masterChart && typeof getMasterSeries === "function") {
        const r = masterContainer.getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) {
          const s = getMasterSeries();
          active = { rect: r, series: s, chart: masterChart, isMaster: true };
        }
      }

      if (!active) {
        for (const [, api] of paneApiRef.current) {
          const el = api?.container;
          const ch = api?.chart;
          const s = api?.getSeries?.();
          if (!el || !ch || !s) continue;
          const r = el.getBoundingClientRect();
          if (clientY >= r.top && clientY <= r.bottom) {
            active = { rect: r, series: s, chart: ch, isMaster: false };
            break;
          }
        }
      }

      if (!active) {
        if (hLineRef.current) hLineRef.current.style.display = "none";
        if (priceLabelRef.current) priceLabelRef.current.style.display = "none";
        if (vLineRef.current) vLineRef.current.style.display = "block";
        if (timeLabelRef.current && timeLabelRef.current.textContent) timeLabelRef.current.style.display = "block";
        return;
      }

      const yInActive = clientY - active.rect.top;
      const topInHost = active.rect.top - hostRect.top;

      if (hLineRef.current) {
        hLineRef.current.style.top = `${Math.round(topInHost + yInActive)}px`;
        hLineRef.current.style.display = "block";
      }

      let price = null;
      try {
        price = active.series?.coordinateToPrice?.(yInActive);
      } catch {
        price = null;
      }

      if (priceLabelRef.current) {
        const txt = formatPriceForSeries(price, active.series);
        if (txt) {
          priceLabelRef.current.textContent = txt;
          priceLabelRef.current.style.top = `${Math.round(topInHost + yInActive)}px`;
          priceLabelRef.current.style.transform = "translateY(-50%)";

          const rightEdgeInHost = active.rect.right - hostRect.left;
          const scaleWidth = getRightScaleWidthFromChart(active.chart, priceScaleMinWidth);
          const scaleStartInHost = rightEdgeInHost - scaleWidth;

          if (active.isMaster) {
            const scalePad = 1;
            const labelWidth = Math.max(28, Math.round(scaleWidth - scalePad * 2));
            const labelLeft = scaleStartInHost + scalePad;

            priceLabelRef.current.style.width = `${labelWidth}px`;
            priceLabelRef.current.style.minWidth = `${labelWidth}px`;
            priceLabelRef.current.style.maxWidth = `${labelWidth}px`;
            priceLabelRef.current.style.left = `${Math.round(labelLeft)}px`;
            priceLabelRef.current.style.padding = "2px 4px";
            priceLabelRef.current.style.textAlign = "center";
            priceLabelRef.current.style.whiteSpace = "nowrap";
            priceLabelRef.current.style.display = "block";
          } else {
            const panePadLeft = 3;
            const panePadRight = 6;
            const contentWidth = Math.max(34, Math.min(scaleWidth - (panePadLeft + panePadRight), (txt.length * 7) + 10));
            const labelLeft = scaleStartInHost + panePadLeft;

            priceLabelRef.current.style.width = "auto";
            priceLabelRef.current.style.minWidth = `${contentWidth}px`;
            priceLabelRef.current.style.maxWidth = `${contentWidth}px`;
            priceLabelRef.current.style.left = `${Math.round(labelLeft)}px`;
            priceLabelRef.current.style.padding = "2px 5px";
            priceLabelRef.current.style.textAlign = "left";
            priceLabelRef.current.style.whiteSpace = "nowrap";
            priceLabelRef.current.style.display = "block";
          }
        } else {
          priceLabelRef.current.style.display = "none";
        }
      }

      showCrosshair();

      if (snappedTime != null) {
        for (const [, api] of paneApiRef.current) {
          const ch = api?.chart;
          const el = api?.container;
          const s = api?.getSeries?.();
          if (!ch || !el || !s) continue;

          try {
            const pr = el.getBoundingClientRect();
            const yPane = clientY - pr.top;
            const p = s?.coordinateToPrice?.(yPane);
            try {
              ch.setCrosshairPosition?.(p, snappedTime, s);
            } catch {}
          } catch {}
        }
      }
    },
    [
      showDomCrosshair,
      hideCrosshair,
      showCrosshair,
      masterChart,
      masterContainer,
      getMasterSeries,
      logicalToMappedTime,
      getMonth,
      isOverScrollToRealtimeButton,
      priceScaleMinWidth,
    ]
  );

  useEffect(() => {
    if (!showDomCrosshair) {
      hideCrosshair();
      return;
    }

    const host = layoutRef.current;
    if (!host) return;

    const onMove = (e) => {
      if (isOverScrollToRealtimeButton(e.clientX, e.clientY, e.target)) {
        lastPtRef.current = { x: NaN, y: NaN };

        if (rafRef.current) {
          try {
            cancelAnimationFrame(rafRef.current);
          } catch {}
          rafRef.current = 0;
        }

        hideCrosshair();
        return;
      }

      lastPtRef.current = { x: e.clientX, y: e.clientY };
      if (rafRef.current) return;

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const p = lastPtRef.current;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
        applyCrosshair(p.x, p.y);
      });
    };

    const onDown = (e) => {
      if (isOverScrollToRealtimeButton(e.clientX, e.clientY, e.target)) {
        lastPtRef.current = { x: NaN, y: NaN };
        hideCrosshair();
        return;
      }

      lastPtRef.current = { x: e.clientX, y: e.clientY };
      try {
        applyCrosshair(e.clientX, e.clientY);
      } catch {}
    };

    const onLeave = () => {
      hideCrosshair();
    };

    host.addEventListener("pointermove", onMove, true);
    host.addEventListener("pointerdown", onDown, true);
    host.addEventListener("pointerleave", onLeave, true);

    return () => {
      host.removeEventListener("pointermove", onMove, true);
      host.removeEventListener("pointerdown", onDown, true);
      host.removeEventListener("pointerleave", onLeave, true);
      if (rafRef.current) {
        try {
          cancelAnimationFrame(rafRef.current);
        } catch {}
        rafRef.current = 0;
      }
    };
  }, [showDomCrosshair, applyCrosshair, hideCrosshair, isOverScrollToRealtimeButton]);

  useEffect(() => {
    hideCrosshair();
  }, [hideCrosshair, showDomCrosshair]);

  const defaultChartBgUrl = useMemo(() => {
    return `${import.meta.env.BASE_URL}backgrounds/trade_pro.jpg`;
  }, []);

  const getDrawingTransform = useCallback(() => {
    const chart = masterChart;
    const containerEl = masterContainer;
    const series = typeof getMasterSeries === "function" ? getMasterSeries() : null;
    if (!chart || !containerEl || !series) return null;

    return new LightweightChartsTransform({
      chart,
      series,
      containerEl,
      logicalToMappedTime,
      mappedTimeToLogical,
      getCrosshairSnapshot: () => crosshairSnapRef.current,
    });
  }, [masterChart, masterContainer, getMasterSeries, logicalToMappedTime, mappedTimeToLogical]);

  const crosshairLineColor = "rgba(226, 232, 240, 0.24)";
  const crosshairLabelBg = "rgba(226, 232, 240, 0.92)";
  const crosshairLabelColor = "rgba(15, 23, 42, 0.96)";
  const crosshairLabelBorder = "1px solid rgba(148, 163, 184, 0.85)";
  const crosshairLabelShadow = "0 4px 10px rgba(2, 6, 23, 0.18)";

  return (
    <div
      ref={layoutRef}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        minWidth: 0,
        zIndex: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          backgroundImage: `url(${defaultChartBgUrl})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundSize: "cover",
          opacity: 0.3,
          filter: "saturate(1.05) contrast(1.05)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 20,
          pointerEvents: "none",
          display: showDomCrosshair ? "block" : "none",
        }}
      >
        <div
          ref={vLineRef}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: "1px",
            left: "-9999px",
            background: crosshairLineColor,
            display: "none",
            pointerEvents: "none",
          }}
        />
        <div
          ref={hLineRef}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: "1px",
            top: "-9999px",
            background: crosshairLineColor,
            display: "none",
            pointerEvents: "none",
          }}
        />
        <div
          ref={priceLabelRef}
          style={{
            position: "absolute",
            left: "-9999px",
            top: "-9999px",
            padding: "2px 4px",
            borderRadius: 2,
            fontSize: 11,
            fontWeight: 700,
            lineHeight: "15px",
            color: crosshairLabelColor,
            background: crosshairLabelBg,
            border: crosshairLabelBorder,
            boxShadow: crosshairLabelShadow,
            whiteSpace: "nowrap",
            textAlign: "center",
            boxSizing: "border-box",
            display: "none",
            pointerEvents: "none",
            userSelect: "none",
            letterSpacing: "0.02em",
          }}
        />
        <div
          ref={timeLabelRef}
          style={{
            position: "absolute",
            left: "-9999px",
            top: "-9999px",
            padding: "2px 4px",
            borderRadius: 2,
            fontSize: 11,
            fontWeight: 700,
            lineHeight: "15px",
            color: crosshairLabelColor,
            background: crosshairLabelBg,
            border: crosshairLabelBorder,
            boxShadow: crosshairLabelShadow,
            whiteSpace: "nowrap",
            transform: "translate(-50%, -50%)",
            display: "none",
            pointerEvents: "none",
            userSelect: "none",
            letterSpacing: "0.02em",
          }}
        />
      </div>

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, minWidth: 0 }}>
        <div style={{ flex: "1 1 auto", minHeight: 0, minWidth: 0, position: "relative" }}>
          {symbol && (
            <>
              <MainChart
                key={runtimeChartKey}
                pair={symbol}
                onChartReady={setMasterChartState}
                showTimeScale={false}
                priceScaleMinWidth={priceScaleMinWidth}
              />

              <DrawingQuickToolbar apiRef={drawingsApiRef} />

              <DrawingOverlay
                activeTool={activeDrawingTool}
                getTransform={getDrawingTransform}
                apiRef={drawingsApiRef}
                hostEl={masterContainer}
                onChange={onDrawingsChange}
                onApiReady={onDrawingsOverlayReady}
                onCommit={() => {
                  onDrawingsCommit?.();
                  setActiveDrawingTool?.(null);
                }}
              />

              <ScrollToRealtimeButton
                visible={showScrollToRealtime}
                onClick={() => {
                  SoundManager.uiClick?.();
                  scrollToRealtime();
                }}
              />
            </>
          )}
        </div>

        {visiblePanes.map((p) => {
          const type = String(p.type || "").toLowerCase();
          const paneKey = `${type}|${p.id}`;

          return (
            <div key={`${runtimeChartKey}:${p.id}`} style={{ flex: "0 0 auto", minHeight: 0 }}>
              <PaneSplitter
                onDragDelta={(dy) => {
                  resizePaneWithConstraints({
                    paneType: type,
                    deltaY: -dy,
                    mainHeightRef,
                    minMainHeight: 180,
                  });
                }}
              />

              <PaneHost
                style={{
                  height: `${p.height}px`,
                  width: "100%",
                  position: "relative",
                  overflow: "hidden",
                  background: "#0f172a",
                }}
              >
                <IndicatorPaneChart
                  key={`${runtimeChartKey}:${paneKey}`}
                  type={type}
                  engine={engine}
                  masterChart={masterChart}
                  masterContainer={masterContainer}
                  indicatorInstances={indicatorInstances}
                  showTimeScale={false}
                  priceScaleMinWidth={priceScaleMinWidth}
                  onPaneReady={(api) => setPaneApi(paneKey, api)}
                />
              </PaneHost>
            </div>
          );
        })}

        <div style={{ flex: "0 0 auto", height: TIME_FOOTER_SEPARATOR, background: "rgba(255,255,255,0.08)" }} />

        <div style={{ flex: "0 0 auto" }}>
          <TimeScaleFooterChart
            engine={engine}
            masterChart={masterChart}
            masterContainer={masterContainer}
            height={TIME_FOOTER_HEIGHT}
            background="#0f172a"
          />
        </div>
      </div>
    </div>
  );
}

export default function ChartWorkspace() {
  const { symbol, timeframe, setTimeframe, isPairPanelOpen, closePairPanel } = usePairUI();

  const indicatorsApi = useIndicators();

  const [activeDrawingTool, setActiveDrawingTool] = useState(null);
  const drawingsApiRef = useRef(null);

  const [activePanel, setActivePanel] = useState(null);

  const closePanel = useCallback(() => {
    setActivePanel(null);
  }, []);

  const handleToolbarAction = useCallback((action) => {
    SoundManager.uiClick?.();
    setActivePanel((prev) => (prev === action ? null : action));
  }, []);

  const tfNorm = normalizeTf(timeframe);
  const runtimeChartKey = `${String(symbol || "").toUpperCase()}|${tfNorm}`;

  const { onDrawingsChange, onDrawingsCommit, load: loadDrawingsNow } = useDrawingsPersistence({
    symbol: String(symbol || "").toUpperCase(),
    timeframe: tfNorm,
    drawingsApiRef,
    chartInstanceKey: runtimeChartKey,
  });

  const { onIndicatorsChange, onIndicatorsCommit } = useIndicatorsPersistence({
    symbol: String(symbol || "").toUpperCase(),
    timeframe: tfNorm,
    getIndicatorsState: () => indicatorsApi.instances,
    applyIndicatorsState: (arr) => indicatorsApi.setAllInstances(arr),
    clearIndicatorsInstant: () => indicatorsApi.clearAllIndicators(),
  });

  useEffect(() => {
    onIndicatorsChange?.();
  }, [indicatorsApi.instances, onIndicatorsChange]);

  useEffect(() => {
    setActivePanel(null);
  }, [runtimeChartKey]);

  return (
    <div
      data-chart-workspace-root="true"
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
    >
      <PairSelectorButton />
      <PairSelectorPanel isOpen={isPairPanelOpen} onClose={closePairPanel} />

      <FloatingToolbar onAction={handleToolbarAction} activeAction={activePanel} timeframe={tfNorm} />

      {activePanel === "timeframe" && (
        <TimeframePanel
          currentTf={tfNorm}
          onSelect={(tf) => {
            const normalized = normalizeTf(tf);
            setTimeframe(normalized);
            closePanel();
          }}
          onClose={closePanel}
        />
      )}

      {activePanel === "chartType" && <ChartTypePanel onSelect={() => closePanel()} onClose={closePanel} />}

      {activePanel === "indicators" && (
        <IndicatorsPanel
          onClose={() => {
            onIndicatorsCommit?.();
            closePanel();
          }}
        />
      )}

      {activePanel === "draw" && (
        <DrawingToolsPanel
          activeTool={activeDrawingTool}
          onSelect={(toolId) => {
            setActiveDrawingTool((prev) => (prev === toolId ? null : toolId));
            closePanel();
          }}
          onClose={closePanel}
          onClearAll={() => {
            try {
              drawingsApiRef.current?.clearAll?.();
            } catch {}
          }}
        />
      )}

      <PaneManagerProvider persist={true}>
        <WorkspacePanes
          key={runtimeChartKey}
          runtimeChartKey={runtimeChartKey}
          symbol={symbol}
          activeDrawingTool={activeDrawingTool}
          setActiveDrawingTool={setActiveDrawingTool}
          drawingsApiRef={drawingsApiRef}
          onDrawingsChange={onDrawingsChange}
          onDrawingsCommit={onDrawingsCommit}
          onDrawingsOverlayReady={loadDrawingsNow}
        />
      </PaneManagerProvider>
    </div>
  );
}