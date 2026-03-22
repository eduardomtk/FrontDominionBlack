import { BaseObject } from "./BaseObject";
import { dist } from "../core/math";

function toNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isFinitePt(pt) {
  return !!pt && Number.isFinite(Number(pt.x)) && Number.isFinite(Number(pt.y));
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
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

export class RectangleBox extends BaseObject {
  constructor(aWorld, bWorld) {
    super("rectangle_box");
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
    };
  }

  _getStyle() {
    const s = this.style || {};
    const stroke = s.stroke || s.color || "rgba(0, 132, 255, 0.98)";
    const width = toNum(s.strokeWidth ?? s.width, 3);

    const alpha = toNum(s.alpha ?? s.opacity, 1);

    const dash = Array.isArray(s.dash) ? s.dash : null;
    const hitStrokeWidth = toNum(s.hitStrokeWidth, 10);

    const fill = s.fill || "rgba(0, 132, 255, 0.10)";
    const fillOpacity = toNum(s.fillOpacity, 1);

    return { stroke, width, alpha, dash, hitStrokeWidth, fill, fillOpacity };
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
      } else return;
    } else {
      if (!aOk || !bOk) return;
    }

    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x, b.x);
    const y2 = Math.max(a.y, b.y);

    const { stroke, width, alpha, dash, fill, fillOpacity } = this._getStyle();

    ctx.save();

    ctx.globalAlpha = clamp(fillOpacity, 0, 1);
    ctx.fillStyle = fill;
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, width);
    ctx.setLineDash(dash && dash.length ? dash : []);
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    if (selected) {
      this._drawHandles(ctx, x1, y1, x2, y2, { stroke, width });
    }

    ctx.restore();
  }

  _drawHandles(ctx, x1, y1, x2, y2, { stroke, width } = {}) {
    const { visualRadius } = getHandleMetrics();
    const r = Math.max(toNum(this.style?.pointRadius, visualRadius), visualRadius);

    ctx.save();
    ctx.strokeStyle = stroke || "rgba(0, 132, 255, 0.98)";
    ctx.fillStyle = "rgba(12,18,30,0.95)";
    ctx.lineWidth = Math.max(1, Math.min(2, toNum(width, 2)));

    const pts = [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ];

    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  hitTest(screenPt, transform, { hitEps = 8, handleRadius = 6 } = {}) {
    let a = transform.timePriceToXY(this.a);
    let b = transform.timePriceToXY(this.b);

    if (!isFinitePt(a) || !isFinitePt(b)) {
      if (isFinitePt(this.aScreen) && isFinitePt(this.bScreen)) {
        a = this.aScreen;
        b = this.bScreen;
      } else {
        return null;
      }
    }

    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x, b.x);
    const y2 = Math.max(a.y, b.y);

    const corners = [
      { x: x1, y: y1, id: 0 },
      { x: x2, y: y1, id: 1 },
      { x: x2, y: y2, id: 2 },
      { x: x1, y: y2, id: 3 },
    ];

    for (const c of corners) {
      if (dist(screenPt.x, screenPt.y, c.x, c.y) <= handleRadius) {
        return { type: "handle", objectId: this.id, handleId: c.id };
      }
    }

    const eps = Math.max(hitEps, toNum(this.style?.hitStrokeWidth, hitEps));
    const inside =
      screenPt.x >= x1 - eps &&
      screenPt.x <= x2 + eps &&
      screenPt.y >= y1 - eps &&
      screenPt.y <= y2 + eps;

    if (inside) {
      return { type: "body", objectId: this.id, anchor: { a: this.a, b: this.b }, startWorld: null };
    }

    return null;
  }

  moveHandle(handleId, worldPt) {
    if (handleId === 0) this.a = { ...worldPt };
    if (handleId === 2) this.b = { ...worldPt };

    if (handleId === 1) {
      this.a = { t: this.a.t, p: worldPt.p };
      this.b = { t: worldPt.t, p: this.b.p };
    }
    if (handleId === 3) {
      this.a = { t: worldPt.t, p: this.a.p };
      this.b = { t: this.b.t, p: worldPt.p };
    }
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