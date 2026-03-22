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

export class SegmentLine extends BaseObject {
  constructor(aWorld, bWorld) {
    super("segment_line");

    this.a = { ...(aWorld || { t: NaN, p: NaN, l: NaN }) };
    this.b = { ...(bWorld || { t: NaN, p: NaN, l: NaN }) };

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

  _getStrokeStyle() {
    const s = this.style || {};
    const stroke = s.stroke || s.color || "rgba(0, 132, 255, 0.98)";
    const width = toNum(s.strokeWidth ?? s.width, 3);
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

    const { stroke, width, alpha, dash } = this._getStrokeStyle();

    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, width);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(dash && dash.length ? dash : []);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
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

  hitTest(screenPt, transform, { hitEps = 8, handleRadius = 6 } = {}) {
    const a = transform.timePriceToXY(this.a);
    const b = transform.timePriceToXY(this.b);

    if (!isFinitePt(a) || !isFinitePt(b)) return null;

    const { hitStrokeWidth } = this._getStrokeStyle();
    const eps = Math.max(hitEps, toNum(hitStrokeWidth, hitEps));

    if (dist(screenPt.x, screenPt.y, a.x, a.y) <= handleRadius) {
      return { type: "handle", objectId: this.id, handleId: 0 };
    }
    if (dist(screenPt.x, screenPt.y, b.x, b.y) <= handleRadius) {
      return { type: "handle", objectId: this.id, handleId: 1 };
    }

    const d = distancePointToSegment(screenPt.x, screenPt.y, a.x, a.y, b.x, b.y);
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
    if (handleId === 0) this.a = { ...(worldPt || {}) };
    if (handleId === 1) this.b = { ...(worldPt || {}) };
  }

  moveByDrag(dragInfo, worldPt) {
    if (!dragInfo.startWorld) {
      dragInfo.startWorld = { ...(worldPt || {}) };
      dragInfo.anchor = { a: { ...this.a }, b: { ...this.b } };
      return;
    }

    const dt = Number(worldPt?.t) - Number(dragInfo.startWorld?.t);
    const dp = Number(worldPt?.p) - Number(dragInfo.startWorld?.p);

    const a0 = dragInfo.anchor?.a || this.a;
    const b0 = dragInfo.anchor?.b || this.b;

    const lNow = Number(worldPt?.l);
    const lStart = Number(dragInfo.startWorld?.l);

    if (Number.isFinite(lNow) && Number.isFinite(lStart)) {
      const dl = lNow - lStart;
      this.a = { t: Number(a0.t) + dt, p: Number(a0.p) + dp, l: Number(a0.l) + dl };
      this.b = { t: Number(b0.t) + dt, p: Number(b0.p) + dp, l: Number(b0.l) + dl };
      return;
    }

    this.a = { t: Number(a0.t) + dt, p: Number(a0.p) + dp, l: a0.l };
    this.b = { t: Number(b0.t) + dt, p: Number(b0.p) + dp, l: b0.l };
  }
}