import { createRAFLoop } from "./raf";
import { createToolById } from "../tools";
import { ChartTransformAdapter } from "../transform/ChartTransformAdapter";

import { SegmentLine } from "../objects/SegmentLine";
import { InfiniteLine } from "../objects/InfiniteLine";
import { RectangleBox } from "../objects/RectangleBox";
import { FibonacciRetracement } from "../objects/FibonacciRetracement";
import { HorizontalLine } from "../objects/HorizontalLine";
import { VerticalLine } from "../objects/VerticalLine";

// ✅ Fonte soberana do crosshair DOM (AGORA PRINCIPAL quando disponível)
import { CrosshairStore } from "@/components/Chart/Drawings/crosshair/CrosshairStore";

const BASE_HANDLE_RADIUS = 6;
const BASE_HIT_EPS = 8;
const BASE_CLICK_TOL = 3;
const BASE_DRAG_COMMIT_TOL = 5;

// ✅ Crosshair snap “fresco” (ms)
// - move: menor pra acompanhar o mouse
// - up: um pouco maior pra tolerar frames
const CROSSHAIR_MOVE_MAX_AGE = 80;
const CROSSHAIR_UP_MAX_AGE = 160;

const DEFAULT_STYLE = {
  stroke: "rgba(0, 132, 255, 0.98)",
  strokeWidth: 2,
  dash: null,
  hitStrokeWidth: 10,
  pointRadius: 4,
  pointStrokeWidth: 2,

  color: "rgba(0, 132, 255, 0.98)",
  width: 2,

  fill: "rgba(0, 132, 255, 0.10)",
  fillOpacity: 1,
};

function genId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function toNum(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function normType(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function pickWorldPt(obj, keys) {
  for (const k of keys) {
    const pt = obj?.[k];
    if (pt && typeof pt === "object") {
      const t = toNum(pt.t);
      const p = toNum(pt.p);
      if (t != null && p != null) return { t, p };
    }
  }
  return null;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function stripUndefined(obj) {
  if (!obj || typeof obj !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function isRectType(obj) {
  const t = normType(obj?.type || obj?.kind || "");
  return (
    t.includes("rect") ||
    t.includes("rectangle") ||
    t === "box" ||
    t === "range_box" ||
    t === "rectangle_box"
  );
}

function colorToRgba(input, alpha = 0.10) {
  const a = clamp(Number(alpha), 0, 1);
  const c = String(input || "").trim();

  let m = c.match(/^rgba\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)$/i);
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a})`;

  m = c.match(/^rgb\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)$/i);
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a})`;

  m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const hex = m[1].toLowerCase();
    const full = hex.length === 3 ? hex.split("").map((ch) => ch + ch).join("") : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  return `rgba(0, 132, 255, ${a})`;
}

function mergeStyleWithDefaults(style) {
  const s0 = style && typeof style === "object" ? style : {};
  const s = { ...s0 };

  if (s.fill === undefined) s.fill = s.fillColor ?? s.background ?? s.bg;
  if (s.fillOpacity === undefined) s.fillOpacity = s.opacity ?? s.alpha;

  return { ...DEFAULT_STYLE, ...s };
}

// =====================================================
// ✅ Métricas responsivas SOMENTE para mobile/tablet
// Desktop continua no padrão atual.
// =====================================================
function getViewportMetrics() {
  if (typeof window === "undefined") {
    return {
      handleRadius: BASE_HANDLE_RADIUS,
      hitEps: BASE_HIT_EPS,
      clickTol: BASE_CLICK_TOL,
      dragCommitTol: BASE_DRAG_COMMIT_TOL,
      visualHandleRadius: 5,
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
  const isMobile = width <= 767;
  const isTablet = width >= 768 && width <= 1024;

  // ✅ mobile portrait: dedo precisa de área maior
  if (isMobile && isPortrait) {
    return {
      handleRadius: 12,
      hitEps: 18,
      clickTol: 6,
      dragCommitTol: 8,
      visualHandleRadius: 8,
    };
  }

  // ✅ mobile landscape: aumenta, mas menos que portrait
  if (isMobile && !isPortrait) {
    return {
      handleRadius: 10,
      hitEps: 15,
      clickTol: 5,
      dragCommitTol: 7,
      visualHandleRadius: 7,
    };
  }

  // ✅ tablet/landscape intermediário
  if (isTablet) {
    return {
      handleRadius: 8,
      hitEps: 12,
      clickTol: 4,
      dragCommitTol: 6,
      visualHandleRadius: 6,
    };
  }

  // ✅ desktop intacto
  return {
    handleRadius: BASE_HANDLE_RADIUS,
    hitEps: BASE_HIT_EPS,
    clickTol: BASE_CLICK_TOL,
    dragCommitTol: BASE_DRAG_COMMIT_TOL,
    visualHandleRadius: 5,
  };
}

// ======================================
// PersistedRectangle
// ======================================
class PersistedRectangle {
  constructor(start, end, rawType = "rectangle") {
    this.type = rawType;
    this.id = genId();
    this.locked = false;
    this.style = { ...DEFAULT_STYLE };
    this.start = start;
    this.end = end;
  }

  getAnchorWorld() {
    return this.start || this.end || { t: NaN, p: NaN };
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      locked: !!this.locked,
      style: this.style,
      start: this.start,
      end: this.end,
    };
  }

  getStyle() {
    return this.style || {};
  }

  setStyle(s) {
    this.style = s || {};
  }

  _norm() {
    const a = this.start;
    const b = this.end;
    const t1 = Math.min(a.t, b.t);
    const t2 = Math.max(a.t, b.t);
    const p1 = Math.min(a.p, b.p);
    const p2 = Math.max(a.p, b.p);
    return { t1, t2, p1, p2 };
  }

  _handles() {
    const a = this.start;
    const b = this.end;
    return [
      { t: a.t, p: a.p },
      { t: b.t, p: a.p },
      { t: b.t, p: b.p },
      { t: a.t, p: b.p },
    ];
  }

  draw(ctx, transform, { selected } = {}) {
    const s = mergeStyleWithDefaults(this.style);
    const { t1, t2, p1, p2 } = this._norm();

    const A = transform.timePriceToXY({ t: t1, p: p1 });
    const B = transform.timePriceToXY({ t: t2, p: p2 });

    const x = Math.min(A.x, B.x);
    const y = Math.min(A.y, B.y);
    const w = Math.abs(B.x - A.x);
    const h = Math.abs(B.y - A.y);

    ctx.save();

    ctx.lineWidth = Number(s.strokeWidth || s.width || 2);
    ctx.strokeStyle = s.stroke || s.color || DEFAULT_STYLE.stroke;

    if (Array.isArray(s.dash) && s.dash.length) ctx.setLineDash(s.dash);
    else ctx.setLineDash([]);

    const fillVal = s.fill ?? null;
    if (fillVal) {
      const fo = Number.isFinite(Number(s.fillOpacity)) ? Number(s.fillOpacity) : 0.1;
      ctx.globalAlpha = clamp(fo, 0, 1);
      ctx.fillStyle = fillVal;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }

    ctx.strokeRect(x, y, w, h);

    if (selected) {
      const metrics = getViewportMetrics();
      const pr = Math.max(Number(s.pointRadius || 4), metrics.visualHandleRadius);

      ctx.setLineDash([]);
      ctx.lineWidth = Number(s.pointStrokeWidth || 2);
      ctx.fillStyle = "rgba(12,18,30,0.95)";
      ctx.strokeStyle = s.stroke || s.color || DEFAULT_STYLE.stroke;

      const handles = this._handles();
      for (const hPt of handles) {
        const pt = transform.timePriceToXY(hPt);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  hitTest(pt, transform, { hitEps = 8, handleRadius = 6 } = {}) {
    const s = mergeStyleWithDefaults(this.style);
    const handles = this._handles();

    for (let i = 0; i < handles.length; i++) {
      const xy = transform.timePriceToXY(handles[i]);
      const d = Math.hypot(pt.x - xy.x, pt.y - xy.y);
      if (d <= Math.max(handleRadius, Number(s.hitStrokeWidth || 10) * 0.5)) {
        return { objectId: this.id, type: "handle", handleId: i };
      }
    }

    const { t1, t2, p1, p2 } = this._norm();
    const A = transform.timePriceToXY({ t: t1, p: p1 });
    const B = transform.timePriceToXY({ t: t2, p: p2 });

    const x1 = Math.min(A.x, B.x);
    const x2 = Math.max(A.x, B.x);
    const y1 = Math.min(A.y, B.y);
    const y2 = Math.max(A.y, B.y);

    const inside =
      pt.x >= x1 - hitEps && pt.x <= x2 + hitEps && pt.y >= y1 - hitEps && pt.y <= y2 + hitEps;
    if (!inside) return null;

    return { objectId: this.id, type: "body" };
  }

  moveHandle(handleId, world) {
    if (!world) return;

    const a = this.start;
    const b = this.end;

    if (handleId === 0) {
      this.start = { t: world.t, p: world.p };
    } else if (handleId === 2) {
      this.end = { t: world.t, p: world.p };
    } else if (handleId === 1) {
      this.start = { t: a.t, p: world.p };
      this.end = { t: world.t, p: b.p };
    } else if (handleId === 3) {
      this.start = { t: world.t, p: a.p };
      this.end = { t: b.t, p: world.p };
    } else {
      this.end = { t: world.t, p: world.p };
    }
  }

  moveByDrag(_drag, world) {
    if (!world || !this.start || !this.end) return;

    const from = _drag?.worldFrom || _drag?.worldStart || null;
    if (!from) return;

    const dt = world.t - from.t;
    const dp = world.p - from.p;

    this.start = { t: this.start.t + dt, p: this.start.p + dp };
    this.end = { t: this.end.t + dt, p: this.end.p + dp };

    _drag.worldFrom = { t: world.t, p: world.p };
  }
}

// ======================================
// PersistedFibonacci
// ======================================
class PersistedFibonacci {
  constructor(start, end, rawType = "fibonacci") {
    this.type = rawType;
    this.id = genId();
    this.locked = false;
    this.style = { ...DEFAULT_STYLE };
    this.start = start;
    this.end = end;
    this.levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  }

  getAnchorWorld() {
    return this.start || this.end || { t: NaN, p: NaN };
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      locked: !!this.locked,
      style: this.style,
      start: this.start,
      end: this.end,
      levels: this.levels,
    };
  }

  getStyle() {
    return this.style || {};
  }

  setStyle(s) {
    this.style = s || {};
  }

  _handles() {
    return [this.start, this.end];
  }

  _levelPrice(k) {
    const a = this.start;
    const b = this.end;
    const p1 = Number(a.p);
    const p2 = Number(b.p);
    return p1 + (p2 - p1) * k;
  }

  draw(ctx, transform, { selected } = {}) {
    const s = mergeStyleWithDefaults(this.style);
    const a = this.start;
    const b = this.end;
    if (!a || !b) return;

    const t1 = Math.min(a.t, b.t);
    const t2 = Math.max(a.t, b.t);

    ctx.save();

    ctx.lineWidth = Number(s.strokeWidth || s.width || 2);
    ctx.strokeStyle = s.stroke || s.color || DEFAULT_STYLE.stroke;
    if (Array.isArray(s.dash) && s.dash.length) ctx.setLineDash(s.dash);
    else ctx.setLineDash([]);

    const levels = Array.isArray(this.levels) && this.levels.length ? this.levels : [0, 0.5, 1];

    const padX = 6;
    ctx.font = "12px Arial";
    ctx.textBaseline = "middle";
    ctx.fillStyle = s.stroke || s.color || DEFAULT_STYLE.stroke;

    for (const k0 of levels) {
      const k = Number(k0);
      const p = this._levelPrice(k);
      if (!Number.isFinite(p)) continue;

      const A = transform.timePriceToXY({ t: t1, p });
      const B = transform.timePriceToXY({ t: t2, p });

      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();

      const label = `${(k * 100).toFixed(1)}%`;
      ctx.setLineDash([]);
      ctx.fillText(label, Math.max(A.x, B.x) + padX, A.y);
      if (Array.isArray(s.dash) && s.dash.length) ctx.setLineDash(s.dash);
      else ctx.setLineDash([]);
    }

    ctx.setLineDash([5, 6]);
    const A0 = transform.timePriceToXY(a);
    const B0 = transform.timePriceToXY(b);
    ctx.beginPath();
    ctx.moveTo(A0.x, A0.y);
    ctx.lineTo(B0.x, B0.y);
    ctx.stroke();

    if (selected) {
      const metrics = getViewportMetrics();
      const pr = Math.max(Number(s.pointRadius || 4), metrics.visualHandleRadius);

      ctx.setLineDash([]);
      ctx.lineWidth = Number(s.pointStrokeWidth || 2);
      ctx.fillStyle = "rgba(12,18,30,0.95)";
      ctx.strokeStyle = s.stroke || s.color || DEFAULT_STYLE.stroke;

      for (let i = 0; i < 2; i++) {
        const w = this._handles()[i];
        const pt = transform.timePriceToXY(w);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  hitTest(pt, transform, { hitEps = 8, handleRadius = 6 } = {}) {
    const s = mergeStyleWithDefaults(this.style);

    const handles = this._handles();
    for (let i = 0; i < handles.length; i++) {
      const xy = transform.timePriceToXY(handles[i]);
      const d = Math.hypot(pt.x - xy.x, pt.y - xy.y);
      if (d <= Math.max(handleRadius, Number(s.hitStrokeWidth || 10) * 0.5)) {
        return { objectId: this.id, type: "handle", handleId: i };
      }
    }

    return { objectId: this.id, type: "body" };
  }

  moveHandle(handleId, world) {
    if (!world) return;
    if (handleId === 0) this.start = { t: world.t, p: world.p };
    else this.end = { t: world.t, p: world.p };
  }

  moveByDrag(_drag, world) {
    if (!world || !this.start || !this.end) return;

    const from = _drag?.worldFrom || _drag?.worldStart || null;
    if (!from) return;

    const dt = world.t - from.t;
    const dp = world.p - from.p;

    this.start = { t: this.start.t + dt, p: this.start.p + dp };
    this.end = { t: this.end.t + dt, p: this.end.p + dp };

    _drag.worldFrom = { t: world.t, p: world.p };
  }
}

export class DrawingEngine {
  constructor({ onChange, onCommit } = {}) {
    this.onChange = onChange;
    this.onCommit = onCommit;

    this.canvas = null;
    this.ctx = null;

    this.getTransform = () => new ChartTransformAdapter();
    this.transform = new ChartTransformAdapter();

    this.objects = [];
    this.activeToolId = null;
    this.activeTool = null;

    this.pointer = {
      isDown: false,
      id: null,
      x: 0,
      y: 0,
      world: { t: NaN, p: NaN },
      downX: 0,
      downY: 0,
      moved: false,
    };

    this._lastValidWorld = { t: NaN, p: NaN, at: 0 };

    this.state = {
      mode: "idle",
      selectedId: null,
      drag: null,
    };

    this.toolbar = { offsetX: 0, offsetY: 0 };

    this._changeQueued = false;

    this.dirty = true;
    this.raf = createRAFLoop(() => {
      if (this.dirty) this.render();
    });
    this.raf.start();
  }

  _now() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  _rememberWorld(w) {
    const t = Number(w?.t);
    const p = Number(w?.p);
    if (Number.isFinite(t) && Number.isFinite(p)) {
      this._lastValidWorld = { t, p, at: this._now() };
    }
  }

  _getRememberedWorld(maxAgeMs = 2500) {
    const lw = this._lastValidWorld;
    const t = Number(lw?.t);
    const p = Number(lw?.p);
    if (!Number.isFinite(t) || !Number.isFinite(p)) return null;

    const age = this._now() - (Number(lw?.at) || 0);
    if (age >= 0 && age <= maxAgeMs) return { t, p };
    return null;
  }

  // ✅ CrosshairStore como fonte principal quando disponível
  _getCrosshairWorld(maxAgeMs) {
    try {
      const snap = CrosshairStore.get(maxAgeMs);
      if (!snap) return null;

      const t = Number(snap.t);
      const p = Number(snap.p);

      if (Number.isFinite(t) && Number.isFinite(p)) return { t, p };
    } catch {}
    return null;
  }

  // ✅ Seleção “robusta”: Crosshair (se houver) > transform > remembered
  _pickRobustWorld(worldFromTransform, maxAgeMsForCrosshair) {
    const cross = this._getCrosshairWorld(maxAgeMsForCrosshair);
    if (cross) return cross;

    const t = Number(worldFromTransform?.t);
    const p = Number(worldFromTransform?.p);
    if (Number.isFinite(t) && Number.isFinite(p)) return worldFromTransform;

    const remembered = this._getRememberedWorld(3500);
    if (remembered) return remembered;

    return worldFromTransform || { t: NaN, p: NaN };
  }

  destroy() {
    this.raf.stop();
    this.canvas = null;
    this.ctx = null;
  }

  attachCanvas(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  setGetTransform(fn) {
    this.getTransform = typeof fn === "function" ? fn : this.getTransform;
  }

  setActiveToolId(id) {
    this.activeToolId = id || null;
    this.activeTool = this.activeToolId ? createToolById(this.activeToolId, DEFAULT_STYLE) : null;

    if (this.activeTool?.reset) this.activeTool.reset();
    this.state.mode = "idle";
    this.invalidate();
  }

  resizeToCanvasCSSPixels() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));

    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;

    this.invalidate();
  }

  invalidate() {
    this.dirty = true;
  }

  clearAll() {
    this.objects = [];
    this.state.selectedId = null;
    this._emitChange();
    this.invalidate();
  }

  exportJSON() {
    return JSON.stringify(
      this.objects.map((o) => (o?.toJSON ? o.toJSON() : o)),
      null,
      2
    );
  }

  importJSON(json) {
    try {
      const arr = typeof json === "string" ? JSON.parse(json) : json;
      if (!Array.isArray(arr)) return;

      const created = [];

      for (const raw of arr) {
        if (!raw || typeof raw !== "object") continue;

        const type = normType(raw.type || raw.kind || raw.objectType || raw.idType);

        const a = pickWorldPt(raw, ["a", "p1", "from", "A"]) || null;
        const b = pickWorldPt(raw, ["b", "p2", "to", "B"]) || null;

        const start = pickWorldPt(raw, ["start"]) || a;
        const end = pickWorldPt(raw, ["end"]) || b;

        const onlyP = toNum(raw.p ?? raw.price ?? raw.y);
        const onlyT = toNum(raw.t ?? raw.time ?? raw.x);

        let obj = null;

        if (!obj && type === "rectangle_box") {
          if (a && b) obj = new RectangleBox(a, b);
          else if (start && end) obj = new RectangleBox(start, end);
        }

        if (!obj && type === "fibonacci_retracement") {
          if (a && b) obj = new FibonacciRetracement(a, b);
          else if (start && end) obj = new FibonacciRetracement(start, end);
        }

        if (!obj && (type.includes("fibo") || type.includes("fib") || type === "fibonacci")) {
          if (start && end) obj = new PersistedFibonacci(start, end, raw.type || "fibonacci");
        }

        if (!obj && (type.includes("rect") || type.includes("rectangle") || type === "box" || type === "range_box")) {
          if (start && end) obj = new PersistedRectangle(start, end, raw.type || "rectangle");
        }

        if (!obj && (type.includes("trend") || type.includes("infinite") || type === "infinite_line")) {
          if (a && b) obj = new InfiniteLine(a, b);
          else if (a && onlyT != null && onlyP != null) obj = new InfiniteLine(a, { t: onlyT, p: onlyP });
          else if (a && onlyT != null) obj = new InfiniteLine(a, { t: onlyT, p: a.p });
          else if (a && onlyP != null) obj = new InfiniteLine(a, { t: a.t + 1, p: onlyP });
        }

        if (!obj && (type.includes("horizontal") || type === "hline" || type === "horizontal_line")) {
          const hWorld = {
            t: toNum(raw.t ?? a?.t ?? start?.t),
            p: toNum(raw.p ?? raw.price ?? raw.y ?? a?.p ?? start?.p),
            l: toNum(raw.l ?? a?.l ?? start?.l),
          };
          if (hWorld.p != null && (hWorld.t != null || hWorld.l != null)) obj = new HorizontalLine(hWorld);
        }

        if (!obj && (type.includes("vertical") || type === "vline" || type === "vertical_line")) {
          const vWorld = {
            t: toNum(raw.t ?? raw.time ?? raw.x ?? a?.t ?? start?.t),
            p: toNum(raw.p ?? raw.price ?? raw.y ?? a?.p ?? start?.p),
            l: toNum(raw.l ?? a?.l ?? start?.l),
          };
          if (vWorld.p != null && (vWorld.t != null || vWorld.l != null)) obj = new VerticalLine(vWorld);
        }

        if (!obj && (type.includes("segment") || type === "segment_line" || type === "line" || type === "segment")) {
          if (a && b) obj = new SegmentLine(a, b);
        }

        if (!obj && a && b) obj = new SegmentLine(a, b);
        if (!obj) continue;

        try {
          obj.id = raw.id || genId();
        } catch {}
        try {
          obj.locked = !!raw.locked;
        } catch {}

        try {
          const nextStyle = mergeStyleWithDefaults(raw.style);
          if (obj.setStyle) obj.setStyle(nextStyle);
          else obj.style = nextStyle;
        } catch {}

        try {
          if (obj instanceof PersistedFibonacci && Array.isArray(raw.levels) && raw.levels.length) {
            obj.levels = raw.levels.map((n) => Number(n)).filter((n) => Number.isFinite(n));
          }
          if (obj instanceof FibonacciRetracement && Array.isArray(raw.levels) && raw.levels.length) {
            obj.levels = raw.levels.map((n) => Number(n)).filter((n) => Number.isFinite(n));
          }
        } catch {}

        created.push(obj);
      }

      this.objects = created;
      this.state.selectedId = null;
      this.state.mode = "idle";
      this.state.drag = null;

      this._emitChange();
      this.invalidate();

      try {
        this.render();
      } catch {}
    } catch (e) {
      console.warn("[Drawings] importJSON failed", e);
    }
  }

  // ✅ FIX REAL “SOBERANO”:
  // x/y sempre no mesmo espaço do transform (coordEl), mas o WORLD vem do CrosshairStore
  // quando disponível (principal).
  _updatePointerFromClientEvent(e, hostEl, { forUp = false } = {}) {
    if (!hostEl) return;

    this.transform = this.getTransform?.() || new ChartTransformAdapter();

    const baseEl = this.transform?.coordEl || hostEl;
    const rect = baseEl.getBoundingClientRect();

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.pointer.x = x;
    this.pointer.y = y;

    this.transform.setViewport({
      width: rect.width,
      height: rect.height,
      dpr: window.devicePixelRatio || 1,
    });

    // 1) tenta transform
    let w = { t: NaN, p: NaN };
    if (typeof this.transform?.xyToTimePrice === "function") {
      w = this.transform.xyToTimePrice({ x, y });
    } else if (typeof this.transform?.clientXYToTimePrice === "function") {
      w = this.transform.clientXYToTimePrice(e.clientX, e.clientY);
    }

    // 2) escolhe “robusto”: Crosshair > transform > remembered
    const maxAge = forUp ? CROSSHAIR_UP_MAX_AGE : CROSSHAIR_MOVE_MAX_AGE;
    w = this._pickRobustWorld(w, maxAge);

    this.pointer.world = w;

    if (Number.isFinite(Number(w?.t)) && Number.isFinite(Number(w?.p))) {
      this._rememberWorld(w);
    }
  }

  onHostPointerDown(e, hostEl) {
    this._updatePointerFromClientEvent(e, hostEl, { forUp: false });

    this.pointer.isDown = true;
    this.pointer.id = e.pointerId;
    this.pointer.downX = this.pointer.x;
    this.pointer.downY = this.pointer.y;
    this.pointer.moved = false;

    const hit = this._hitTest(this.pointer.x, this.pointer.y);
    if (hit) {
      this.state.selectedId = hit.objectId;

      const obj = this._getSelectedObject();
      if (obj?.locked || obj?.isLocked?.()) {
        this.state.mode = "idle";
        this.state.drag = null;
        this.invalidate();
        return true;
      }

      if (hit.type === "handle") {
        this.state.mode = "draggingHandle";
        this.state.drag = hit;
        this.invalidate();
        return true;
      }

      if (hit.type === "body") {
        const wf = this.pointer.world;
        this.state.mode = "draggingObject";
        this.state.drag = { ...hit, worldFrom: { ...wf } };
        this.invalidate();
        return true;
      }
    } else {
      if (!this.activeTool && this.state.selectedId) {
        this.state.selectedId = null;
        this.state.mode = "idle";
        this.state.drag = null;
        this.invalidate();
        return false;
      }
    }

    if (this.activeTool) {
      this.state.mode = "placing";

      if (this.activeTool.beginOnPointerDown?.()) {
        this.activeTool.onBegin?.(this, this.pointer);
        this.invalidate();
        return true;
      }

      this.invalidate();
      return false;
    }

    this.state.mode = "idle";
    this.invalidate();
    return false;
  }

  onHostPointerMove(e, hostEl) {
    this._updatePointerFromClientEvent(e, hostEl, { forUp: false });

    if (!this.pointer.isDown) {
      if (this.activeTool?.needsPreview?.()) {
        this.activeTool.onHoverMove?.(this, this.pointer);
        this.invalidate();
      }
      return false;
    }

    const metrics = getViewportMetrics();

    const dx = this.pointer.x - this.pointer.downX;
    const dy = this.pointer.y - this.pointer.downY;
    if (Math.abs(dx) > metrics.clickTol || Math.abs(dy) > metrics.clickTol) {
      this.pointer.moved = true;
    }

    if (this.state.mode === "draggingHandle") {
      const obj = this._getSelectedObject();
      if (obj && this.state.drag?.handleId != null) {
        if (obj?.locked || obj?.isLocked?.()) return true;

        obj.moveHandle?.(this.state.drag.handleId, this.pointer.world);
        this._emitChangeDebounced();
        this.invalidate();
        return true;
      }
      return false;
    }

    if (this.state.mode === "draggingObject") {
      const obj = this._getSelectedObject();
      if (obj) {
        if (obj?.locked || obj?.isLocked?.()) return true;

        obj.moveByDrag?.(this.state.drag, this.pointer.world);
        this._emitChangeDebounced();
        this.invalidate();
        return true;
      }
      return false;
    }

    if (this.state.mode === "placing" && this.activeTool?.onDragMove && this.pointer.isDown) {
      this.activeTool.onDragMove(this, this.pointer);
      this.invalidate();
      return true;
    }

    if (this.state.mode === "placing" && this.activeTool?.needsPreview?.()) {
      this.activeTool.onHoverMove?.(this, this.pointer);
      this.invalidate();
      return false;
    }

    return false;
  }

  onHostPointerUp(e, hostEl) {
    if (this.pointer.id !== e.pointerId) return false;

    this._updatePointerFromClientEvent(e, hostEl, { forUp: true });

    const wasDown = this.pointer.isDown;
    const moved = this.pointer.moved;
    const metrics = getViewportMetrics();

    this.pointer.isDown = false;

    if (this.state.mode === "draggingHandle" || this.state.mode === "draggingObject") {
      this.state.mode = "idle";
      this.state.drag = null;
      this._emitChange();
      this.invalidate();
      return true;
    }

    if (wasDown && this.activeTool && this.state.mode === "placing" && this.activeTool.onEnd) {
      const dx = this.pointer.x - this.pointer.downX;
      const dy = this.pointer.y - this.pointer.downY;
      const dist = Math.hypot(dx, dy);

      if (moved && dist >= metrics.dragCommitTol) {
        const committed = this.activeTool.onEnd(this, this.pointer, { commit: true });
        if (committed) {
          this._emitChange();
          this.invalidate();
          this.onCommit?.();
          this.state.mode = "idle";
          return true;
        }
      } else {
        const committed = this.activeTool.onClickPlace?.(this, this.pointer);
        if (committed) {
          this._emitChange();
          this.invalidate();
          this.onCommit?.();
          this.state.mode = "idle";
          return true;
        }
        this.invalidate();
        return true;
      }

      this.invalidate();
      return true;
    }

    this.state.mode = "idle";
    this.state.drag = null;
    this.invalidate();
    return false;
  }

  addObject(obj) {
    if (!obj) return;

    try {
      const cur = obj.style || obj.getStyle?.() || {};
      const next = mergeStyleWithDefaults(cur);
      if (obj.setStyle) obj.setStyle(next);
      else obj.style = next;
    } catch {}

    if (obj instanceof RectangleBox || obj instanceof FibonacciRetracement) {
      this.objects.push(obj);
      this.state.selectedId = obj.id;

      this.toolbar.offsetX = 0;
      this.toolbar.offsetY = 0;

      this.invalidate();
      return;
    }

    this.objects.push(obj);
    this.state.selectedId = obj.id;

    this.toolbar.offsetX = 0;
    this.toolbar.offsetY = 0;

    this.invalidate();
  }

  _getSelectedObject() {
    if (!this.state.selectedId) return null;
    return this.objects.find((o) => o?.id === this.state.selectedId) || null;
  }

  _hitTest(x, y) {
    const metrics = getViewportMetrics();

    const selected = this._getSelectedObject();
    const ordered = selected
      ? [selected, ...this.objects.filter((o) => o?.id !== selected.id)]
      : [...this.objects].reverse();

    for (const obj of ordered) {
      const hit = obj?.hitTest?.(
        { x, y },
        this.transform,
        {
          hitEps: metrics.hitEps,
          handleRadius: metrics.handleRadius,
        }
      );
      if (hit) return hit;
    }
    return null;
  }

  render() {
    if (!this.canvas || !this.ctx) return;
    this.dirty = false;

    try {
      const dpr = window.devicePixelRatio || 1;
      const t = this.getTransform?.() || this.transform || new ChartTransformAdapter();

      const baseEl = t?.coordEl || this.canvas.parentElement || this.canvas;

      const rect = baseEl.getBoundingClientRect();
      this.transform = t;
      this.transform.setViewport({ width: rect.width, height: rect.height, dpr });
    } catch {}

    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    for (const obj of this.objects) {
      const isSelected = obj?.id === this.state.selectedId;
      const isLocked = !!(obj?.locked || obj?.isLocked?.());
      const selectedForDraw = isSelected && !isLocked;
      obj?.draw?.(ctx, this.transform, { selected: selectedForDraw });
    }

    if (this.activeTool?.needsPreview?.() && this.activeTool?.drawPreview) {
      this.activeTool.drawPreview(ctx, this.transform);
    }
  }

  _emitChange() {
    this.onChange?.(this.objects);
  }

  _emitChangeDebounced() {
    if (this._changeQueued) return;
    this._changeQueued = true;
    requestAnimationFrame(() => {
      this._changeQueued = false;
      this._emitChange();
    });
  }

  getSelectedSnapshot() {
    const obj = this._getSelectedObject();
    if (!obj) return null;

    const style = obj.style || obj.getStyle?.() || {};
    const locked = !!(obj.locked || obj.isLocked?.());

    const anchorWorld = obj.getAnchorWorld?.() || obj.a || obj.p1 || obj.start || this.pointer.world;
    const pt = this.transform.timePriceToXY({ t: anchorWorld?.t, p: anchorWorld?.p });

    const x = Number(pt?.x);
    const y = Number(pt?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    return {
      id: obj.id,
      type: obj.type || obj.kind || "drawing",
      locked,
      style: {
        color: style.color || style.stroke || DEFAULT_STYLE.color,
        width: Number(style.width || style.strokeWidth || DEFAULT_STYLE.width),
        stroke: style.stroke || style.color || DEFAULT_STYLE.stroke,
        strokeWidth: Number(style.strokeWidth || style.width || DEFAULT_STYLE.strokeWidth),
        fill: style.fill ?? style.fillColor ?? style.background ?? style.bg,
        fillOpacity: style.fillOpacity ?? style.opacity ?? style.alpha,
      },
      anchor: {
        x: x + (this.toolbar.offsetX || 0),
        y: y + (this.toolbar.offsetY || 0),
      },
      toolbarOffset: { ...this.toolbar },
    };
  }

  setSelectedStyle(patch) {
    const obj = this._getSelectedObject();
    if (!obj) return;

    const locked = !!(obj.locked || obj.isLocked?.());
    if (locked) return;

    const safePatch = stripUndefined(patch);

    if (isRectType(obj)) {
      const nextStroke = safePatch.stroke ?? safePatch.color;
      const hasExplicitFill = Object.prototype.hasOwnProperty.call(safePatch, "fill");
      if (nextStroke && !hasExplicitFill) {
        safePatch.fill = colorToRgba(nextStroke, 0.10);
      }
    }

    const next = {
      ...(obj.style || {}),
      ...(safePatch || {}),
    };

    if (obj.setStyle) obj.setStyle(next);
    else obj.style = next;

    this._emitChange();
    this.invalidate();
  }

  toggleSelectedLock() {
    const obj = this._getSelectedObject();
    if (!obj) return;

    if (obj.toggleLock) obj.toggleLock();
    else obj.locked = !obj.locked;

    const locked = !!(obj.locked || obj.isLocked?.());
    if (locked) {
      this.state.mode = "idle";
      this.state.drag = null;
      this.pointer.moved = false;
    }

    this._emitChange();
    this.invalidate();
  }

  deleteSelected() {
    const id = this.state.selectedId;
    if (!id) return;
    this.objects = this.objects.filter((o) => o?.id !== id);
    this.state.selectedId = null;
    this._emitChange();
    this.invalidate();
  }

  setSelectedToolbarOffset(offset) {
    if (!offset) return;
    const ox = Number(offset.x);
    const oy = Number(offset.y);
    if (Number.isFinite(ox)) this.toolbar.offsetX = ox;
    if (Number.isFinite(oy)) this.toolbar.offsetY = oy;
    this.invalidate();
  }

  duplicateSelected() {
    const obj = this._getSelectedObject();
    if (!obj) return;

    const locked = !!(obj.locked || obj.isLocked?.());
    if (locked) return;

    this.state.mode = "idle";
    this.state.drag = null;
    this.pointer.moved = false;

    let dup = null;

    try {
      if (typeof obj.clone === "function") dup = obj.clone();
    } catch {}

    if (!dup) {
      try {
        dup = Object.create(Object.getPrototypeOf(obj));
        const data = typeof structuredClone === "function" ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
        Object.assign(dup, data);
      } catch {
        return;
      }
    }

    const newId = genId();
    try {
      dup.id = newId;
    } catch {}
    try {
      dup.locked = false;
    } catch {}

    try {
      const cur = dup.style || dup.getStyle?.() || {};
      const next = mergeStyleWithDefaults(cur);
      if (dup.setStyle) dup.setStyle(next);
      else dup.style = next;
    } catch {}

    this.objects.push(dup);
    this.state.selectedId = dup.id || newId;

    this.toolbar.offsetX = 0;
    this.toolbar.offsetY = 0;

    this._emitChange();
    this.invalidate();
    this.onCommit?.();
  }
}