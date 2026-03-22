import { BaseObject } from "./BaseObject";
import { dist } from "../core/math";

function toNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isFinitePt(pt) {
  return !!pt && Number.isFinite(Number(pt.x)) && Number.isFinite(Number(pt.y));
}

const DEFAULT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];

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

export class FibonacciRetracement extends BaseObject {
  constructor(aWorld, bWorld) {
    super("fibonacci_retracement");
    this.a = { ...aWorld };
    this.b = { ...bWorld };

    this.aScreen = null;
    this.bScreen = null;

    if (!this.style) this.style = {};
    if (!Array.isArray(this.levels)) this.levels = DEFAULT_LEVELS;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      a: this.a,
      b: this.b,
      levels: this.levels,
      style: this.style || {},
    };
  }

  _getStyle() {
    const s = this.style || {};
    const stroke = s.stroke || s.color || "rgba(0, 132, 255, 0.98)";
    const width = toNum(s.strokeWidth ?? s.width, 2);
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

    const { stroke, width, alpha, dash } = this._getStyle();

    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x, b.x);

    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, width);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.setLineDash(dash && dash.length ? dash : []);
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "rgba(235,241,255,0.85)";

    {
      ctx.save();

      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1;

      const baseAlpha = Math.max(0, Math.min(1, alpha));
      ctx.globalAlpha = Math.min(baseAlpha, 0.85);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      ctx.restore();
    }

    if (preview) {
      const yA = a.y;
      const yB = b.y;
      const dy = yB - yA;

      ctx.setLineDash(dash && dash.length ? dash : []);
      ctx.lineWidth = Math.max(1, width);
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

      for (const r of this.levels || DEFAULT_LEVELS) {
        const y = yA + dy * r;
        if (!Number.isFinite(y)) continue;

        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();

        const label = `${(r * 100).toFixed(1)}%`;
        ctx.fillText(label, x2 + 6, y + 4);
      }

      if (selected) {
        this._drawHandles(ctx, a, b, { stroke, width });
      }

      ctx.restore();
      return;
    }

    const pA = this.a.p;
    const pB = this.b.p;
    const dp = pB - pA;

    ctx.setLineDash(dash && dash.length ? dash : []);
    ctx.lineWidth = Math.max(1, width);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    for (const r of this.levels || DEFAULT_LEVELS) {
      const p = pA + dp * r;
      const y = transform.timePriceToXY({ t: this.a.t, p }).y;
      if (!Number.isFinite(y)) continue;

      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();

      const label = `${(r * 100).toFixed(1)}%`;
      ctx.fillText(label, x2 + 6, y + 4);
    }

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

    if (dist(screenPt.x, screenPt.y, a.x, a.y) <= handleRadius) {
      return { type: "handle", objectId: this.id, handleId: 0 };
    }
    if (dist(screenPt.x, screenPt.y, b.x, b.y) <= handleRadius) {
      return { type: "handle", objectId: this.id, handleId: 1 };
    }

    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x, b.x);
    if (screenPt.x < x1 - 12 || screenPt.x > x2 + 60) return null;

    const pA = this.a.p;
    const pB = this.b.p;
    const dp = pB - pA;

    const eps = Math.max(hitEps, toNum(this.style?.hitStrokeWidth, hitEps));

    for (const r of this.levels || DEFAULT_LEVELS) {
      const p = pA + dp * r;
      const y = transform.timePriceToXY({ t: this.a.t, p }).y;
      if (!Number.isFinite(y)) continue;

      if (Math.abs(screenPt.y - y) <= eps) {
        return { type: "body", objectId: this.id, anchor: { a: this.a, b: this.b }, startWorld: null };
      }
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