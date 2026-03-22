// src/components/Chart/Drawings/transform/LightweightChartsTransform.js
import { ChartTransformAdapter } from "./ChartTransformAdapter";

/**
 * Transform adapter plugado no lightweight-charts (LWC).
 * World:
 *   t = epoch seconds (UTCTimestamp)
 *   p = price
 *   l = logical index (SOBERANO p/ X)
 *
 * Screen:
 *   x/y = CSS pixels dentro do espaço de coordenadas do overlay (coordEl)
 */
export class LightweightChartsTransform extends ChartTransformAdapter {
  constructor({
    chart,
    series,
    containerEl,
    logicalToMappedTime,
    mappedTimeToLogical,
    getCrosshairSnapshot,
  } = {}) {
    super();
    this.chart = chart || null;
    this.series = series || null;

    this.containerEl = containerEl || null;

    this.logicalToMappedTime = typeof logicalToMappedTime === "function" ? logicalToMappedTime : null;
    this.mappedTimeToLogical = typeof mappedTimeToLogical === "function" ? mappedTimeToLogical : null;

    this.coordEl = null;

    this.getCrosshairSnapshot = typeof getCrosshairSnapshot === "function" ? getCrosshairSnapshot : null;

    this._lastPaneOffset = { x: 0, y: 0, at: 0 };
    this._lastCoordOffset = { dx: 0, dy: 0, at: 0 };
  }

  setCoordEl(el) {
    this.coordEl = el || null;
  }

  _now() {
    return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  }

  _getCoordOffsets() {
    const c = this.containerEl;
    const k = this.coordEl;

    if (!c || !k || c === k) return { dx: 0, dy: 0 };

    const now = this._now();
    const cached = this._lastCoordOffset;
    if (cached && (now - (cached.at || 0)) < 120) {
      return { dx: cached.dx || 0, dy: cached.dy || 0 };
    }

    let dx = 0;
    let dy = 0;

    try {
      const cr = c.getBoundingClientRect();
      const kr = k.getBoundingClientRect();
      dx = (kr.left - cr.left);
      dy = (kr.top - cr.top);

      if (!Number.isFinite(dx)) dx = 0;
      if (!Number.isFinite(dy)) dy = 0;

      if (Math.abs(dx) > cr.width * 2) dx = 0;
      if (Math.abs(dy) > cr.height * 2) dy = 0;
    } catch {
      dx = 0;
      dy = 0;
    }

    this._lastCoordOffset = { dx, dy, at: now };
    return { dx, dy };
  }

  _coordXYToContainerXY(x, y) {
    const { dx, dy } = this._getCoordOffsets();
    return { x: Number(x) + dx, y: Number(y) + dy };
  }

  _containerXYToCoordXY(x, y) {
    const { dx, dy } = this._getCoordOffsets();
    return { x: Number(x) - dx, y: Number(y) - dy };
  }

  _getPaneOffsets() {
    const container = this.containerEl;
    if (!container || typeof container.querySelectorAll !== "function") return { x: 0, y: 0 };

    const now = this._now();
    const cached = this._lastPaneOffset;
    if (cached && (now - (cached.at || 0)) < 120) {
      return { x: cached.x || 0, y: cached.y || 0 };
    }

    let offX = 0;
    let offY = 0;

    try {
      const containerRect = container.getBoundingClientRect();
      const canvases = Array.from(container.querySelectorAll("canvas"));

      let best = null;
      let bestArea = -1;

      for (const c of canvases) {
        if (!c) continue;
        const r = c.getBoundingClientRect();
        const w = Math.max(0, r.width);
        const h = Math.max(0, r.height);
        if (w < 80 || h < 60) continue;

        const area = w * h;
        if (area > bestArea) {
          bestArea = area;
          best = r;
        }
      }

      if (best) {
        offX = best.left - containerRect.left;
        offY = best.top - containerRect.top;

        if (!Number.isFinite(offX)) offX = 0;
        if (!Number.isFinite(offY)) offY = 0;

        if (Math.abs(offX) > containerRect.width || Math.abs(offY) > containerRect.height) {
          offX = 0;
          offY = 0;
        }
      }
    } catch {
      offX = 0;
      offY = 0;
    }

    this._lastPaneOffset = { x: offX, y: offY, at: now };
    return { x: offX, y: offY };
  }

  _containerXYToPaneXY(x, y) {
    const o = this._getPaneOffsets();
    return { x: Number(x) - (o.x || 0), y: Number(y) - (o.y || 0) };
  }

  _paneXYToContainerXY(x, y) {
    const o = this._getPaneOffsets();
    return { x: Number(x) + (o.x || 0), y: Number(y) + (o.y || 0) };
  }

  _tryCrosshairSnapshot(maxAgeMs = 500) {
    try {
      const snap = this.getCrosshairSnapshot?.();
      const st = Number(snap?.t ?? snap?.time);
      const sp = Number(snap?.p ?? snap?.price);
      const sx = Number(snap?.xPane);
      const sl = Number(snap?.l ?? snap?.logical);
      const at = Number(snap?.at) || 0;

      const now = this._now();
      const age = now - at;

      if (Number.isFinite(st) && Number.isFinite(sp) && age >= 0 && age <= maxAgeMs) {
        return {
          t: st,
          p: sp,
          xPane: Number.isFinite(sx) ? sx : NaN,
          l: Number.isFinite(sl) ? sl : NaN,
        };
      }
    } catch {}
    return null;
  }

  // world -> screen (coordEl)
  timePriceToXY(world) {
    const t = Number(world?.t);
    const p = Number(world?.p);
    const l = Number(world?.l);

    if (!this.chart || !this.series || !this.containerEl) return { x: NaN, y: NaN };
    if (!Number.isFinite(p)) return { x: NaN, y: NaN };

    let xPane = NaN;

    // ✅ SOBERANO: se tiver logical, usa logical direto (mata teleporte)
    try {
      const ts = this.chart.timeScale?.();
      if (ts && Number.isFinite(l)) {
        const xc = ts.logicalToCoordinate?.(Number(l));
        if (Number.isFinite(Number(xc))) xPane = Number(xc);
      }
    } catch {}

    // fallback: tentar mappedTimeToLogical/time
    if (!Number.isFinite(xPane)) {
      try {
        const ts = this.chart.timeScale?.();
        if (ts && this.mappedTimeToLogical && Number.isFinite(t)) {
          const logical = this.mappedTimeToLogical(t);
          if (logical != null) {
            const xc = ts.logicalToCoordinate?.(logical);
            if (Number.isFinite(Number(xc))) xPane = Number(xc);
          }
        }
      } catch {}
    }

    if (!Number.isFinite(xPane)) {
      try {
        const xc = this.chart.timeScale?.().timeToCoordinate?.(t);
        if (Number.isFinite(Number(xc))) xPane = Number(xc);
      } catch {}
    }

    let yPane = NaN;
    try {
      const yc = this.series.priceToCoordinate?.(p);
      if (Number.isFinite(Number(yc))) yPane = Number(yc);
    } catch {}

    const cxy = this._paneXYToContainerXY(xPane, yPane);
    const out = this._containerXYToCoordXY(cxy.x, cxy.y);
    return { x: out.x, y: out.y };
  }

  // screen (coordEl) -> world
  xyToTimePrice(screen) {
    const xK = Number(screen?.x);
    const yK = Number(screen?.y);

    if (!this.chart || !this.series || !this.containerEl) return { t: NaN, p: NaN, l: NaN };
    if (!Number.isFinite(xK) || !Number.isFinite(yK)) return { t: NaN, p: NaN, l: NaN };

    // ✅ primeiro: mouse -> pane -> world
    const cxy = this._coordXYToContainerXY(xK, yK);
    const pxy = this._containerXYToPaneXY(cxy.x, cxy.y);
    const w0 = this._paneXYToWorld(pxy.x, pxy.y);

    const t0 = Number(w0?.t);
    const p0 = Number(w0?.p);
    const l0 = Number(w0?.l);

    if (Number.isFinite(p0) && (Number.isFinite(l0) || Number.isFinite(t0))) {
      return { t: t0, p: p0, l: l0 };
    }

    // fallback crosshair
    const snap = this._tryCrosshairSnapshot(500);
    if (snap?.t != null && snap?.p != null) {
      const lSnap = Number.isFinite(Number(snap.l)) ? Math.round(Number(snap.l)) : NaN;
      return { t: snap.t, p: snap.p, l: lSnap };
    }

    return { t: NaN, p: NaN, l: NaN };
  }

  clientXYToTimePrice(clientX, clientY) {
    if (!this.chart || !this.series || !this.containerEl) return { t: NaN, p: NaN, l: NaN };

    // ✅ se coordEl existir, converte client->coord e usa xyToTimePrice
    const k = this.coordEl;
    if (k && typeof k.getBoundingClientRect === "function") {
      try {
        const kr = k.getBoundingClientRect();
        const xK = Number(clientX) - kr.left;
        const yK = Number(clientY) - kr.top;
        if (Number.isFinite(xK) && Number.isFinite(yK)) {
          const w0 = this.xyToTimePrice({ x: xK, y: yK });
          const t0 = Number(w0?.t);
          const p0 = Number(w0?.p);
          const l0 = Number(w0?.l);
          if (Number.isFinite(p0) && (Number.isFinite(l0) || Number.isFinite(t0))) return w0;
        }
      } catch {}
    }

    // fallback: crosshair
    const snap = this._tryCrosshairSnapshot(800);
    if (snap?.t != null && snap?.p != null) {
      const lSnap = Number.isFinite(Number(snap.l)) ? Math.round(Number(snap.l)) : NaN;
      return { t: snap.t, p: snap.p, l: lSnap };
    }

    return { t: NaN, p: NaN, l: NaN };
  }

  _paneXYToWorld(x, y) {
    let t = NaN;
    let l = NaN;

    try {
      const ts = this.chart.timeScale?.();
      const logical = ts?.coordinateToLogical?.(x);

      if (Number.isFinite(Number(logical))) {
        const snapped = Math.round(Number(logical));
        l = snapped;

        const mapped = this.logicalToMappedTime?.(snapped);
        if (mapped != null) t = Number(mapped);

        if (!Number.isFinite(t)) {
          const tt = ts?.coordinateToTime?.(x);
          if (tt != null && Number.isFinite(Number(tt))) t = Number(tt);
        }
      } else {
        const tt = ts?.coordinateToTime?.(x);
        if (tt != null && Number.isFinite(Number(tt))) t = Number(tt);
      }
    } catch {}

    let p = NaN;
    try {
      const pc = this.series.coordinateToPrice?.(y);
      if (pc != null && Number.isFinite(Number(pc))) p = Number(pc);
    } catch {}

    return { t, p, l };
  }
}
