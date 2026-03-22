// src/components/Chart/Chart.jsx
import { useEffect, useMemo, useRef } from "react";
import { createChart } from "lightweight-charts";
import { chartConfig } from "./chart.config";
import ChartBridge from "./ChartBridge";
import { useCandleEngine } from "@/context/CandleContext";
import { useChartView } from "@/context/ChartViewContext";
import { useTrade } from "@/context/TradeContext";
import TradeLinesManager from "../TradeLines/TradeLinesManager";
import styles from "./Chart.module.css";

// ✅ SOBERANO: CrosshairStore alimentado direto do LWC
import { CrosshairStore } from "@/components/Chart/Drawings/crosshair/CrosshairStore";

console.log("[CHART] render");

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

export default function Chart() {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const bridgeRef = useRef(null);

  const unsubRef = useRef(null);
  const resizeObsRef = useRef(null);
  const subTokenRef = useRef(0);

  const overlayElRef = useRef(null);
  const tradeLinesRef = useRef(null);

  const engine = useCandleEngine();
  const { chartType } = useChartView();
  const { activeTrades } = useTrade();

  const type = useMemo(() => {
    const t = String(chartType || "candles").toLowerCase();
    if (t === "line" || t === "bars" || t === "heikin") return t;
    return "candles";
  }, [chartType]);

  function ensureOverlayContainer(container) {
    if (!container) return null;

    const cs = window.getComputedStyle(container);
    if (cs.position === "static") container.style.position = "relative";

    if (overlayElRef.current && overlayElRef.current.isConnected) return overlayElRef.current;

    const el = document.createElement("div");
    el.setAttribute("data-trade-overlay", "true");
    el.style.position = "absolute";
    el.style.inset = "0";
    el.style.pointerEvents = "none";
    el.style.zIndex = "50";

    container.appendChild(el);
    overlayElRef.current = el;
    return el;
  }

  function rebuildTradeLinesManager() {
    const container = containerRef.current;
    const series = seriesRef.current;
    if (!container || !series) return;

    const overlay = ensureOverlayContainer(container);
    if (!overlay) return;

    try { tradeLinesRef.current?.destroy?.(); } catch {}
    tradeLinesRef.current = null;

    tradeLinesRef.current = new TradeLinesManager(series, overlay);

    try {
      tradeLinesRef.current.syncTrades(Array.isArray(activeTrades) ? activeTrades : []);
    } catch {}
  }

  // ===============================
  // 1) Cria Chart UMA VEZ
  // ===============================
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (chartRef.current) return;

    const chart = createChart(container, {
      width: Math.max(1, container.clientWidth),
      height: Math.max(1, container.clientHeight),
      ...chartConfig,
    });

    chartRef.current = chart;

    const series = chart.addCandlestickSeries(chartConfig.candleSeries);
    seriesRef.current = series;

    bridgeRef.current = new ChartBridge({ chart, series });

    ensureOverlayContainer(container);
    rebuildTradeLinesManager();

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

        let p = NaN;
        const sp = param.seriesPrices;
        if (sp && typeof sp.get === "function") {
          p = Number(sp.get(series));
          if (!Number.isFinite(p)) {
            try {
              const it = sp.values?.();
              p = Number(it?.next?.()?.value);
            } catch {}
          }
        }

        if (!Number.isFinite(p)) return;

        CrosshairStore.set({ t: Number(t), p, at: now() });
      } catch {}
    };

    try { chart.subscribeCrosshairMove(onMove); } catch {}

    const ro = new ResizeObserver(() => {
      if (!chartRef.current || !containerRef.current) return;
      const w = Math.floor(containerRef.current.clientWidth);
      const h = Math.floor(containerRef.current.clientHeight);
      if (w > 0 && h > 0) chartRef.current.applyOptions({ width: w, height: h });
    });

    ro.observe(container);
    resizeObsRef.current = ro;

    return () => {
      subTokenRef.current++;

      try { unsubRef.current?.(); } catch {}
      unsubRef.current = null;

      try { resizeObsRef.current?.disconnect(); } catch {}
      resizeObsRef.current = null;

      try { tradeLinesRef.current?.destroy?.(); } catch {}
      tradeLinesRef.current = null;

      try { overlayElRef.current?.remove?.(); } catch {}
      overlayElRef.current = null;

      try { chartRef.current?.unsubscribeCrosshairMove?.(onMove); } catch {}
      try { CrosshairStore.clear(); } catch {}

      try { chartRef.current?.remove(); } catch {}

      chartRef.current = null;
      seriesRef.current = null;
      bridgeRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ===============================
  // ✅ 1.1) Troca de série quando chartType muda
  // ===============================
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (typeof unsubRef.current === "function") {
      try { unsubRef.current(); } catch {}
      unsubRef.current = null;
    }

    if (seriesRef.current) {
      try { chart.removeSeries(seriesRef.current); } catch {}
      seriesRef.current = null;
    }

    let nextSeries = null;

    if (type === "line") {
      nextSeries = chart.addLineSeries({
        color: "#ffffff",
        lineWidth: 2,
      });
    } else if (type === "bars") {
      nextSeries = chart.addBarSeries({
        upColor: "#00c176",
        downColor: "#ff4d4d",
      });
    } else {
      nextSeries = chart.addCandlestickSeries(chartConfig.candleSeries);
    }

    seriesRef.current = nextSeries;

    bridgeRef.current = new ChartBridge({ chart, series: nextSeries });

    try {
      bridgeRef.current.setRenderMode?.(type === "heikin" ? "heikin" : "candles");
    } catch {}

    rebuildTradeLinesManager();

    subTokenRef.current++;
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===============================
  // 2) Subscribe Engine
  // ===============================
  useEffect(() => {
    subTokenRef.current++;
    const myToken = subTokenRef.current;

    if (typeof unsubRef.current === "function") {
      try { unsubRef.current(); } catch {}
      unsubRef.current = null;
    }

    const bridge = bridgeRef.current;
    if (!engine || !bridge) return;

    try { bridge.clear(); } catch {}
    try { bridge.setRenderMode?.(type === "heikin" ? "heikin" : "candles"); } catch {}

    console.log("[CHART] ⚡ Subscrevendo Engine...");

    unsubRef.current = engine.subscribeCandles((candles, liveCandle) => {
      if (subTokenRef.current !== myToken) return;

      if ((candles && candles.length > 0) || liveCandle) {
        if (type === "line") {
          const closed = Array.isArray(candles) ? candles : [];
          const lineData = closed
            .map((c) => ({
              time: Number(c.time),
              value: Number(c.close),
            }))
            .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value));

          if (lineData.length) {
            try { seriesRef.current?.setData(lineData); } catch {}
          }

          if (
            liveCandle &&
            Number.isFinite(Number(liveCandle.time)) &&
            Number.isFinite(Number(liveCandle.close))
          ) {
            try {
              seriesRef.current?.update({
                time: Number(liveCandle.time),
                value: Number(liveCandle.close),
              });
            } catch {}
          }

          return;
        }

        if (type === "bars") {
          const closed = Array.isArray(candles) ? candles : [];
          const barData = closed
            .map((c) => ({
              time: Number(c.time),
              open: Number(c.open),
              high: Number(c.high),
              low: Number(c.low),
              close: Number(c.close),
            }))
            .filter((c) =>
              Number.isFinite(c.time) &&
              Number.isFinite(c.open) &&
              Number.isFinite(c.high) &&
              Number.isFinite(c.low) &&
              Number.isFinite(c.close)
            );

          if (barData.length) {
            try { seriesRef.current?.setData(barData); } catch {}
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
              try { seriesRef.current?.update(lc); } catch {}
            }
          }

          return;
        }

        bridge.update(candles || [], liveCandle || null);
      }
    });

    return () => {
      subTokenRef.current++;
      if (typeof unsubRef.current === "function") {
        try { unsubRef.current(); } catch {}
        unsubRef.current = null;
      }
    };
  }, [engine, type]);

  // ===============================
  // 3) Sync trade lines
  // ===============================
  useEffect(() => {
    const mgr = tradeLinesRef.current;
    if (!mgr) return;

    try {
      mgr.syncTrades(Array.isArray(activeTrades) ? activeTrades : []);
    } catch {}
  }, [activeTrades]);

  return <div ref={containerRef} className={styles.chartRoot} />;
}
