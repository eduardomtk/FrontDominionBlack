import React, { useEffect, useRef } from "react";
import styles from "./DrawingOverlay.module.css";

import { DrawingEngine } from "./core/DrawingEngine";
import { ChartTransformAdapter } from "./transform/ChartTransformAdapter";

function pickMainPaneCanvasRect(hostEl) {
  if (!hostEl || typeof hostEl.querySelectorAll !== "function") return null;

  try {
    const hostRect = hostEl.getBoundingClientRect();
    const canvases = Array.from(hostEl.querySelectorAll("canvas"));
    if (!canvases.length) return null;

    let best = null;
    let bestScore = -1;

    for (const c of canvases) {
      if (!c) continue;
      const r = c.getBoundingClientRect();

      const w = Math.max(0, r.width);
      const h = Math.max(0, r.height);
      if (w < 120 || h < 80) continue;

      const leftNear = Math.abs(r.left - hostRect.left) <= 8;
      const withinHost = r.left >= hostRect.left - 1 && r.right <= hostRect.right + 1;
      const rightTouch = Math.abs(r.right - hostRect.right) <= 8;

      let score = w * h;
      if (leftNear) score *= 1.35;
      if (withinHost) score *= 1.1;
      if (rightTouch) score *= 0.75;

      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }

    if (!best) {
      let fb = null;
      let fbArea = -1;
      for (const c of canvases) {
        if (!c) continue;
        const r = c.getBoundingClientRect();
        const area = Math.max(0, r.width) * Math.max(0, r.height);
        if (area > fbArea) {
          fbArea = area;
          fb = r;
        }
      }
      best = fb;
    }

    if (!best) return null;

    const bw = Math.max(0, best.width);
    const bh = Math.max(0, best.height);
    if (bw <= 0 || bh <= 0) return null;

    return best;
  } catch {
    return null;
  }
}

function stopNativeEvent(e) {
  try {
    e.preventDefault?.();
  } catch {}
  try {
    e.stopPropagation?.();
  } catch {}
  try {
    e.stopImmediatePropagation?.();
  } catch {}
}

function setHostInteractionLock(hostEl, locked) {
  if (!hostEl) return;

  try {
    if (locked) {
      hostEl.dataset.drawingGestureLock = "1";
    } else {
      delete hostEl.dataset.drawingGestureLock;
    }
  } catch {}

  try {
    if (locked) {
      hostEl.style.touchAction = "none";
      hostEl.style.userSelect = "none";
      hostEl.style.webkitUserSelect = "none";
      hostEl.style.webkitTouchCallout = "none";
      hostEl.style.overscrollBehavior = "contain";
      hostEl.style.cursor = "grabbing";
    } else {
      hostEl.style.touchAction = "";
      hostEl.style.userSelect = "";
      hostEl.style.webkitUserSelect = "";
      hostEl.style.webkitTouchCallout = "";
      hostEl.style.overscrollBehavior = "";
      hostEl.style.cursor = "";
    }
  } catch {}
}

export default function DrawingOverlay({
  activeTool,
  getTransform,
  onChange,
  onCommit,
  onApiReady,
  apiRef,
  hostEl,
}) {
  const canvasRef = useRef(null);

  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new DrawingEngine({ onChange, onCommit });
  const engine = engineRef.current;

  const lastPaneRectRef = useRef({ left: NaN, top: NaN, width: NaN, height: NaN });

  // ✅ trava soberana do gesto da ferramenta
  const gestureLockRef = useRef(false);
  const activePointerIdRef = useRef(null);

  useEffect(() => {
    engine.onChange = onChange;
  }, [engine, onChange]);

  useEffect(() => {
    engine.onCommit = onCommit;
  }, [engine, onCommit]);

  useEffect(() => {
    return () => {
      try {
        engine.destroy();
      } catch {}
      engineRef.current = null;
    };
  }, [engine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    engine.attachCanvas(canvas);

    const applyPaneAlignedLayout = () => {
      const host = hostEl;
      if (!host) return;

      const hostRect = host.getBoundingClientRect();
      const paneRect = pickMainPaneCanvasRect(host) || hostRect;

      const left = Math.round(paneRect.left - hostRect.left);
      const top = Math.round(paneRect.top - hostRect.top);
      const width = Math.max(1, Math.floor(paneRect.width));
      const height = Math.max(1, Math.floor(paneRect.height));

      const last = lastPaneRectRef.current;
      const changed =
        left !== last.left ||
        top !== last.top ||
        width !== last.width ||
        height !== last.height;

      if (!changed) return;

      lastPaneRectRef.current = { left, top, width, height };

      canvas.style.position = "absolute";
      canvas.style.left = `${left}px`;
      canvas.style.top = `${top}px`;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      canvas.style.pointerEvents = "none";

      try {
        engine.resizeToCanvasCSSPixels();
      } catch {}
      try {
        engine.invalidate();
      } catch {}
    };

    applyPaneAlignedLayout();

    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        applyPaneAlignedLayout();
      });
    };

    const ro = new ResizeObserver(() => schedule());
    if (hostEl) ro.observe(hostEl);

    window.addEventListener("resize", schedule, true);

    engine.setGetTransform(() => {
      const t = getTransform?.();
      const coordBase = canvas;

      let tr = t instanceof ChartTransformAdapter ? t : null;

      if (!tr) {
        tr = new ChartTransformAdapter();
        try {
          if (t?.chart) tr.chart = t.chart;
          if (t?.series) tr.series = t.series;
        } catch {}
      }

      try {
        if (typeof tr?.setCoordEl === "function") tr.setCoordEl(coordBase);
        else tr.coordEl = coordBase;
      } catch {}

      try {
        if (typeof tr?.bindLightweight === "function") {
          const chart = tr?.chart || t?.chart || null;
          const series = tr?.series || t?.series || null;
          tr.bindLightweight({ chart, series, coordEl: coordBase });
        }
      } catch {}

      return tr;
    });

    try {
      engine.resizeToCanvasCSSPixels();
    } catch {}
    try {
      engine.invalidate();
    } catch {}

    return () => {
      try {
        ro.disconnect();
      } catch {}
      try {
        window.removeEventListener("resize", schedule, true);
      } catch {}
      if (raf) {
        try {
          cancelAnimationFrame(raf);
        } catch {}
        raf = 0;
      }
    };
  }, [engine, getTransform, hostEl]);

  useEffect(() => {
    engine.setActiveToolId(activeTool || null);
    engine.invalidate();
  }, [engine, activeTool]);

  useEffect(() => {
    if (!apiRef) return;

    apiRef.current = {
      clearAll: () => engine.clearAll(),
      exportJSON: () => engine.exportJSON(),
      importJSON: (json) => engine.importJSON(json),
      invalidate: () => engine.invalidate(),

      getSelectedSnapshot: () => engine.getSelectedSnapshot(),
      setSelectedStyle: (patch) => engine.setSelectedStyle(patch),
      toggleSelectedLock: () => engine.toggleSelectedLock(),
      deleteSelected: () => engine.deleteSelected(),
      setSelectedToolbarOffset: (offset) => engine.setSelectedToolbarOffset(offset),

      duplicateSelected: () => engine.duplicateSelected(),
    };

    try {
      onApiReady?.();
    } catch {}

    return () => {
      try {
        apiRef.current = null;
      } catch {}
    };
  }, [engine, apiRef, onApiReady]);

  const rafRef = useRef(0);
  const lastInteractionRef = useRef(0);

  const bumpLiveRedraw = () => {
    lastInteractionRef.current =
      typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

    if (rafRef.current) return;

    const loop = () => {
      const now =
        typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      const dt = now - (lastInteractionRef.current || 0);

      if (dt <= 140) {
        engine.invalidate();
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      rafRef.current = 0;
    };

    rafRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        try {
          cancelAnimationFrame(rafRef.current);
        } catch {}
        rafRef.current = 0;
      }
    };
  }, []);

  useEffect(() => {
    const el = hostEl;
    if (!el) return;

    const lockGesture = (pointerId = null) => {
      gestureLockRef.current = true;
      activePointerIdRef.current = pointerId;
      setHostInteractionLock(el, true);
    };

    const unlockGesture = () => {
      gestureLockRef.current = false;
      activePointerIdRef.current = null;
      setHostInteractionLock(el, false);
    };

    const isSameActivePointer = (e) => {
      const activeId = activePointerIdRef.current;
      if (activeId == null) return true;
      if (e?.pointerId == null) return true;
      return e.pointerId === activeId;
    };

    const onPointerDown = (e) => {
      bumpLiveRedraw();

      // ✅ Se há ferramenta ativa, o gráfico já perde prioridade no gesto.
      const shouldPrelock = !!activeTool;

      if (shouldPrelock) {
        lockGesture(e.pointerId);
      }

      const consumed = engine.onHostPointerDown(e, el);

      if (consumed) {
        lockGesture(e.pointerId);

        try {
          el.setPointerCapture?.(e.pointerId);
        } catch {}

        stopNativeEvent(e);
        return;
      }

      // ✅ Se pretravou por ferramenta ativa, mesmo que o engine ainda não tenha consumido
      // o gráfico não deve panear durante o desenho no mobile.
      if (shouldPrelock) {
        try {
          el.setPointerCapture?.(e.pointerId);
        } catch {}

        stopNativeEvent(e);
        return;
      }

      // sem lock: deixa fluxo normal
      unlockGesture();
    };

    const onPointerMove = (e) => {
      bumpLiveRedraw();

      // ✅ enquanto travado, a ferramenta manda e o gráfico fica congelado
      if (gestureLockRef.current && isSameActivePointer(e)) {
        engine.onHostPointerMove(e, el);
        stopNativeEvent(e);
        return;
      }

      const consumed = engine.onHostPointerMove(e, el);
      if (consumed) {
        lockGesture(e.pointerId);
        stopNativeEvent(e);
      }
    };

    const onPointerUp = (e) => {
      bumpLiveRedraw();

      if (gestureLockRef.current && isSameActivePointer(e)) {
        engine.onHostPointerUp(e, el);

        try {
          el.releasePointerCapture?.(e.pointerId);
        } catch {}

        stopNativeEvent(e);
        unlockGesture();
        return;
      }

      const consumed = engine.onHostPointerUp(e, el);
      if (consumed) {
        try {
          el.releasePointerCapture?.(e.pointerId);
        } catch {}

        stopNativeEvent(e);
      }

      unlockGesture();
    };

    const onPointerCancel = (e) => {
      if (!gestureLockRef.current) return;

      try {
        el.releasePointerCapture?.(e.pointerId);
      } catch {}

      stopNativeEvent(e);
      unlockGesture();
    };

    const onDragStart = (e) => {
      if (!gestureLockRef.current) return;
      stopNativeEvent(e);
    };

    const onTouchMove = (e) => {
      if (!gestureLockRef.current) return;
      stopNativeEvent(e);
    };

    const onTouchStart = (e) => {
      if (!activeTool && !gestureLockRef.current) return;
      stopNativeEvent(e);
    };

    const onWheel = (e) => {
      bumpLiveRedraw();

      if (gestureLockRef.current) {
        stopNativeEvent(e);
        return;
      }
    };

    const wheelOpts = { capture: true, passive: false };
    const touchOpts = { capture: true, passive: false };

    el.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerCancel, true);

    el.addEventListener("touchstart", onTouchStart, touchOpts);
    window.addEventListener("touchmove", onTouchMove, touchOpts);

    el.addEventListener("dragstart", onDragStart, true);
    el.addEventListener("wheel", onWheel, wheelOpts);

    return () => {
      unlockGesture();

      el.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);

      el.removeEventListener("touchstart", onTouchStart, touchOpts);
      window.removeEventListener("touchmove", onTouchMove, touchOpts);

      el.removeEventListener("dragstart", onDragStart, true);
      el.removeEventListener("wheel", onWheel, wheelOpts);
    };
  }, [engine, hostEl, activeTool]);

  useEffect(() => {
    const t = getTransform?.();
    const chart = t?.chart || null;
    if (!chart) return;

    const ts = chart.timeScale?.();
    if (!ts) return;

    const invalidate = () => {
      bumpLiveRedraw();
      engine.invalidate();
    };

    try {
      ts.subscribeVisibleLogicalRangeChange?.(invalidate);
    } catch {}
    try {
      ts.subscribeVisibleTimeRangeChange?.(invalidate);
    } catch {}

    return () => {
      try {
        ts.unsubscribeVisibleLogicalRangeChange?.(invalidate);
      } catch {}
      try {
        ts.unsubscribeVisibleTimeRangeChange?.(invalidate);
      } catch {}
    };
  }, [engine, getTransform]);

  return <canvas ref={canvasRef} className={styles.canvas} />;
}