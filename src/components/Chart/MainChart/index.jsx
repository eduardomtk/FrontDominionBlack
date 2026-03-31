import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, CrosshairMode } from "lightweight-charts";
import { useCandleEngine } from "@/context/CandleContext";
import { useChartView } from "@/context/ChartViewContext";
import { useIndicators } from "@/context/IndicatorsContext";
import { useTrade } from "@/context/TradeContext";
import { usePairUI } from "@/context/PairUIContext";
import { useMarketStore } from "@/stores/market.store";
import ChartBridge from "./ChartBridge";
import IndicatorLayer from "./indicatorLayer";
import TradeLinesManager from "../TradeLines/TradeLinesManager";

// ✅ SOBERANO: CrosshairStore alimentado direto do LWC
import { CrosshairStore } from "@/components/Chart/Drawings/crosshair/CrosshairStore";

// =====================================
// ✅ Watermark Primitive (canvas overlay)
// =====================================
class WatermarkPrimitive {
  constructor({ chart, series }) {
    this._chart = chart;
    this._series = series;

    this._img = null;
    this._ready = false;

    this._src = "";
    this._opacity = 0.10;
    this._sizePct = 0.38;
    this._anchor = "center";
    this._smoothing = true;

    this._fit = "watermark";

    this._lastW = 0;
    this._lastH = 0;
  }

  setOptions({ src, opacity, sizePct, anchor, smoothing, fit }) {
    if (typeof opacity === "number" && Number.isFinite(opacity)) this._opacity = Math.max(0, Math.min(1, opacity));
    if (typeof sizePct === "number" && Number.isFinite(sizePct)) this._sizePct = Math.max(0.05, Math.min(1.0, sizePct));
    if (typeof anchor === "string" && anchor) this._anchor = anchor;
    if (typeof smoothing === "boolean") this._smoothing = smoothing;

    if (typeof fit === "string" && fit) {
      const f = String(fit).toLowerCase().trim();
      if (f === "cover" || f === "contain" || f === "watermark") this._fit = f;
    }

    if (typeof src === "string" && src && src !== this._src) {
      this._src = src;
      this._ready = false;

      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";

      img.onload = () => {
        this._img = img;
        this._ready = true;
      };

      img.onerror = () => {
        this._img = null;
        this._ready = false;
      };

      img.src = src;
    }
  }

  paneViews() {
    const self = this;
    return [
      {
        renderer() {
          return {
            draw(target) {
              const chart = self._chart;
              const series = self._series;
              if (!chart || !series) return;

              const img = self._img;
              if (!self._ready || !img) return;

              if (typeof target?.useBitmapCoordinateSpace !== "function") return;

              target.useBitmapCoordinateSpace((scope) => {
                const ctx = scope.context;
                if (!ctx) return;

                const w = Number(scope.bitmapSize?.width) || 0;
                const h = Number(scope.bitmapSize?.height) || 0;
                if (w <= 0 || h <= 0) return;

                self._lastW = w;
                self._lastH = h;

                const iw = img.naturalWidth || img.width || 1;
                const ih = img.naturalHeight || img.height || 1;

                const fit = String(self._fit || "watermark").toLowerCase();

                let dw = 0;
                let dh = 0;
                let x = 0;
                let y = 0;

                if (fit === "cover" || fit === "contain") {
                  const scaleX = w / iw;
                  const scaleY = h / ih;

                  const scale = fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);

                  dw = Math.ceil(iw * scale);
                  dh = Math.ceil(ih * scale);

                  x = Math.floor((w - dw) / 2);
                  y = Math.floor((h - dh) / 2);

                  const a = String(self._anchor || "center").toLowerCase();
                  if (a === "top-left") {
                    x = 0;
                    y = 0;
                  } else if (a === "top-right") {
                    x = w - dw;
                    y = 0;
                  } else if (a === "bottom-left") {
                    x = 0;
                    y = h - dh;
                  } else if (a === "bottom-right") {
                    x = w - dw;
                    y = h - dh;
                  }
                } else {
                  const minSide = Math.min(w, h);
                  const targetSize = Math.max(10, Math.floor(minSide * self._sizePct));

                  const ratio = iw / ih;

                  dw = targetSize;
                  dh = Math.floor(targetSize / ratio);

                  if (dh > targetSize) {
                    dh = targetSize;
                    dw = Math.floor(targetSize * ratio);
                  }

                  x = Math.floor((w - dw) / 2);
                  y = Math.floor((h - dh) / 2);

                  const pad = Math.floor(minSide * 0.06);

                  const a = String(self._anchor || "center").toLowerCase();
                  if (a === "top-left") {
                    x = pad;
                    y = pad;
                  } else if (a === "top-right") {
                    x = w - dw - pad;
                    y = pad;
                  } else if (a === "bottom-left") {
                    x = pad;
                    y = h - dh - pad;
                  } else if (a === "bottom-right") {
                    x = w - dw - pad;
                    y = h - dh - pad;
                  }
                }

                ctx.save();
                ctx.globalAlpha = self._opacity;
                ctx.imageSmoothingEnabled = !!self._smoothing;
                ctx.drawImage(img, x, y, dw, dh);
                ctx.restore();
              });
            },
          };
        },
      },
    ];
  }
}

const HISTORY_RESET_EVENT = "__lwc_history_reset__";
const PRICE_SCALE_RESET_EVENT = "__lwc_price_scale_reset__";

function normalizeActiveSymbol(symbol) {
  return String(symbol || "").replace(/\//g, "").trim().toUpperCase();
}

function normalizeActiveTf(tf) {
  const s = String(tf || "M1").trim().toUpperCase();
  if (s === "M1" || s === "M5" || s === "M15" || s === "M30" || s === "H1") return s;
  return "M1";
}

const BOOT_SNAPSHOT_CACHE_VERSION = "v6";
const BOOT_SNAPSHOT_CACHE_TTL_MS = 75 * 1000;
const BOOT_SNAPSHOT_MAX_CANDLES = 500;
const BOOT_TF_MAP = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600 };
const INITIAL_VISIBLE_BARS = 84;
const INITIAL_RIGHT_OFFSET = 15;

function calcInitialVisibleLogicalRange(closedCount, hasLive = false) {
  const bars = Math.max(0, Number(closedCount) || 0) + (hasLive ? 1 : 0);
  if (bars <= 0) return null;

  const to = bars + INITIAL_RIGHT_OFFSET;
  const from = Math.max(-2, bars - INITIAL_VISIBLE_BARS);
  return { from, to };
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function bootSnapshotStorageKey(key) {
  return `market-history:${BOOT_SNAPSHOT_CACHE_VERSION}:${String(key || "")}`;
}

function bootNormalizeEpochSeconds(t) {
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  if (n >= 1e12) return Math.floor(n / 1000);
  return Math.floor(n);
}

function bootSanitizeCandles(data) {
  const arr = Array.isArray(data) ? data : [];
  const normalized = arr
    .filter(Boolean)
    .map((c) => ({
      time: bootNormalizeEpochSeconds(c?.time ?? c?.t),
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

  return out.slice(-BOOT_SNAPSHOT_MAX_CANDLES);
}

function bootSanitizeCandleLike(data) {
  if (!data) return null;
  const c = data?.candle || data;
  const time = bootNormalizeEpochSeconds(c?.time ?? c?.t);
  const open = Number(c?.open ?? c?.o);
  const high = Number(c?.high ?? c?.h);
  const low = Number(c?.low ?? c?.l);
  const close = Number(c?.close ?? c?.c);
  const volume = Number(c?.volume ?? c?.v) || 0;
  if (!Number.isFinite(time) || ![open, high, low, close].every(Number.isFinite)) return null;
  return { time, open, high, low, close, volume };
}

function bootBucketTime(t, timeframeSec) {
  const sec = bootNormalizeEpochSeconds(t);
  const tf = Number(timeframeSec) || 60;
  if (!Number.isFinite(sec) || !Number.isFinite(tf) || tf <= 0) return null;
  return Math.floor(sec / tf) * tf;
}

function readBootSnapshot(key) {
  if (typeof localStorage === "undefined" || !key) return null;
  try {
    const raw = localStorage.getItem(bootSnapshotStorageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ts = Number(parsed?.ts || 0);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    if (Date.now() - ts > BOOT_SNAPSHOT_CACHE_TTL_MS) return null;

    const candles = bootSanitizeCandles(parsed?.candles);
    const tf = String(parsed?.timeframe || key.split("|")[1] || "M1").toUpperCase().trim();
    const timeframeSec = Number(parsed?.timeframeSec) || BOOT_TF_MAP[tf] || 60;
    const nowBucket = bootBucketTime(Math.floor(Date.now() / 1000), timeframeSec);

    let liveCandle = bootSanitizeCandleLike(parsed?.liveCandle);
    if (liveCandle) {
      const liveBucket = bootBucketTime(liveCandle.time, timeframeSec);
      if (nowBucket != null && liveBucket != null && liveBucket !== nowBucket) {
        liveCandle = null;
      }
    }

    if (!candles.length || !liveCandle) return null;
    return { candles, liveCandle, timeframeSec, ts };
  } catch {
    return null;
  }
}

function getRightPriceScaleWidth(chart, fallback = 110) {
  try {
    const live = Number(chart?.priceScale?.("right")?.width?.());
    if (Number.isFinite(live) && live > 0) return live;
  } catch {}

  try {
    const minW = Number(chart?.priceScale?.("right")?.options?.()?.minimumWidth);
    if (Number.isFinite(minW) && minW > 0) return minW;
  } catch {}

  const fb = Number(fallback);
  return Number.isFinite(fb) && fb > 0 ? fb : 110;
}

function isForexPriceSymbol(symbol) {
  const raw = String(symbol || "").trim().toUpperCase();
  const compact = raw.replace(/\//g, "");
  return /^[A-Z]{6}$/.test(compact);
}

function buildPriceFormatForSymbol(symbol) {
  if (isForexPriceSymbol(symbol)) {
    return { type: "price", precision: 4, minMove: 0.0001 };
  }
  return { type: "price", precision: 2, minMove: 0.01 };
}

export default function MainChart({
  onChartReady,
  showTimeScale = true,
  priceScaleMinWidth = 110,

  backgroundUrl = null,
  backgroundOpacity = 0.10,
  backgroundSize = "38%",
  backgroundPosition = "center",
  backgroundSmoothing = true,
  debugBackground = false,

  backgroundFit = "watermark",
}) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);

  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const bridgeRef = useRef(null);
  const indicatorLayerRef = useRef(null);

  const unsubRef = useRef(null);
  const resizeObsRef = useRef(null);

  const subTokenRef = useRef(0);

  const lastClosedCandlesRef = useRef([]);
  const lastLiveCandleRef = useRef(null);
  const onChartReadyRef = useRef(onChartReady);

  const overlayElRef = useRef(null);
  const tradeLinesRef = useRef(null);

  const watermarkRef = useRef(null);

  const engine = useCandleEngine();
  const { chartType } = useChartView();
  const { instances: indicatorInstances } = useIndicators();
  const { activeTrades } = useTrade();
  const { symbol, timeframe } = usePairUI();

  const currentPairKey = useMemo(() => `${normalizeActiveSymbol(symbol)}|${normalizeActiveTf(timeframe)}`, [symbol, timeframe]);
  const pairIsLoadingHistory = useMarketStore((state) => !!state.pairs?.[currentPairKey]?.isLoadingHistory);
  const pairCandlesCount = useMarketStore((state) => {
    const candles = state.pairs?.[currentPairKey]?.candles;
    return Array.isArray(candles) ? candles.length : 0;
  });
  const pairHasLive = useMarketStore((state) => !!state.pairs?.[currentPairKey]?.liveCandle);

  const bootSeedRef = useRef(null);
  const bootSeedKeyRef = useRef("");

  const lbDataRef = useRef({ seeded: false, lastClosedTime: null, lastClosedCount: 0, firstClosedTime: null });
  const lbPendingLiveRef = useRef(null);

  const lastMarkerRef = useRef({ time: null, price: null });

  // ✅ performance: buffer + throttle para overlay indicators (evita clones/GC em tick)
  const overlayBufRef = useRef({ sig: "", buf: [], hasLive: false });
  const pendingOverlayRef = useRef(null);
  const overlayRafRef = useRef(0);
  const overlayLastRunRef = useRef(0);
  const mainSeriesSeededRef = useRef(false);
  const overlaysBootstrappedRef = useRef(false);

  const indicatorInstancesRef = useRef(indicatorInstances);
  const pulseElRef = useRef(null);
  const pulseStyleElRef = useRef(null);
  const pulseRafRef = useRef(0);

  const lbViewportRef = useRef({
    didPreset: false,
    didScheduleScroll: false,
    didScrollToRealTime: false,
    userMoved: false,
    unsubUserMove: null,
  });

  const manualPriceScaleRef = useRef(false);
  const lastEngineObjRef = useRef(null);

  // ✅ soberano: epoch de reset de histórico (somente para "hard reset", NÃO em cada candle close)
  const historyEpochRef = useRef(0);
  const lastHistoryMetaRef = useRef({
    armed: false,
    type: "",
    n: 0,
    ft: NaN,
    lt: NaN,
    step: 60,
  });

  // ✅ loading overlay
  const [chartLoading, setChartLoading] = useState(() => {
    if (pairCandlesCount > 0 || pairHasLive) return false;
    return !readBootSnapshot(currentPairKey);
  });
  const loadingEpochRef = useRef(0);

  useEffect(() => {
    bootSeedRef.current = readBootSnapshot(currentPairKey);
    bootSeedKeyRef.current = currentPairKey;

    if (pairCandlesCount > 0 || pairHasLive || bootSeedRef.current) {
      setChartLoading(false);
    } else {
      setChartLoading(true);
    }
  }, [currentPairKey, pairCandlesCount, pairHasLive]);

  useEffect(() => {
    onChartReadyRef.current = onChartReady;
  }, [onChartReady]);

  useEffect(() => {
    indicatorInstancesRef.current = indicatorInstances;
  }, [indicatorInstances]);

  const type = useMemo(() => {
    const t = String(chartType || "candles").toLowerCase();
    if (t === "line" || t === "bars" || t === "heikin") return t;
    return "candles";
  }, [chartType]);

  const PRICE_FORMAT = useMemo(() => buildPriceFormatForSymbol(symbol), [symbol]);

  function applyBootVisualSeed(reason = "boot") {
    if (pairCandlesCount > 0 || pairHasLive) return false;

    const key = currentPairKey;
    const cached = bootSeedKeyRef.current === key
      ? bootSeedRef.current
      : readBootSnapshot(key);

    if (!cached) return false;

    const closed = Array.isArray(cached.candles) ? cached.candles : [];
    const live = cached.liveCandle || null;
    const chart = chartRef.current;
    const series = seriesRef.current;
    const bridge = bridgeRef.current;

    if (!chart || !series) return false;

    try {
      if (type === "line") {
        const lineData = closed
          .map((c) => ({ time: Number(c.time), value: Number(c.close) }))
          .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value));
        series.setData(lineData);
        if (live) {
          const t = Number(live.time);
          const v = Number(live.close);
          if (Number.isFinite(t) && Number.isFinite(v)) {
            try { series.update({ time: t, value: v }); } catch {}
            setLineMarker(t, v);
          }
        }
        lbDataRef.current = {
          seeded: lineData.length > 0,
          lastClosedTime: lineData.length ? Number(lineData[lineData.length - 1]?.time) : null,
          lastClosedCount: lineData.length,
          firstClosedTime: lineData.length ? Number(lineData[0]?.time) : null,
        };
      } else if (type === "bars") {
        const barData = closed
          .map((c) => ({
            time: Number(c.time),
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
          }))
          .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));
        series.setData(barData);
        if (live) {
          const lc = {
            time: Number(live.time),
            open: Number(live.open),
            high: Number(live.high),
            low: Number(live.low),
            close: Number(live.close),
          };
          if (Number.isFinite(lc.time) && Number.isFinite(lc.open) && Number.isFinite(lc.high) && Number.isFinite(lc.low) && Number.isFinite(lc.close)) {
            try { series.update(lc); } catch {}
          }
        }
        lbDataRef.current = {
          seeded: barData.length > 0,
          lastClosedTime: barData.length ? Number(barData[barData.length - 1]?.time) : null,
          lastClosedCount: barData.length,
          firstClosedTime: barData.length ? Number(barData[0]?.time) : null,
        };
      } else {
        bridge?.setRenderMode?.(type === "heikin" ? "heikin" : "candles");
        bridge?.update?.(closed, live || null);
      }

      lastClosedCandlesRef.current = closed;
      lastLiveCandleRef.current = live;
      mainSeriesSeededRef.current = closed.length > 0 || !!live;
      hydrateEngineFromBootSnapshot(cached, reason);
      ensurePrimaryInitialViewport(closed.length, !!live);
      forceChartScaleRecovery();
      finishLoading();
      console.log(`[CHART][BOOT_SNAPSHOT] applied reason=${reason} key=${key} closed=${closed.length} live=${live ? 1 : 0}`);
      return true;
    } catch (e) {
      console.warn("[CHART][BOOT_SNAPSHOT] apply failed", e);
      return false;
    }
  }

  function startLoading() {
    loadingEpochRef.current += 1;
    if (pairCandlesCount > 0 || pairHasLive || bootSeedRef.current) {
      setChartLoading(false);
      return;
    }
    setChartLoading(true);
  }

  function finishLoading() {
    setChartLoading(false);
  }
  function hydrateEngineFromBootSnapshot(cached, reason = "boot") {
    if (!engine || !cached) return false;

    try {
      const engEmpty = typeof engine.isEmpty === "function"
        ? engine.isEmpty()
        : (((Array.isArray(engine.candles) ? engine.candles.length : 0) === 0) && !engine.liveCandle);
      if (!engEmpty) return false;

      const closed = Array.isArray(cached.candles) ? cached.candles : [];
      const live = cached.liveCandle || null;
      if (!closed.length && !live) return false;

      if (closed.length && typeof engine.onHistory === "function") {
        engine.onHistory(closed);
      }
      if (live && typeof engine.onCandleUpdate === "function") {
        engine.onCandleUpdate(live);
      }

      console.log(`[CHART][BOOT_ENGINE] hydrated reason=${reason} key=${currentPairKey} closed=${closed.length} live=${live ? 1 : 0}`);
      return true;
    } catch (e) {
      console.warn("[CHART][BOOT_ENGINE] hydrate failed", e);
      return false;
    }
  }


  function normalizeTimeToSeconds(timeLike) {
    if (timeLike == null) return null;

    if (typeof timeLike === "number") {
      return Number.isFinite(timeLike) ? timeLike : null;
    }

    if (typeof timeLike === "object" && timeLike && "year" in timeLike && "month" in timeLike && "day" in timeLike) {
      const y = Number(timeLike.year);
      const m = Number(timeLike.month);
      const d = Number(timeLike.day);
      if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
      const ms = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
      const sec = Math.floor(ms / 1000);
      return Number.isFinite(sec) ? sec : null;
    }

    const n = Number(timeLike);
    return Number.isFinite(n) ? n : null;
  }

  function parseSizePct(v) {
    const s = String(v || "").trim();
    if (!s) return 0.38;
    if (s.endsWith("%")) {
      const n = Number(s.slice(0, -1));
      if (Number.isFinite(n)) return Math.max(0.05, Math.min(1.0, n / 100));
      return 0.38;
    }
    const n = Number(s);
    if (Number.isFinite(n)) return Math.max(0.05, Math.min(1.0, n));
    return 0.38;
  }

  function normalizeAnchor(pos) {
    const p = String(pos || "center").toLowerCase().trim();
    if (p === "center") return "center";
    if (p === "top-left") return "top-left";
    if (p === "top-right") return "top-right";
    if (p === "bottom-left") return "bottom-left";
    if (p === "bottom-right") return "bottom-right";
    return "center";
  }

  function normalizeFit(fit) {
    const f = String(fit || "watermark").toLowerCase().trim();
    if (f === "cover") return "cover";
    if (f === "contain") return "contain";
    return "watermark";
  }

  function calcClosedSig(closed) {
    const arr = Array.isArray(closed) ? closed : [];
    if (!arr.length) return "";
    const ft = Number(arr[0]?.time);
    const lt = Number(arr[arr.length - 1]?.time);
    return `${arr.length}:${Number.isFinite(ft) ? ft : "NaN"}:${Number.isFinite(lt) ? lt : "NaN"}`;
  }

  function getOverlayBuffer(closed, live) {
    const st = overlayBufRef.current;
    const arr = Array.isArray(closed) ? closed : [];

    const sig = calcClosedSig(arr);
    if (sig !== st.sig) {
      st.sig = sig;
      st.buf = arr.slice();
      st.hasLive = false;
    } else {
      if (!Array.isArray(st.buf) || st.buf.length < arr.length) {
        st.buf = arr.slice();
        st.hasLive = false;
      }
      if (!st.hasLive && st.buf.length !== arr.length) {
        st.buf = arr.slice();
      }
      if (st.hasLive && st.buf.length !== arr.length + 1) {
        st.buf = arr.slice();
        st.hasLive = false;
      }
    }

    const buf = st.buf;

    if (live && typeof live === "object") {
      const lt = Number(live?.time);
      if (Number.isFinite(lt)) {
        if (st.hasLive) {
          buf[buf.length - 1] = live;
        } else {
          const last = buf.length ? buf[buf.length - 1] : null;
          const lastT = last ? Number(last?.time) : NaN;

          if (Number.isFinite(lastT) && lastT === lt) {
            buf[buf.length - 1] = live;
            st.hasLive = false;
          } else {
            buf.push(live);
            st.hasLive = true;
          }
        }
      }
    } else {
      if (st.hasLive) {
        buf.pop();
        st.hasLive = false;
      }
    }

    return buf;
  }

  function forceChartScaleRecovery({ resetPriceScale = false } = {}) {
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container) return;

    if (resetPriceScale) manualPriceScaleRef.current = false;

    const run = () => {
      try {
        const rect = container.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        const allowAutoScale = !manualPriceScaleRef.current;

        chart.applyOptions({
          width,
          height,
          rightPriceScale: {
            autoScale: allowAutoScale,
            visible: true,
            borderVisible: false,
            minimumWidth: priceScaleMinWidth,
          },
          timeScale: {
            visible: Boolean(showTimeScale),
            timeVisible: Boolean(showTimeScale),
            secondsVisible: Boolean(showTimeScale),
            lockVisibleTimeRangeOnResize: true,
            shiftVisibleRangeOnNewBar: false,
            fixLeftEdge: false,
            rightBarStaysOnScroll: true,
            minBarSpacing: 2.45,
          },
          handleScroll: {
            mouseWheel: false,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: manualPriceScaleRef.current,
          },
          handleScale: {
            mouseWheel: false,
            pinch: true,
            axisPressedMouseMove: {
              time: true,
              price: true,
            },
          },
        });

        try {
          const ts = chart.timeScale?.();
          ts?.applyOptions?.({
            shiftVisibleRangeOnNewBar: false,
            fixLeftEdge: false,
            rightBarStaysOnScroll: true,
            minBarSpacing: 2.45,
          });
        } catch {}
      } catch {}
    };

    run();

    try {
      requestAnimationFrame(() => {
        run();
        requestAnimationFrame(() => {
          run();
        });
      });
    } catch {}
  }

  function scheduleOverlayApply(closed, live) {
    const layer = indicatorLayerRef.current;
    if (!layer) return;

    const inst = Array.isArray(indicatorInstancesRef.current) ? indicatorInstancesRef.current : [];
    if (!inst.length) return;

    const buf = getOverlayBuffer(closed, live);
    pendingOverlayRef.current = buf;

    if (overlayRafRef.current) return;

    overlayRafRef.current = requestAnimationFrame(() => {
      overlayRafRef.current = 0;

      const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      const MIN_MS = 90;

      if (now - overlayLastRunRef.current < MIN_MS) return;
      overlayLastRunRef.current = now;

      const input = pendingOverlayRef.current;
      if (!Array.isArray(input) || input.length === 0) return;

      try {
        layer.applyData(input, inst);
      } catch {}

      forceChartScaleRecovery();
    });
  }

  function rebuildIndicatorLayer() {
    const chart = chartRef.current;
    if (!chart) return null;

    try {
      indicatorLayerRef.current?.dispose?.();
    } catch {}

    indicatorLayerRef.current = new IndicatorLayer({ chart });
    return indicatorLayerRef.current;
  }

  function resetOverlayRuntime({ clearVisual = false, rebuild = false } = {}) {
    try {
      if (overlayRafRef.current) cancelAnimationFrame(overlayRafRef.current);
    } catch {}
    overlayRafRef.current = 0;
    pendingOverlayRef.current = null;
    overlayLastRunRef.current = 0;
    overlayBufRef.current = { sig: "", buf: [], hasLive: false };
    mainSeriesSeededRef.current = false;
    overlaysBootstrappedRef.current = false;

    if (clearVisual) {
      try {
        indicatorLayerRef.current?.clearAllData?.();
      } catch {}
    }

    if (rebuild) {
      rebuildIndicatorLayer();
    }
  }

  function bootstrapOverlaysForCurrentChart(closed, live, instancesArg = null) {
    const layer = indicatorLayerRef.current;
    const chart = chartRef.current;
    if (!layer || !chart) return;

    const inst = Array.isArray(instancesArg)
      ? instancesArg
      : Array.isArray(indicatorInstancesRef.current)
      ? indicatorInstancesRef.current
      : [];

    try {
      layer.syncInstances(inst);
    } catch {}

    overlaysBootstrappedRef.current = true;

    if (inst.length) {
      try {
        const input = getOverlayBuffer(closed, live);
        if (Array.isArray(input) && input.length) {
          overlayLastRunRef.current = 0;
          layer.applyData(input, inst);
        }
      } catch {}
    }

    forceChartScaleRecovery();
  }

  function afterPrimarySeriesFrame(closed, live) {
    mainSeriesSeededRef.current = true;
    finishLoading();

    try {
      const detail = {
        symbol: normalizeActiveSymbol(symbol),
        timeframe: normalizeActiveTf(timeframe),
        closedCount: Array.isArray(closed) ? closed.length : 0,
        hasLive: !!live,
      };
      window.dispatchEvent(new CustomEvent("tp:chartReady", { detail }));
      window.dispatchEvent(new CustomEvent("tradepro:chart-ready", { detail }));
    } catch {}

    if (!overlaysBootstrappedRef.current) {
      bootstrapOverlaysForCurrentChart(closed, live);
      return;
    }

    scheduleOverlayApply(closed, live);
  }

  function ensureWatermarkPrimitive() {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    if (!backgroundUrl) {
      if (watermarkRef.current && typeof series.detachPrimitive === "function") {
        try {
          series.detachPrimitive(watermarkRef.current);
        } catch {}
      }
      watermarkRef.current = null;
      return;
    }

    if (!watermarkRef.current) {
      if (typeof series.attachPrimitive !== "function") {
        if (debugBackground) console.warn("[CHART_BG] attachPrimitive não suportado na sua versão do lightweight-charts");
        return;
      }
      try {
        watermarkRef.current = new WatermarkPrimitive({ chart, series });
        series.attachPrimitive(watermarkRef.current);
      } catch {
        watermarkRef.current = null;
        return;
      }
    }

    const sizePct = parseSizePct(backgroundSize);
    const anchor = normalizeAnchor(backgroundPosition);
    const fit = normalizeFit(backgroundFit);

    watermarkRef.current.setOptions({
      src: String(backgroundUrl),
      opacity: Math.max(0, Math.min(1, Number(backgroundOpacity) || 0)),
      sizePct,
      anchor,
      smoothing: !!backgroundSmoothing,
      fit,
    });

    if (debugBackground) {
      console.log("[CHART_BG] watermark aplicado", {
        backgroundUrl,
        backgroundOpacity,
        backgroundSize,
        backgroundPosition,
        backgroundFit: fit,
      });
    }
  }

  function ensureTradeOverlayContainer() {
    const container = containerRef.current;
    if (!container) return null;

    if (overlayElRef.current && overlayElRef.current.isConnected) return overlayElRef.current;

    try {
      const cs = window.getComputedStyle(container);
      if (cs.position === "static") container.style.position = "relative";
    } catch {}

    const el = document.createElement("div");
    el.setAttribute("data-trade-overlay", "true");
    el.style.position = "absolute";
    el.style.inset = "0";
    el.style.pointerEvents = "none";
    el.style.zIndex = "60";
    container.appendChild(el);

    overlayElRef.current = el;
    return el;
  }

  function rebuildTradeLinesManager() {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const overlay = ensureTradeOverlayContainer();
    if (!overlay) return;

    try {
      tradeLinesRef.current?.destroy?.();
    } catch {}
    tradeLinesRef.current = null;

    tradeLinesRef.current = new TradeLinesManager(chart, series, overlay);

    try {
      tradeLinesRef.current.syncTrades(Array.isArray(activeTrades) ? activeTrades : []);
    } catch {}
  }

  function clearLineMarker() {
    try {
      seriesRef.current?.setMarkers?.([]);
    } catch {}
    lastMarkerRef.current = { time: null, price: null };
  }

  function setLineMarker(time, price) {
    if (type !== "line") return;
    const series = seriesRef.current;
    if (!series?.setMarkers) return;

    const t = Number(time);
    const p = Number(price);
    if (!Number.isFinite(t) || !Number.isFinite(p)) return;

    const lm = lastMarkerRef.current;
    if (lm.time === t && lm.price === p) return;
    lastMarkerRef.current = { time: t, price: p };

    try {
      series.setMarkers([
        { time: t, position: "inBar", shape: "circle", color: "rgba(255,255,255,0.02)", size: 1 },
      ]);
    } catch {}
  }

  function ensurePulseStyle() {
    if (pulseStyleElRef.current) return;

    try {
      document.querySelectorAll('style[id^="tp-line-pulse-style-"]').forEach((el) => el.remove());
    } catch {}

    const styleId = "tp-line-pulse-style-v7";
    const style = document.createElement("style");
    style.id = styleId;

    style.textContent = `
      .tp-line-pulse-wrap { position:absolute; left:0; top:0; transform:translate(-50%,-50%); pointer-events:none; z-index:9999; }
      .tp-line-pulse-dot { width:3px; height:3px; border-radius:9999px; background:rgba(255,255,255,1); position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); }
      .tp-line-pulse-ring { width:8px; height:8px; border-radius:9999px; position:absolute; left:50%; top:50%; transform:translate(-50%, -50%) scale(1); background:transparent; border:1px solid rgba(255,255,255,0.95); opacity:0; will-change:transform,opacity; animation:tpPulseLoop 4.0s ease-out infinite; }
      @keyframes tpPulseLoop {
        0% { opacity: 1; transform: translate(-50%, -50%) scale(1); border-color: rgba(255,255,255,0.95); }
        55% { opacity: 0; transform: translate(-50%, -50%) scale(2.7); border-color: rgba(255,255,255,0.00); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(2.7); border-color: rgba(255,255,255,0.00); }
      }
    `;

    document.head.appendChild(style);
    pulseStyleElRef.current = style;
  }

  function ensurePulseEl() {
    const container = containerRef.current;
    if (!container) return null;

    if (!pulseElRef.current) {
      ensurePulseStyle();

      const wrap = document.createElement("div");
      wrap.className = "tp-line-pulse-wrap";
      wrap.style.display = "none";

      const ring = document.createElement("div");
      ring.className = "tp-line-pulse-ring";

      const dot = document.createElement("div");
      dot.className = "tp-line-pulse-dot";

      wrap.appendChild(ring);
      wrap.appendChild(dot);

      container.appendChild(wrap);
      pulseElRef.current = wrap;
    }
    return pulseElRef.current;
  }

  function hidePulse() {
    if (pulseElRef.current) pulseElRef.current.style.display = "none";
  }

  function startPulseFollow() {
    if (pulseRafRef.current) return;

    const tick = () => {
      pulseRafRef.current = requestAnimationFrame(tick);

      if (type !== "line") {
        hidePulse();
        return;
      }

      const chart = chartRef.current;
      const series = seriesRef.current;
      const el = ensurePulseEl();
      if (!chart || !series || !el) return;

      const { time, price } = lastMarkerRef.current || {};
      if (!Number.isFinite(Number(time)) || !Number.isFinite(Number(price))) {
        el.style.display = "none";
        return;
      }

      const x = chart.timeScale().timeToCoordinate(Number(time));
      const y = series.priceToCoordinate(Number(price));

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        el.style.display = "none";
        return;
      }

      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.display = "block";
    };

    pulseRafRef.current = requestAnimationFrame(tick);
  }

  function stopPulseFollow() {
    if (pulseRafRef.current) {
      try {
        cancelAnimationFrame(pulseRafRef.current);
      } catch {}
      pulseRafRef.current = 0;
    }
    hidePulse();
  }

  function resetLineBarsViewportController() {
    const st = lbViewportRef.current;

    try {
      st.unsubUserMove?.();
    } catch {}
    st.unsubUserMove = null;

    st.didPreset = false;
    st.didScheduleScroll = false;
    st.didScrollToRealTime = false;
    st.userMoved = false;
  }

  function ensureLineBarsUserMoveDetection() {
    const st = lbViewportRef.current;
    const chart = chartRef.current;
    if (!chart) return;

    if (st.unsubUserMove) return;

    try {
      const ts = chart.timeScale?.();
      if (!ts) return;

      const onUserRange = () => {
        if (st.didScrollToRealTime) st.userMoved = true;
      };

      ts.subscribeVisibleTimeRangeChange?.(onUserRange);
      ts.subscribeVisibleLogicalRangeChange?.(onUserRange);

      st.unsubUserMove = () => {
        try {
          ts.unsubscribeVisibleTimeRangeChange?.(onUserRange);
        } catch {}
        try {
          ts.unsubscribeVisibleLogicalRangeChange?.(onUserRange);
        } catch {}
      };
    } catch {}
  }

  function applyLineBarsViewportPresetOnce() {
    const st = lbViewportRef.current;
    const chart = chartRef.current;
    if (!chart) return;
    if (st.didPreset) return;

    const RIGHT_OFFSET = 15;
    const BAR_SPACING = 10.5;

    try {
      chart.timeScale().applyOptions({ rightOffset: RIGHT_OFFSET, barSpacing: BAR_SPACING, shiftVisibleRangeOnNewBar: false });
    } catch {}

    st.didPreset = true;
  }

  function ensurePrimaryInitialViewport(closedCount = 0, hasLive = false) {
    const chart = chartRef.current;
    if (!chart) return;

    ensureLineBarsUserMoveDetection();
    applyLineBarsViewportPresetOnce();

    const st = lbViewportRef.current;
    if (st.userMoved) return;

    const range = calcInitialVisibleLogicalRange(closedCount, hasLive);
    if (!range) return;

    try {
      chart.timeScale()?.setVisibleLogicalRange?.(range);
      st.didScrollToRealTime = true;
    } catch {
      scrollLineBarsToRealTimeOnceSafe();
    }
  }

  function scrollLineBarsToRealTimeOnceSafe() {
    const st = lbViewportRef.current;
    const chart = chartRef.current;
    if (!chart) return;

    if (st.didScheduleScroll || st.didScrollToRealTime) return;
    if (st.userMoved) return;

    st.didScheduleScroll = true;

    try {
      setTimeout(() => {
        try {
          if (lbViewportRef.current.userMoved) return;
          chart.timeScale()?.scrollToRealTime?.();
          lbViewportRef.current.didScrollToRealTime = true;
        } catch {}
      }, 0);
    } catch {}
  }

  function ensureLineBarsInitialViewport() {
    ensureLineBarsUserMoveDetection();
    applyLineBarsViewportPresetOnce();
    scrollLineBarsToRealTimeOnceSafe();
  }

  function createSeriesByType(t) {
    const chart = chartRef.current;
    if (!chart) return null;

    if (t === "line") {
      return chart.addAreaSeries({
        priceScaleId: "right",
        lineColor: "#ffffff",
        lineWidth: 1,
        topColor: "rgba(255,255,255,0.16)",
        bottomColor: "rgba(255,255,255,0.00)",
        crosshairMarkerVisible: false,
        lastValueVisible: true,
        priceLineVisible: true,
        lastPriceAnimation: "continuous",
        priceFormat: PRICE_FORMAT,
      });
    }

    if (t === "bars") {
      return chart.addBarSeries({
        priceScaleId: "right",
        upColor: "#00c176",
        downColor: "#ff4d4d",
        priceFormat: PRICE_FORMAT,
      });
    }

    return chart.addCandlestickSeries({
      priceScaleId: "right",
      upColor: "#00c176",
      downColor: "#ff4d4d",
      wickUpColor: "#00c176",
      wickDownColor: "#ff4d4d",
      lastValueVisible: true,
      priceLineVisible: true,
      priceFormat: PRICE_FORMAT,
    });
  }

  function inferStepFromClosed(arr, fallback = 60) {
    const a = Array.isArray(arr) ? arr : [];
    if (a.length >= 2) {
      const t2 = Number(a[a.length - 1]?.time);
      const t1 = Number(a[a.length - 2]?.time);
      const d = t2 - t1;
      if (Number.isFinite(d) && d > 0) return d;
    }
    return fallback;
  }

  function shouldEmitHistoryReset(closedArr) {
    const arr = Array.isArray(closedArr) ? closedArr : [];
    if (!arr.length) return false;

    const ft = Number(arr[0]?.time);
    const lt = Number(arr[arr.length - 1]?.time);
    const n = arr.length;

    if (!Number.isFinite(ft) || !Number.isFinite(lt) || !Number.isFinite(n)) return false;

    const meta = lastHistoryMetaRef.current || {
      armed: false,
      type: "",
      n: 0,
      ft: NaN,
      lt: NaN,
      step: 60,
    };

    const step = inferStepFromClosed(arr, Number(meta.step) || 60);
    const eps = Math.max(1, step * 0.15);

    if (!meta.armed || meta.type !== type) {
      lastHistoryMetaRef.current = { armed: true, type, n, ft, lt, step };
      return false;
    }

    const prev = meta;

    const ltDiff = lt - Number(prev.lt);
    const ftDiff = ft - Number(prev.ft);
    const nDiff = n - Number(prev.n);

    const normalSameSnapshot =
      Math.abs(ltDiff) <= eps && Math.abs(ftDiff) <= eps && Math.abs(nDiff) <= 1;

    const normalRollOrAppend =
      Math.abs(ltDiff - step) <= eps &&
      (Math.abs(ftDiff - step) <= eps || Math.abs(ftDiff) <= eps) &&
      Math.abs(nDiff) <= 1;

    lastHistoryMetaRef.current = { armed: true, type, n, ft, lt, step };

    if (normalSameSnapshot || normalRollOrAppend) return false;

    if (lt < Number(prev.lt) - eps) return true;
    if (Math.abs(ltDiff) > step * 5) return true;
    if (Math.abs(ftDiff) > step * 50) return true;
    if (Math.abs(nDiff) > Math.max(200, Number(prev.n) * 0.3)) return true;
    if (ltDiff > step * 2.2) return true;

    return true;
  }

  function emitHistoryReset(closed) {
    const arr = Array.isArray(closed) ? closed : [];
    if (!arr.length) return;

    if (!shouldEmitHistoryReset(arr)) return;

    historyEpochRef.current += 1;

    const epoch = historyEpochRef.current;
    const container = containerRef.current;

    const ft = Number(arr?.[0]?.time);
    const lt = Number(arr?.[arr.length - 1]?.time);

    console.log(
      `[HISTORY_RESET][MASTER] epoch=${epoch} type=${type} n=${arr.length} ft=${Number.isFinite(ft) ? ft : "NaN"} lt=${Number.isFinite(lt) ? lt : "NaN"}`
    );

    if (container?.dispatchEvent) {
      try {
        container.dispatchEvent(
          new CustomEvent(HISTORY_RESET_EVENT, {
            detail: { epoch, type, n: arr.length, ft, lt },
          })
        );
      } catch (e) {
        console.warn("[HISTORY_RESET][MASTER] dispatchEvent falhou", e);
      }
    }
  }

  // ===============================
  // 1) Cria chart UMA vez
  // ===============================
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (chartRef.current) return;

    startLoading();

    const rect = container.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    const chart = createChart(container, {
      width,
      height,
      layout: { background: { color: "rgba(0,0,0,0)" }, textColor: "#cbd5f5" },
      grid: { vertLines: { color: "#1e293b" }, horzLines: { color: "#1e293b" } },
      timeScale: {
        visible: Boolean(showTimeScale),
        timeVisible: Boolean(showTimeScale),
        secondsVisible: Boolean(showTimeScale),
        lockVisibleTimeRangeOnResize: true,
        shiftVisibleRangeOnNewBar: false,
        fixLeftEdge: false,
        rightBarStaysOnScroll: true,
        minBarSpacing: 2.45,
      },
      rightPriceScale: { autoScale: true, visible: true, borderVisible: false, minimumWidth: priceScaleMinWidth },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: false,
        pinch: true,
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
      },
      crosshair: { mode: CrosshairMode.Hidden },
    });

    try {
      const ts = chart.timeScale?.();
      const o = ts?.options?.() || {};
      const ro = Number(o?.rightOffset);
      const bs = Number(o?.barSpacing);

      const apply = { shiftVisibleRangeOnNewBar: false, fixLeftEdge: false, rightBarStaysOnScroll: true, minBarSpacing: 2.45 };

      if (!Number.isFinite(ro) || ro < 1) apply.rightOffset = 15;
      if (!Number.isFinite(bs) || bs <= 0) apply.barSpacing = 10.5;

      ts?.applyOptions?.(apply);
    } catch {}

    chartRef.current = chart;

    const series = chart.addCandlestickSeries({
      priceScaleId: "right",
      upColor: "#00c176",
      downColor: "#ff4d4d",
      wickUpColor: "#00c176",
      wickDownColor: "#ff4d4d",
      lastValueVisible: true,
      priceLineVisible: true,
      priceFormat: PRICE_FORMAT,
    });

    seriesRef.current = series;

    ensureWatermarkPrimitive();

    bridgeRef.current = new ChartBridge({ chart, series });
    indicatorLayerRef.current = new IndicatorLayer({ chart });
    resetOverlayRuntime({ clearVisual: false });

    ensureTradeOverlayContainer();
    rebuildTradeLinesManager();
    forceChartScaleRecovery();
    applyBootVisualSeed("chart_init");

    if (typeof onChartReadyRef.current === "function") {
      onChartReadyRef.current({ chart, container, series, getSeries: () => seriesRef.current });
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        const h = Math.floor(entry.contentRect.height);
        if (w > 0 && h > 0 && chartRef.current) {
          chartRef.current.applyOptions({ width: w, height: h });
          forceChartScaleRecovery();
        }
      }
    });
    ro.observe(container);
    resizeObsRef.current = ro;

    return () => {
      subTokenRef.current++;

      try {
        unsubRef.current?.();
      } catch {}
      try {
        resizeObsRef.current?.disconnect();
      } catch {}
      try {
        chartRef.current?.remove();
      } catch {}

      stopPulseFollow();

      try {
        tradeLinesRef.current?.destroy?.();
      } catch {}
      tradeLinesRef.current = null;

      try {
        overlayElRef.current?.remove?.();
      } catch {}
      overlayElRef.current = null;

      try {
        pulseElRef.current?.remove?.();
      } catch {}
      pulseElRef.current = null;

      resetOverlayRuntime({ clearVisual: false });
      try {
        indicatorLayerRef.current?.dispose?.();
      } catch {}
      indicatorLayerRef.current = null;

      try {
        lbViewportRef.current.unsubUserMove?.();
      } catch {}
      lbViewportRef.current.unsubUserMove = null;

      watermarkRef.current = null;

      unsubRef.current = null;
      resizeObsRef.current = null;

      chartRef.current = null;
      seriesRef.current = null;
      bridgeRef.current = null;

      if (typeof onChartReadyRef.current === "function") {
        onChartReadyRef.current(null);
      }

      lastMarkerRef.current = { time: null, price: null };
      lastClosedCandlesRef.current = [];
      lastLiveCandleRef.current = null;
      lbDataRef.current = { seeded: false, lastClosedTime: null, lastClosedCount: 0, firstClosedTime: null };
      lbPendingLiveRef.current = null;
      resetLineBarsViewportController();
      lastEngineObjRef.current = null;

      historyEpochRef.current = 0;
      lastHistoryMetaRef.current = { armed: false, type: "", n: 0, ft: NaN, lt: NaN, step: 60 };

      try {
        CrosshairStore.clear();
      } catch {}

      finishLoading();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    ensureWatermarkPrimitive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundUrl, backgroundOpacity, backgroundSize, backgroundPosition, backgroundSmoothing, backgroundFit]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    try {
      series.applyOptions?.({ priceFormat: PRICE_FORMAT });
    } catch {}
  }, [PRICE_FORMAT]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      chart.applyOptions({
        timeScale: {
          visible: Boolean(showTimeScale),
          timeVisible: Boolean(showTimeScale),
          secondsVisible: Boolean(showTimeScale),
          lockVisibleTimeRangeOnResize: true,
          shiftVisibleRangeOnNewBar: false,
        fixLeftEdge: false,
        rightBarStaysOnScroll: true,
        minBarSpacing: 2.45,
        },
        rightPriceScale: {
          autoScale: !manualPriceScaleRef.current,
          visible: true,
          borderVisible: false,
          minimumWidth: priceScaleMinWidth,
        },
        handleScroll: {
          mouseWheel: false,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: manualPriceScaleRef.current,
        },
        handleScale: {
          mouseWheel: false,
          pinch: true,
          axisPressedMouseMove: {
            time: true,
            price: true,
          },
        },
        crosshair: { mode: CrosshairMode.Hidden },
      });
    } catch {}

    forceChartScaleRecovery();
  }, [showTimeScale, priceScaleMinWidth]);

  useEffect(() => {
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container) return;

    const markManualPriceScale = (clientX) => {
      const host = containerRef.current;
      const chartApi = chartRef.current;
      if (!host || !chartApi) return;

      const rect = host.getBoundingClientRect();
      const x = Number(clientX) - rect.left;
      if (!Number.isFinite(x)) return;

      const rightScaleWidth = getRightPriceScaleWidth(chartApi, priceScaleMinWidth);
      const startX = Math.max(0, rect.width - rightScaleWidth - 8);
      if (x < startX) return;

      if (manualPriceScaleRef.current) return;
      manualPriceScaleRef.current = true;

      try {
        chartApi.applyOptions({
          rightPriceScale: {
            autoScale: false,
            visible: true,
            borderVisible: false,
            minimumWidth: priceScaleMinWidth,
          },
          handleScroll: {
            mouseWheel: false,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: true,
          },
          handleScale: {
            mouseWheel: false,
            pinch: true,
            axisPressedMouseMove: { time: true, price: true },
          },
        });
      } catch {}
    };

    const onMouseDown = (event) => markManualPriceScale(event.clientX);
    const onTouchStart = (event) => {
      const touch = event?.touches?.[0];
      if (touch) markManualPriceScale(touch.clientX);
    };

    container.addEventListener("mousedown", onMouseDown, true);
    container.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });

    return () => {
      container.removeEventListener("mousedown", onMouseDown, true);
      container.removeEventListener("touchstart", onTouchStart, true);
    };
  }, [priceScaleMinWidth]);

  useEffect(() => {
    manualPriceScaleRef.current = false;
    forceChartScaleRecovery({ resetPriceScale: true });
  }, [currentPairKey, type, priceScaleMinWidth, showTimeScale]);

  useEffect(() => {
    const handler = () => {
      manualPriceScaleRef.current = false;
      forceChartScaleRecovery({ resetPriceScale: true });
    };

    if (typeof window !== "undefined") {
      window.addEventListener(PRICE_SCALE_RESET_EVENT, handler);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(PRICE_SCALE_RESET_EVENT, handler);
      }
    };
  }, [priceScaleMinWidth, showTimeScale]);

  // ============================================================
  // ✅ CrosshairStore vindo do LWC
  // ============================================================
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

    const onMove = (param) => {
      try {
        if (!param || param.time == null) {
          CrosshairStore.clear();
          return;
        }

        const t = normalizeTimeToSeconds(param.time);
        if (!Number.isFinite(Number(t))) {
          CrosshairStore.clear();
          return;
        }

        const x = Number(param?.point?.x);
        const l = Number(param?.logical);

        let p = NaN;

        const sp = param.seriesPrices;
        if (sp && typeof sp.get === "function") {
          const v = sp.get(series);
          p = Number(v);
          if (!Number.isFinite(p)) {
            try {
              const it = sp.values?.();
              const first = it?.next?.()?.value;
              p = Number(first);
            } catch {}
          }
        }

        if (!Number.isFinite(p)) {
          try {
            const anyPrice = param?.price;
            p = Number(anyPrice);
          } catch {}
        }

        if (!Number.isFinite(p)) return;

        CrosshairStore.set({
          t: Number(t),
          p,
          x: Number.isFinite(x) ? x : NaN,
          l: Number.isFinite(l) ? l : NaN,
          at: now(),
        });
      } catch {}
    };

    try {
      chart.subscribeCrosshairMove(onMove);
    } catch {}

    return () => {
      try {
        chart.unsubscribeCrosshairMove(onMove);
      } catch {}
    };
  }, [type]);

  useEffect(() => {
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container) return;

    const timeScale = chart.timeScale?.();
    if (!timeScale) return;

    const MIN_LEFT_FROM = -8;
    const MAX_VISIBLE_BARS = 320;
    const MIN_VISIBLE_BARS = 12;
    const RIGHT_OFFSET = 15;

    let rafId = 0;
    let queuedEvent = null;

    const applyWheelZoom = (event) => {
      const chartApi = chartRef.current;
      const host = containerRef.current;
      const ts = chartApi?.timeScale?.();
      if (!chartApi || !host || !ts) return;

      const rect = host.getBoundingClientRect();
      const width = Math.max(1, rect.width || host.clientWidth || 1);
      const x = Number(event.clientX) - rect.left;
      if (!Number.isFinite(x) || x < 0 || x > width) return;

      const range = ts.getVisibleLogicalRange?.();
      if (!range) return;

      const from = Number(range.from);
      const to = Number(range.to);
      const currentSpan = to - from;
      if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(currentSpan) || currentSpan <= 0.0001) {
        return;
      }

      let anchorLogical = Number(ts.coordinateToLogical?.(x));
      if (!Number.isFinite(anchorLogical)) {
        const snap = CrosshairStore?.get?.() || null;
        const logicalFromCrosshair = Number(snap?.l);
        if (Number.isFinite(logicalFromCrosshair)) {
          anchorLogical = logicalFromCrosshair;
        } else {
          const ratio = clampNumber(x / width, 0, 1);
          anchorLogical = from + currentSpan * ratio;
        }
      }

      const anchorRatio = clampNumber((anchorLogical - from) / currentSpan, 0, 1);
      const zoomIn = Number(event.deltaY) < 0;
      const zoomFactor = zoomIn ? 0.88 : 1.12;
      let nextSpan = currentSpan * zoomFactor;

      const closedCount = Array.isArray(lastClosedCandlesRef.current) ? lastClosedCandlesRef.current.length : 0;
      const hasLive = !!lastLiveCandleRef.current;
      const totalBars = Math.max(0, closedCount) + (hasLive ? 1 : 0);

      // ✅ IMPORTANTE:
      // Durante o WHEEL, nunca "puxar" o gráfico para trás só para reenquadrar
      // no teto soberano de rightOffset. Se o range atual já estiver mais à direita,
      // usamos o TO atual como teto temporário do zoom. Assim o wheel fica livre,
      // sem recálculo lateral antes de aplicar o zoom.
      const fixedMaxTo = Math.max(RIGHT_OFFSET + 1, (totalBars - 1) + RIGHT_OFFSET);
      const effectiveMaxTo = Math.max(fixedMaxTo, to);
      const hardMaxSpan = Math.max(MIN_VISIBLE_BARS, Math.min(MAX_VISIBLE_BARS, effectiveMaxTo - MIN_LEFT_FROM));

      nextSpan = clampNumber(nextSpan, MIN_VISIBLE_BARS, hardMaxSpan);

      let nextFrom = anchorLogical - anchorRatio * nextSpan;
      let nextTo = nextFrom + nextSpan;

      if (nextFrom < MIN_LEFT_FROM) {
        const shift = MIN_LEFT_FROM - nextFrom;
        nextFrom += shift;
        nextTo += shift;
      }

      if (nextTo > effectiveMaxTo) {
        const shift = nextTo - effectiveMaxTo;
        nextFrom -= shift;
        nextTo -= shift;
      }

      if (nextFrom < MIN_LEFT_FROM) {
        nextFrom = MIN_LEFT_FROM;
        nextTo = nextFrom + nextSpan;
      }

      const currentMid = from + currentSpan / 2;
      const nextMid = nextFrom + nextSpan / 2;
      if (Math.abs(nextSpan - currentSpan) < 0.0001 && Math.abs(nextMid - currentMid) < 0.0001) {
        return;
      }

      try {
        ts.setVisibleLogicalRange?.({ from: nextFrom, to: nextTo });
      } catch {}
    };

    const flushWheel = () => {
      rafId = 0;
      const event = queuedEvent;
      queuedEvent = null;
      if (event) applyWheelZoom(event);
    };

    const onWheel = (event) => {
      if (!event) return;
      event.preventDefault();
      event.stopPropagation();
      queuedEvent = {
        clientX: event.clientX,
        deltaY: event.deltaY,
      };
      if (!rafId) {
        rafId = requestAnimationFrame(flushWheel);
      }
    };

    container.addEventListener("wheel", onWheel, { passive: false, capture: true });

    return () => {
      if (rafId) {
        try {
          cancelAnimationFrame(rafId);
        } catch {}
        rafId = 0;
      }
      queuedEvent = null;
      try {
        container.removeEventListener("wheel", onWheel, true);
      } catch {}
    };
  }, []);

  // ✅ overlays só sobem depois que a série principal já nasceu neste chart
  useEffect(() => {
    const layer = indicatorLayerRef.current;
    if (!layer) return;

    const inst = Array.isArray(indicatorInstances) ? indicatorInstances : [];

    if (!mainSeriesSeededRef.current) {
      return;
    }

    if (!overlaysBootstrappedRef.current) {
      const closed = Array.isArray(lastClosedCandlesRef.current) ? lastClosedCandlesRef.current : [];
      const live = lastLiveCandleRef.current;
      bootstrapOverlaysForCurrentChart(closed, live, inst);
      return;
    }

    try {
      layer.syncInstances(inst);
    } catch {}

    try {
      const closed = Array.isArray(lastClosedCandlesRef.current) ? lastClosedCandlesRef.current : [];
      const live = lastLiveCandleRef.current;
      const input = getOverlayBuffer(closed, live);
      if (input.length) {
        overlayLastRunRef.current = 0;
        layer.applyData(input, inst);
      }
    } catch {}

    forceChartScaleRecovery();
  }, [indicatorInstances, priceScaleMinWidth]);

  // ===============================
  // 1.1) Troca série quando chartType muda
  // ===============================
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    startLoading();

    if (typeof unsubRef.current === "function") {
      try {
        unsubRef.current();
      } catch {}
      unsubRef.current = null;
    }

    if (seriesRef.current) {
      try {
        chart.removeSeries(seriesRef.current);
      } catch {}
      seriesRef.current = null;
    }

    lbDataRef.current = { seeded: false, lastClosedTime: null, lastClosedCount: 0, firstClosedTime: null };
    lbPendingLiveRef.current = null;
    resetLineBarsViewportController();
    resetOverlayRuntime({ clearVisual: false, rebuild: true });

    clearLineMarker();
    stopPulseFollow();

    const nextSeries = createSeriesByType(type);
    seriesRef.current = nextSeries;

    watermarkRef.current = null;
    ensureWatermarkPrimitive();

    bridgeRef.current = new ChartBridge({ chart, series: nextSeries });
    try {
      bridgeRef.current.setRenderMode?.(type === "heikin" ? "heikin" : "candles");
    } catch {}

    rebuildTradeLinesManager();

    if (type === "line") startPulseFollow();

    try {
      seriesRef.current?.setData?.([]);
    } catch {}

    lastHistoryMetaRef.current = { armed: false, type: "", n: 0, ft: NaN, lt: NaN, step: 60 };

    forceChartScaleRecovery();

    subTokenRef.current++;
  }, [type, PRICE_FORMAT]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===============================
  // 2) Subscribe engine
  // ===============================
  useEffect(() => {
    subTokenRef.current++;
    const myToken = subTokenRef.current;

    startLoading();

    const chart = chartRef.current;
    if (!chart) return;

    const engineChanged = lastEngineObjRef.current !== engine;
    if (engineChanged) {
      lastEngineObjRef.current = engine;

      lbDataRef.current = { seeded: false, lastClosedTime: null, lastClosedCount: 0, firstClosedTime: null };
      lbPendingLiveRef.current = null;
      resetLineBarsViewportController();
      resetOverlayRuntime({ clearVisual: false, rebuild: true });

      clearLineMarker();
      if (type !== "line") stopPulseFollow();

      try {
        if (seriesRef.current) chart.removeSeries(seriesRef.current);
      } catch {}
      seriesRef.current = null;

      const nextSeries = createSeriesByType(type);
      seriesRef.current = nextSeries;

      watermarkRef.current = null;
      ensureWatermarkPrimitive();

      bridgeRef.current = new ChartBridge({ chart, series: nextSeries });
      try {
        bridgeRef.current.setRenderMode?.(type === "heikin" ? "heikin" : "candles");
      } catch {}

      rebuildTradeLinesManager();

      if (type === "line") startPulseFollow();

      try {
        seriesRef.current?.setData?.([]);
      } catch {}

      applyBootVisualSeed("type_swap");

      historyEpochRef.current = 0;
      lastHistoryMetaRef.current = { armed: false, type: "", n: 0, ft: NaN, lt: NaN, step: 60 };
      forceChartScaleRecovery();
    } else {
      lbDataRef.current = { seeded: false, lastClosedTime: null, lastClosedCount: 0, firstClosedTime: null };
      lbPendingLiveRef.current = null;
      resetLineBarsViewportController();
      resetOverlayRuntime({ clearVisual: false });
      clearLineMarker();
      forceChartScaleRecovery();
    }

    if (typeof unsubRef.current === "function") {
      try {
        unsubRef.current();
      } catch {}
      unsubRef.current = null;
    }

    const bridge = bridgeRef.current;
    const series = seriesRef.current;

    if (!engine || !bridge || !series || !chart) return;

    if (type !== "line" && type !== "bars") {
      try {
        bridge.clear();
      } catch {}
    }
    try {
      bridge.setRenderMode?.(type === "heikin" ? "heikin" : "candles");
    } catch {}

    unsubRef.current = engine.subscribeCandles((candles, liveCandle) => {
      if (subTokenRef.current !== myToken) return;

      const closed = Array.isArray(candles) ? candles : [];
      if (closed.length) lastClosedCandlesRef.current = closed;

      lastLiveCandleRef.current = liveCandle ? { ...liveCandle } : null;

      if (closed.length) {
        emitHistoryReset(closed);
      }

      if (type === "line") {
        const st = lbDataRef.current;

        if (!st.seeded && closed.length === 0) {
          if (liveCandle) {
            lbPendingLiveRef.current = { ...liveCandle };
            finishLoading();
          }
          return;
        }

        if (closed.length) {
          const firstT = Number(closed[0]?.time);
          const lastT = Number(closed[closed.length - 1]?.time);
          const mustSeed = !st.seeded;
          const changedLast = Number.isFinite(lastT) && st.lastClosedTime !== lastT;
          const changedCount = Number(closed.length) !== Number(st.lastClosedCount || 0);
          const changedFirst = Number.isFinite(firstT) && Number(st.firstClosedTime) !== firstT;
          const needsResetData = mustSeed || changedLast || changedCount || changedFirst;

          if (needsResetData) {
            st.seeded = true;
            st.lastClosedTime = Number.isFinite(lastT) ? lastT : st.lastClosedTime;
            st.lastClosedCount = closed.length;
            st.firstClosedTime = Number.isFinite(firstT) ? firstT : st.firstClosedTime;

            const lineData = closed
              .map((c) => ({ time: Number(c.time), value: Number(c.close) }))
              .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value));

            try {
              series.setData(lineData);
            } catch {}
            ensurePrimaryInitialViewport(closed.length, !!liveCandle);

            const pending = lbPendingLiveRef.current;
            if (pending) {
              const t = Number(pending.time);
              const v = Number(pending.close);
              lbPendingLiveRef.current = null;

              if (Number.isFinite(t) && Number.isFinite(v)) {
                try {
                  series.update({ time: t, value: v });
                } catch {}
                setLineMarker(t, v);
              }
            }
          }
        }

        if (liveCandle) {
          const t = Number(liveCandle.time);
          const v = Number(liveCandle.close);
          if (Number.isFinite(t) && Number.isFinite(v)) {
            try {
              series.update({ time: t, value: v });
            } catch {}
            setLineMarker(t, v);
          }
        } else {
          if (st.seeded && closed.length) {
            const last = closed[closed.length - 1];
            const t = Number(last?.time);
            const v = Number(last?.close);
            if (Number.isFinite(t) && Number.isFinite(v)) setLineMarker(t, v);
          }
        }

        forceChartScaleRecovery();
        afterPrimarySeriesFrame(closed, liveCandle || null);
        return;
      }

      if (type === "bars") {
        const st = lbDataRef.current;

        if (!st.seeded && closed.length === 0) {
          if (liveCandle) {
            lbPendingLiveRef.current = { ...liveCandle };
            finishLoading();
          }
          return;
        }

        if (closed.length) {
          const firstT = Number(closed[0]?.time);
          const lastT = Number(closed[closed.length - 1]?.time);
          const mustSeed = !st.seeded;
          const changedLast = Number.isFinite(lastT) && st.lastClosedTime !== lastT;
          const changedCount = Number(closed.length) !== Number(st.lastClosedCount || 0);
          const changedFirst = Number.isFinite(firstT) && Number(st.firstClosedTime) !== firstT;
          const needsResetData = mustSeed || changedLast || changedCount || changedFirst;

          if (needsResetData) {
            st.seeded = true;
            st.lastClosedTime = Number.isFinite(lastT) ? lastT : st.lastClosedTime;
            st.lastClosedCount = closed.length;
            st.firstClosedTime = Number.isFinite(firstT) ? firstT : st.firstClosedTime;

            const barData = closed
              .map((c) => ({
                time: Number(c.time),
                open: Number(c.open),
                high: Number(c.high),
                low: Number(c.low),
                close: Number(c.close),
              }))
              .filter(
                (c) =>
                  Number.isFinite(c.time) &&
                  Number.isFinite(c.open) &&
                  Number.isFinite(c.high) &&
                  Number.isFinite(c.low) &&
                  Number.isFinite(c.close)
              );

            try {
              series.setData(barData);
            } catch {}
            ensurePrimaryInitialViewport(closed.length, !!liveCandle);

            const pending = lbPendingLiveRef.current;
            if (pending) {
              const lc = {
                time: Number(pending.time),
                open: Number(pending.open),
                high: Number(pending.high),
                low: Number(pending.low),
                close: Number(pending.close),
              };
              lbPendingLiveRef.current = null;

              if (
                Number.isFinite(lc.time) &&
                Number.isFinite(lc.open) &&
                Number.isFinite(lc.high) &&
                Number.isFinite(lc.low) &&
                Number.isFinite(lc.close)
              ) {
                try {
                  series.update(lc);
                } catch {}
              }
            }
          }
        }

        if (liveCandle) {
          const lc = {
            time: Number(liveCandle.time),
            open: Number(liveCandle.open),
            high: Number(liveCandle.high),
            low: Number(liveCandle.low),
            close: Number(liveCandle.close),
          };
          if (
            Number.isFinite(lc.time) &&
            Number.isFinite(lc.open) &&
            Number.isFinite(lc.high) &&
            Number.isFinite(lc.low) &&
            Number.isFinite(lc.close)
          ) {
            try {
              series.update(lc);
            } catch {}
          }
        }

        forceChartScaleRecovery();
        afterPrimarySeriesFrame(closed, liveCandle || null);
        return;
      }

      if (closed.length > 0 || liveCandle) {
        bridge.update(closed, liveCandle || null);
        ensurePrimaryInitialViewport(closed.length, !!liveCandle);
        forceChartScaleRecovery();
        afterPrimarySeriesFrame(closed, liveCandle || null);
      }
    });

    return () => {
      subTokenRef.current++;
      if (typeof unsubRef.current === "function") {
        try {
          unsubRef.current();
        } catch {}
        unsubRef.current = null;
      }
    };
  }, [engine, type]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pairCandlesCount > 0 || pairHasLive) return;
    applyBootVisualSeed("pair_key_effect");
  }, [currentPairKey, type, pairCandlesCount, pairHasLive]);

  useEffect(() => {
    const mgr = tradeLinesRef.current;
    if (!mgr) return;
    try {
      mgr.syncTrades(Array.isArray(activeTrades) ? activeTrades : []);
    } catch {}
  }, [activeTrades]);

  return (
    <div ref={wrapperRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", position: "relative" }}
      />
    </div>
  );
} 