import { BaseObject } from "./BaseObject";
import { distancePointToSegment } from "../core/hitTest";
import { dist } from "../core/math";

function toNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isFinitePt(pt) {
  return !!pt && Number.isFinite(Number(pt.x)) && Number.isFinite(Number(pt.y));
}

function getHandleMetrics() {
  if (typeof window === "undefined") {
    return { visualRadius: 5 };
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

  if (isMobile && isPortrait) return { visualRadius: 8 };
  if (isMobile && !isPortrait) return { visualRadius: 7 };
  if (isTablet) return { visualRadius: 6 };

  return { visualRadius: 5 };
}

/**
 * ✅ Linha de tendência (semi-reta / ray):
 * começa em A e vai "infinito" apenas no sentido A -> B (t >= 0).
 *
 * Render: recorta o trecho visível dentro do viewport.
 */
export class InfiniteLine extends BaseObject {
  constructor(aWorld, bWorld) {
    super("infinite_line");
    this.a = { ...aWorld };
    this.b = { ...bWorld };

    this.aScreen = null;
    this.bScreen = null;

    if (!this.style) this.style = {};
  }

  toJSON() {
    return {
      ...super.toJSON(),
      a: this.a,
      b: this.b,
      style: this.style || {},
      locked: !!this.locked,
    };
  }

  getAnchorWorld() {
    return this.a || null;
  }

  _getStrokeStyle() {
    const s = this.style || {};
    const stroke = s.stroke || s.color || "rgba(0, 132, 255, 0.98)";
    const width = toNum(s.strokeWidth ?? s.width, 2);
    const alpha = toNum(s.alpha ?? s.opacity, 1);
    const dash = Array.isArray(s.dash) ? s.dash : null;
    const hitStrokeWidth = toNum(s.hitStrokeWidth, 10);
    return { stroke, width, alpha, dash, hitStrokeWidth };
  }

  draw(ctx, transform, { selected, preview } = {}) {
    let a = transform.timePriceToXY(this.a);
    let b = transform.timePriceToXY(this.b);

    const aOk = isFinitePt(a);
    const bOk = isFinitePt(b);

    if ((!aOk || !bOk) && preview) {
      if (isFinitePt(this.aScreen) && isFinitePt(this.bScreen)) {
        a = this.aScreen;
        b = this.bScreen;
      } else {
        return;
      }
    } else {
      if (!aOk || !bOk) return;
    }

    const dpr = window.devicePixelRatio || 1;
    const w = ctx.canvas.width / dpr;
    const h = ctx.canvas.height / dpr;

    const seg = this._clipRayToViewport(a, b, w, h);
    if (!seg) return;

    const { stroke, width, alpha, dash } = this._getStrokeStyle();

    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, width);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(dash && dash.length ? dash : []);

    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();

    if (selected) {
      this._drawHandles(ctx, a, b, { stroke, width });
    }

    ctx.restore();
  }

  _drawHandles(ctx, a, b, { stroke, width } = {}) {
    const { visualRadius } = getHandleMetrics();
    const r = Math.max(toNum(this.style?.pointRadius, visualRadius), visualRadius);

    ctx.save();
    ctx.strokeStyle = stroke || "rgba(0, 132, 255, 0.98)";
    ctx.fillStyle = "rgba(12,18,30,0.95)";
    ctx.lineWidth = Math.max(1, Math.min(2, toNum(width, 2)));

    ctx.beginPath();
    ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  _clipRayToViewport(a, b, w, h) {
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;

    const dx = b.x - a.x;
    const dy = b.y - a.y;

    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return null;

    const candidates = [];

    if (a.x >= 0 && a.x <= w && a.y >= 0 && a.y <= h) {
      candidates.push({ t: 0, x: a.x, y: a.y });
    }

    const addIfValid = (t, x, y) => {
      if (!Number.isFinite(t) || t < 0) return;
      if (x < -1e-6 || x > w + 1e-6 || y < -1e-6 || y > h + 1e-6) return;
      candidates.push({ t, x, y });
    };

    if (Math.abs(dx) > 1e-9) {
      let t = (0 - a.x) / dx;
      addIfValid(t, 0, a.y + t * dy);

      t = (w - a.x) / dx;
      addIfValid(t, w, a.y + t * dy);
    }

    if (Math.abs(dy) > 1e-9) {
      let t = (0 - a.y) / dy;
      addIfValid(t, a.x + t * dx, 0);

      t = (h - a.y) / dy;
      addIfValid(t, a.x + t * dx, h);
    }

    if (candidates.length < 2) return null;

    const uniq = [];
    for (const p of candidates) {
      const ok = !uniq.some((q) => Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) < 0.5);
      if (ok) uniq.push(p);
    }
    if (uniq.length < 2) return null;

    let min = uniq[0];
    let max = uniq[0];
    for (const p of uniq) {
      if (p.t < min.t) min = p;
      if (p.t > max.t) max = p;
    }

    const L = Math.hypot(max.x - min.x, max.y - min.y);
    if (L < 0.5) return null;

    return { x1: min.x, y1: min.y, x2: max.x, y2: max.y };
  }

  _getViewportForHitTest(transform) {
    const vw =
      Number(transform?.viewport?.width) ||
      Number(transform?.width) ||
      Number(transform?.viewportWidth) ||
      NaN;

    const vh =
      Number(transform?.viewport?.height) ||
      Number(transform?.height) ||
      Number(transform?.viewportHeight) ||
      NaN;

    if (Number.isFinite(vw) && Number.isFinite(vh) && vw > 0 && vh > 0) {
      return { w: vw, h: vh };
    }

    return { w: 5000, h: 3000 };
  }

  hitTest(screenPt, transform, { hitEps = 8, handleRadius = 6 } = {}) {
    const a = transform.timePriceToXY(this.a);
    const b = transform.timePriceToXY(this.b);
    if (!isFinitePt(a) || !isFinitePt(b)) return null;

    if (dist(screenPt.x, screenPt.y, a.x, a.y) <= handleRadius) {
      return { type: "handle", objectId: this.id, handleId: 0 };
    }
    if (dist(screenPt.x, screenPt.y, b.x, b.y) <= handleRadius) {
      return { type: "handle", objectId: this.id, handleId: 1 };
    }

    const { w: vw, h: vh } = this._getViewportForHitTest(transform);

    const seg = this._clipRayToViewport(a, b, vw, vh);
    if (!seg) return null;

    const { hitStrokeWidth } = this._getStrokeStyle();
    const eps = Math.max(hitEps, toNum(hitStrokeWidth, hitEps));

    const d = distancePointToSegment(screenPt.x, screenPt.y, seg.x1, seg.y1, seg.x2, seg.y2);
    if (d <= eps) {
      return {
        type: "body",
        objectId: this.id,
        anchor: { a: this.a, b: this.b },
        startWorld: null,
      };
    }

    return null;
  }

  moveHandle(handleId, worldPt) {
    if (handleId === 0) this.a = { ...worldPt };
    if (handleId === 1) this.b = { ...worldPt };
  }

  moveByDrag(dragInfo, worldPt) {
    if (!dragInfo.startWorld) {
      dragInfo.startWorld = { ...worldPt };
      dragInfo.anchor = { a: { ...this.a }, b: { ...this.b } };
      return;
    }
    const dt = worldPt.t - dragInfo.startWorld.t;
    const dp = worldPt.p - dragInfo.startWorld.p;

    this.a = { t: dragInfo.anchor.a.t + dt, p: dragInfo.anchor.a.p + dp };
    this.b = { t: dragInfo.anchor.b.t + dt, p: dragInfo.anchor.b.p + dp };
  }
}