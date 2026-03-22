// src/components/chart/panes/TimeScaleFooterChart.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, CrosshairMode } from "lightweight-charts";

function safeNum(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : NaN;
}

/**
 * Formatter local consistente (mesmo comportamento de corretoras):
 * - usa timezone do próprio navegador (ex: America/Sao_Paulo)
 */
function makeLocalTimeFormatters() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;

  const timeFmt = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const tickFmt = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return {
    timeFormatter: (t) => timeFmt.format(new Date(Number(t) * 1000)),
    tickMarkFormatter: (t) => tickFmt.format(new Date(Number(t) * 1000)),
  };
}

/**
 * Dados invisíveis para "dar vida" ao timeScale e estender o futuro.
 */
function buildAnchorDataWithFuture(candles, liveCandle, futureBars = 300) {
  const closed = Array.isArray(candles) ? candles : [];
  const out = [];

  for (const c of closed) {
    const t = safeNum(c?.time);
    if (!Number.isFinite(t)) continue;
    out.push({ time: t, value: 0 });
  }

  if (liveCandle) {
    const lt = safeNum(liveCandle?.time);
    if (Number.isFinite(lt)) {
      const last = out[out.length - 1];
      if (!last || safeNum(last.time) !== lt) out.push({ time: lt, value: 0 });
    }
  }

  if (out.length < 1) return out;

  // Detecta step (timeframe) pelo histórico. Fallback 60s.
  let step = 60;
  if (out.length >= 2) {
    const t1 = safeNum(out[out.length - 2]?.time);
    const t2 = safeNum(out[out.length - 1]?.time);
    const d = t2 - t1;
    if (Number.isFinite(d) && d > 0) step = d;
  }

  const lastTime = safeNum(out[out.length - 1].time);
  if (!Number.isFinite(lastTime) || !Number.isFinite(step) || step <= 0) return out;

  for (let i = 1; i <= futureBars; i++) {
    out.push({ time: lastTime + step * i, value: 0 });
  }

  return out;
}

function getMasterRightScaleWidth(masterChart) {
  if (!masterChart) return NaN;
  try {
    const ps = masterChart.priceScale?.("right");
    const w = ps?.width?.();
    const n = Number(w);
    return Number.isFinite(n) && n > 0 ? n : NaN;
  } catch {
    return NaN;
  }
}

function getMasterTimeScaleOpts(masterChart) {
  if (!masterChart) return null;
  try {
    const ts = masterChart.timeScale?.();
    const o = ts?.options?.();
    return o || null;
  } catch {
    return null;
  }
}

function getMasterVisibleLogicalRange(masterChart) {
  if (!masterChart) return null;
  try {
    const ts = masterChart.timeScale?.();
    const r = ts?.getVisibleLogicalRange?.();
    return r || null;
  } catch {
    return null;
  }
}

export default function TimeScaleFooterChart({
  engine,
  masterChart,
  masterContainer,
  height = 28,

  // ✅ AJUSTE MÍNIMO: default transparente (para mostrar a imagem do workspace por baixo)
  background = "transparent",
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const anchorSeriesRef = useRef(null);

  const roRef = useRef(null);
  const unsubEngineRef = useRef(null);

  const lastAppliedRightWidthRef = useRef(NaN);
  const rafWatchRef = useRef(0);

  const createRetryTimerRef = useRef(0);

  // ✅ Sync soberano por LOGICAL RANGE (sem teleporte)
  const syncRef = useRef({
    raf: 0,
    active: false,
    unsub: null,
    pendingRange: null,
    lastFrom: NaN,
    lastTo: NaN,
    lastBs: NaN,
    lastRo: NaN,
  });

  const [footerReady, setFooterReady] = useState(false);

  const { timeFormatter, tickMarkFormatter } = useMemo(() => makeLocalTimeFormatters(), []);

  useEffect(() => {
    let cancelled = false;
    let created = false;
    let tries = 0;

    setFooterReady(false);

    const cleanupChart = () => {
      try { roRef.current?.disconnect?.(); } catch {}
      roRef.current = null;

      try { chartRef.current?.remove?.(); } catch {}
      chartRef.current = null;

      anchorSeriesRef.current = null;
    };

    const clearRetry = () => {
      if (createRetryTimerRef.current) {
        try { clearTimeout(createRetryTimerRef.current); } catch {}
        createRetryTimerRef.current = 0;
      }
    };

    const tryCreate = () => {
      if (cancelled || created) return;

      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(height);

      if (w < 60 || h < 8) {
        tries += 1;
        if (tries <= 40) {
          clearRetry();
          createRetryTimerRef.current = setTimeout(tryCreate, 50);
        }
        return;
      }

      cleanupChart();

      const masterTsOpts = getMasterTimeScaleOpts(masterChart);
      const rightOffsetFallback = Number.isFinite(Number(masterTsOpts?.rightOffset))
        ? Number(masterTsOpts.rightOffset)
        : 15;

      const barSpacingFallback = Number.isFinite(Number(masterTsOpts?.barSpacing))
        ? Number(masterTsOpts.barSpacing)
        : undefined;

      const chart = createChart(el, {
        width: Math.max(1, w),
        height: Math.max(1, h),

        // ✅ fundo transparente real
        layout: { background: { color: "rgba(0,0,0,0)" }, textColor: "#cbd5f5" },
        localization: { timeFormatter },

        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false },
        },

        crosshair: { mode: CrosshairMode.Hidden },

        handleScroll: false,
        handleScale: false,

        timeScale: {
          visible: true,
          timeVisible: true,
          secondsVisible: true,
          borderVisible: false,

          // ✅ mantém o mesmo "look&feel" do master (futuro depende disso)
          rightOffset: rightOffsetFallback,
          ...(Number.isFinite(Number(barSpacingFallback)) ? { barSpacing: Number(barSpacingFallback) } : null),

          // ✅ estabilidade em resize
          lockVisibleTimeRangeOnResize: true,
          shiftVisibleRangeOnNewBar: false,

          tickMarkFormatter,
        },

        rightPriceScale: {
          visible: true,
          borderVisible: false,
          ticksVisible: false,
          scaleMargins: { top: 0, bottom: 0 },
          minimumWidth: 0,
        },
        leftPriceScale: { visible: false, borderVisible: false },
      });

      const anchor = chart.addLineSeries({
        priceScaleId: "__anchor",
        color: "rgba(0,0,0,0)",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      try {
        chart.priceScale("__anchor").applyOptions({
          visible: false,
          borderVisible: false,
          ticksVisible: false,
          autoScale: false,
          scaleMargins: { top: 0, bottom: 0 },
        });
      } catch {}

      chartRef.current = chart;
      anchorSeriesRef.current = anchor;
      created = true;

      setFooterReady(true);

      const applyRightScaleWidthFromMaster = () => {
        const c = chartRef.current;
        if (!c) return;

        const masterW = getMasterRightScaleWidth(masterChart);
        if (!Number.isFinite(masterW)) return;

        const nextW = Math.max(0, Math.floor(masterW));
        const lastW = Number(lastAppliedRightWidthRef.current);

        if (Number.isFinite(lastW) && lastW === nextW) return;

        lastAppliedRightWidthRef.current = nextW;

        try {
          c.applyOptions({
            rightPriceScale: {
              visible: true,
              borderVisible: false,
              ticksVisible: false,
              scaleMargins: { top: 0, bottom: 0 },
              minimumWidth: nextW,
            },
          });
        } catch {}
      };

      applyRightScaleWidthFromMaster();

      const ro = new ResizeObserver((entries) => {
        const cr = entries?.[0]?.contentRect;
        if (!cr || !chartRef.current) return;

        const ww = Math.max(1, Math.floor(cr.width));
        const hh = Math.max(1, Math.floor(height));

        try {
          chartRef.current.applyOptions({ width: ww, height: hh });
        } catch {}

        applyRightScaleWidthFromMaster();
      });

      ro.observe(el);
      roRef.current = ro;

      clearRetry();
    };

    clearRetry();
    tryCreate();

    return () => {
      cancelled = true;
      clearRetry();
      cleanupChart();
      setFooterReady(false);
    };
  }, [height, background, timeFormatter, tickMarkFormatter, masterChart]);

  useEffect(() => {
    if (rafWatchRef.current) {
      try { cancelAnimationFrame(rafWatchRef.current); } catch {}
      rafWatchRef.current = 0;
    }

    lastAppliedRightWidthRef.current = NaN;

    if (!footerReady || !masterChart || !chartRef.current) return;

    const tick = () => {
      rafWatchRef.current = 0;

      const c = chartRef.current;
      if (!c) return;

      const masterW = getMasterRightScaleWidth(masterChart);
      if (Number.isFinite(masterW)) {
        const nextW = Math.max(0, Math.floor(masterW));
        const lastW = Number(lastAppliedRightWidthRef.current);

        if (!Number.isFinite(lastW) || lastW !== nextW) {
          lastAppliedRightWidthRef.current = nextW;
          try {
            c.applyOptions({
              rightPriceScale: {
                visible: true,
                borderVisible: false,
                ticksVisible: false,
                scaleMargins: { top: 0, bottom: 0 },
                minimumWidth: nextW,
              },
            });
          } catch {}
        }
      }

      rafWatchRef.current = requestAnimationFrame(tick);
    };

    rafWatchRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafWatchRef.current) {
        try { cancelAnimationFrame(rafWatchRef.current); } catch {}
        rafWatchRef.current = 0;
      }
    };
  }, [footerReady, masterChart]);

  // ✅ alimenta o footer com dataset "âncora" + futuro
  useEffect(() => {
    try { unsubEngineRef.current?.(); } catch {}
    unsubEngineRef.current = null;

    if (!engine) return;

    const pushNowIfPossible = () => {
      const anchor = anchorSeriesRef.current;
      if (!anchor) return;

      const candles = engine?.candles;
      const live = engine?.liveCandle;

      const data = buildAnchorDataWithFuture(candles, live, 720); // ✅ mais folga de futuro
      if (!data.length) return;

      try { anchor.setData(data); } catch {}
    };

    if (footerReady) {
      pushNowIfPossible();
    }

    unsubEngineRef.current = engine.subscribeCandles((candles, liveCandle) => {
      const anchor = anchorSeriesRef.current;
      if (!anchor) return;

      const data = buildAnchorDataWithFuture(candles, liveCandle, 720);
      if (!data.length) return;

      try {
        anchor.setData(data);
      } catch {}
    });

    return () => {
      try { unsubEngineRef.current?.(); } catch {}
      unsubEngineRef.current = null;
    };
  }, [engine, footerReady]);

  // ✅ SYNC 100% fluido: aplica o MESMO visibleLogicalRange (float) do master
  useEffect(() => {
    const st = syncRef.current;

    // cleanup anterior
    if (st.raf) {
      try { cancelAnimationFrame(st.raf); } catch {}
      st.raf = 0;
    }
    if (typeof st.unsub === "function") {
      try { st.unsub(); } catch {}
      st.unsub = null;
    }

    st.active = false;
    st.pendingRange = null;
    st.lastFrom = NaN;
    st.lastTo = NaN;
    st.lastBs = NaN;
    st.lastRo = NaN;

    if (!footerReady || !masterChart || !chartRef.current) return;

    const masterTs = masterChart.timeScale?.();
    const footer = chartRef.current;
    const footerTs = footer.timeScale?.();
    if (!masterTs || !footerTs) return;

    st.active = true;

    const applyNow = () => {
      if (!st.active) return;

      // 1) espelha barSpacing/rightOffset do master (mantém grid idêntico)
      try {
        const o = getMasterTimeScaleOpts(masterChart) || {};
        const bs = Number(o?.barSpacing);
        const ro = Number(o?.rightOffset);

        const patch = {};
        if (Number.isFinite(bs) && bs > 0 && st.lastBs !== bs) {
          patch.barSpacing = bs;
          st.lastBs = bs;
        }
        if (Number.isFinite(ro) && st.lastRo !== ro) {
          patch.rightOffset = ro;
          st.lastRo = ro;
        }

        if (Object.keys(patch).length) {
          footerTs.applyOptions?.(patch);
        }
      } catch {}

      // 2) aplica visibleLogicalRange do master (SEM arredondar) => zero teleporte
      const lr = st.pendingRange;
      st.pendingRange = null;

      if (!lr || lr.from == null || lr.to == null) return;

      const from = Number(lr.from);
      const to = Number(lr.to);

      if (!Number.isFinite(from) || !Number.isFinite(to)) return;

      // epsilon mínimo pra evitar spam quando não mudou nada perceptível
      const EPS = 1e-6;
      if (Number.isFinite(st.lastFrom) && Number.isFinite(st.lastTo)) {
        if (Math.abs(from - st.lastFrom) < EPS && Math.abs(to - st.lastTo) < EPS) return;
      }

      st.lastFrom = from;
      st.lastTo = to;

      try {
        footerTs.setVisibleLogicalRange?.({ from, to });
      } catch {}
    };

    const schedule = () => {
      if (!st.active) return;
      if (st.raf) return;
      st.raf = requestAnimationFrame(() => {
        st.raf = 0;
        applyNow();
      });
    };

    const captureRange = () => {
      // pega o range mais atual possível
      try {
        st.pendingRange = getMasterVisibleLogicalRange(masterChart);
      } catch {
        st.pendingRange = null;
      }
      schedule();
    };

    // aplica uma vez no start
    captureRange();

    try { masterTs.subscribeVisibleLogicalRangeChange?.(captureRange); } catch {}
    try { masterTs.subscribeVisibleTimeRangeChange?.(captureRange); } catch {}

    st.unsub = () => {
      try { masterTs.unsubscribeVisibleLogicalRangeChange?.(captureRange); } catch {}
      try { masterTs.unsubscribeVisibleTimeRangeChange?.(captureRange); } catch {}
    };

    return () => {
      st.active = false;
      if (st.raf) {
        try { cancelAnimationFrame(st.raf); } catch {}
        st.raf = 0;
      }
      if (typeof st.unsub === "function") {
        try { st.unsub(); } catch {}
        st.unsub = null;
      }
      st.pendingRange = null;
    };
  }, [footerReady, masterChart, masterContainer]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: `${height}px`,
        position: "relative",
        overflow: "hidden",

        // ✅ container transparente real
        background: "transparent",
      }}
    />
  );
}