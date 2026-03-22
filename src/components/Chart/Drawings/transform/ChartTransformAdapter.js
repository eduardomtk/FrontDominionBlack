// src/components/Chart/Drawings/transform/ChartTransformAdapter.js
/**
 * Adapter de transformação world<->screen.
 *
 * World point:
 *   { t: number, p: number, l?: number }  // l = logical index (soberano p/ X no LWC)
 *
 * Screen point:
 *   { x: number, y: number }  // CSS pixels no espaço do canvas/overlay (coordEl)
 */
export class ChartTransformAdapter {
  constructor(opts = {}) {
    this.dpr = Number.isFinite(opts.dpr)
      ? opts.dpr
      : (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

    this.width = Number.isFinite(opts.width) ? opts.width : 0;
    this.height = Number.isFinite(opts.height) ? opts.height : 0;

    // ✅ Fallback linear (mantém compat)
    this.tMin = Number.isFinite(opts.tMin) ? opts.tMin : 0;
    this.tMax = Number.isFinite(opts.tMax) ? opts.tMax : 1;
    this.pMin = Number.isFinite(opts.pMin) ? opts.pMin : 0;
    this.pMax = Number.isFinite(opts.pMax) ? opts.pMax : 1;

    // ✅ LWC bindings
    this.chart = opts.chart || null;
    this.series = opts.series || null;

    // opcional (usado pelo engine/overlay)
    this.coordEl = opts.coordEl || null;
  }

  // ✅ Bind real do Lightweight Charts
  bindLightweight({ chart, series, coordEl } = {}) {
    if (chart) this.chart = chart;
    if (series) this.series = series;
    if (coordEl) this.coordEl = coordEl;
  }

  setViewport({ width, height, dpr }) {
    if (Number.isFinite(width)) this.width = width;
    if (Number.isFinite(height)) this.height = height;
    if (Number.isFinite(dpr)) this.dpr = dpr;
  }

  setWorldRanges({ tMin, tMax, pMin, pMax }) {
    if (Number.isFinite(tMin)) this.tMin = tMin;
    if (Number.isFinite(tMax)) this.tMax = tMax;
    if (Number.isFinite(pMin)) this.pMin = pMin;
    if (Number.isFinite(pMax)) this.pMax = pMax;
  }

  setCoordEl(el) {
    this.coordEl = el || null;
  }

  // -----------------------------
  // Helpers
  // -----------------------------
  _normalizeTime(timeLike) {
    // LWC pode retornar number (UTCTimestamp) OU BusinessDay object
    if (typeof timeLike === "number" && Number.isFinite(timeLike)) return timeLike;

    if (timeLike && typeof timeLike === "object") {
      const y = Number(timeLike.year);
      const m = Number(timeLike.month);
      const d = Number(timeLike.day);
      if ([y, m, d].every((n) => Number.isFinite(n))) {
        // converte BusinessDay -> UTC seconds (00:00 UTC)
        const ms = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
        return Math.floor(ms / 1000);
      }
    }

    return NaN;
  }

  _hasLWC() {
    return !!(this.chart && this.series && this.chart.timeScale && this.chart.timeScale());
  }

  // ✅ coordenada X -> time (soberano)
  coordinateXToTime(x) {
    if (!this._hasLWC()) return NaN;
    const ts = this.chart.timeScale();
    if (!ts || typeof ts.coordinateToTime !== "function") return NaN;
    const tLike = ts.coordinateToTime(x);
    return this._normalizeTime(tLike);
  }

  // ✅ coordenada X -> logical
  coordinateXToLogical(x) {
    if (!this._hasLWC()) return NaN;
    const ts = this.chart.timeScale();
    if (!ts || typeof ts.coordinateToLogical !== "function") return NaN;
    const l = ts.coordinateToLogical(x);
    const ln = Number(l);
    return Number.isFinite(ln) ? ln : NaN;
  }

  // ✅ logical -> X
  logicalToCoordinate(l) {
    if (!this._hasLWC()) return NaN;
    const ts = this.chart.timeScale();
    if (!ts || typeof ts.logicalToCoordinate !== "function") return NaN;
    const x = ts.logicalToCoordinate(Number(l));
    const xn = Number(x);
    return Number.isFinite(xn) ? xn : NaN;
  }

  // ✅ coordenada Y -> price (soberano)
  coordinateYToPrice(y) {
    const s = this.series;
    if (!s || typeof s.coordinateToPrice !== "function") return NaN;
    const p = s.coordinateToPrice(y);
    const pn = Number(p);
    return Number.isFinite(pn) ? pn : NaN;
  }

  // ✅ time -> X (soberano)
  timeToCoordinate(t) {
    if (!this._hasLWC()) return NaN;
    const ts = this.chart.timeScale();
    if (!ts || typeof ts.timeToCoordinate !== "function") return NaN;
    const x = ts.timeToCoordinate(Number(t));
    const xn = Number(x);
    return Number.isFinite(xn) ? xn : NaN;
  }

  // ✅ price -> Y (soberano)
  priceToCoordinate(p) {
    const s = this.series;
    if (!s || typeof s.priceToCoordinate !== "function") return NaN;
    const y = s.priceToCoordinate(Number(p));
    const yn = Number(y);
    return Number.isFinite(yn) ? yn : NaN;
  }

  // -----------------------------
  // World <-> Screen
  // -----------------------------
  timePriceToXY(world) {
    const t = Number(world?.t);
    const p = Number(world?.p);
    const l = Number(world?.l);

    // ✅ prefer LWC
    if (this._hasLWC()) {
      // ✅ X soberano: se tiver logical, usa logical
      const x = Number.isFinite(l) ? this.logicalToCoordinate(l) : this.timeToCoordinate(t);
      const y = this.priceToCoordinate(p);
      return { x, y };
    }

    // fallback linear
    if (!Number.isFinite(t) || !Number.isFinite(p) || this.width <= 0 || this.height <= 0) {
      return { x: NaN, y: NaN };
    }

    const tx = (t - this.tMin) / (this.tMax - this.tMin || 1);
    const py = (p - this.pMin) / (this.pMax - this.pMin || 1);

    const x = tx * this.width;
    const y = (1 - py) * this.height;
    return { x, y };
  }

  xyToTimePrice(screen) {
    const x = Number(screen?.x);
    const y = Number(screen?.y);

    // ✅ prefer LWC
    if (this._hasLWC()) {
      const t = this.coordinateXToTime(x);
      const p = this.coordinateYToPrice(y);
      const l = this.coordinateXToLogical(x);
      const lSnap = Number.isFinite(l) ? Math.round(l) : NaN;
      return { t, p, l: lSnap };
    }

    // fallback linear
    if (!Number.isFinite(x) || !Number.isFinite(y) || this.width <= 0 || this.height <= 0) {
      return { t: NaN, p: NaN, l: NaN };
    }

    const tx = x / (this.width || 1);
    const py = 1 - (y / (this.height || 1));

    const t = this.tMin + tx * (this.tMax - this.tMin || 1);
    const p = this.pMin + py * (this.pMax - this.pMin || 1);
    return { t, p, l: NaN };
  }

  // ✅ client coords -> world (usado no engine)
  clientXYToTimePrice(clientX, clientY) {
    const el = this.coordEl || (typeof document !== "undefined" ? document.body : null);
    if (!el || typeof el.getBoundingClientRect !== "function") {
      return { t: NaN, p: NaN, l: NaN };
    }

    const rect = el.getBoundingClientRect();
    const x = Number(clientX) - rect.left;
    const y = Number(clientY) - rect.top;

    return this.xyToTimePrice({ x, y });
  }
}
