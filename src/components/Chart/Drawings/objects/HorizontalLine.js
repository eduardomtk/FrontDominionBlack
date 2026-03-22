// src/components/Chart/Drawings/objects/HorizontalLine.js
import { BaseObject } from "./BaseObject";
import { dist } from "../core/math";

function toNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export class HorizontalLine extends BaseObject {
  constructor(worldPt) {
    super("horizontal_line");

    this.t = Number(worldPt?.t);
    this.p = Number(worldPt?.p);
    this.tf = worldPt?.tf || "H1";

    // preview fallback (screen)
    this.yScreen = null;

    if (!this.style) this.style = {};
  }

  toJSON() {
    return {
      ...super.toJSON(),
      t: this.t,
      p: this.p,
      tf: this.tf,
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

  _getViewport(transform, ctx) {
    const dpr = window.devicePixelRatio || 1;
    const w = transform?.viewport?.width ?? (ctx?.canvas?.width ? ctx.canvas.width / dpr : 800);
    const h = transform?.viewport?.height ?? (ctx?.canvas?.height ? ctx.canvas.height / dpr : 600);
    return { w, h };
  }

  draw(ctx, transform, { selected, preview } = {}) {
    const { w } = this._getViewport(transform, ctx);

    let y = NaN;

    // ✅ preview: screen soberano
    if (preview && Number.isFinite(Number(this.yScreen))) {
      y = Number(this.yScreen);
    } else {
      // ✅ non-preview: usa world (com l se existir)
      const pt = transform.timePriceToXY({ t: this.t, p: this.p });
      y = Number(pt?.y);
    }

    if (!Number.isFinite(y)) return;

    const { stroke, width, alpha, dash } = this._getStrokeStyle();

    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, width);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.lineCap = "round";
    ctx.setLineDash(dash && dash.length ? dash : []);

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();

    if (selected) {
      this._drawHandle(ctx, w * 0.5, y, { stroke, width });
    }

    ctx.restore();
  }

  _drawHandle(ctx, x, y, { stroke, width } = {}) {
    const r = 5;
    ctx.save();
    ctx.strokeStyle = stroke || "rgba(0, 132, 255, 0.98)";
    ctx.lineWidth = Math.max(1, Math.min(2, toNum(width, 2)));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  hitTest(screenPt, transform, { hitEps = 8, handleRadius = 6 } = {}) {
    const pt = transform.timePriceToXY({ t: this.t, p: this.p });
    const y = Number(pt?.y);
    if (!Number.isFinite(y)) return null;

    const xMid = (transform?.viewport?.width ?? 800) * 0.5;

    if (dist(screenPt.x, screenPt.y, xMid, y) <= handleRadius) {
      return { type: "handle", objectId: this.id, handleId: 0 };
    }

    const eps = Math.max(hitEps, toNum(this.style?.hitStrokeWidth, hitEps));
    if (Math.abs(screenPt.y - y) <= eps) {
      return { type: "body", objectId: this.id, anchor: { p: this.p, t: this.t, tf: this.tf }, startWorld: null };
    }

    return null;
  }

  moveHandle(handleId, worldPt) {
    if (handleId !== 0) return;

    const p = Number(worldPt?.p);
    const t = Number(worldPt?.t);
    if (Number.isFinite(p)) this.p = p;
    if (Number.isFinite(t)) this.t = t;
  }

  moveByDrag(dragInfo, worldPt) {
    if (!dragInfo.startWorld) {
      dragInfo.startWorld = { ...worldPt };
      dragInfo.anchor = { p: this.p, t: this.t, tf: this.tf };
      return;
    }

    const a = dragInfo.anchor || { p: this.p, t: this.t, tf: this.tf };
    const pNow = Number(worldPt?.p);
    const tNow = Number(worldPt?.t);

    const pStart = Number(dragInfo.startWorld?.p);

    // ✅ horizontal: o que importa é price (Y). Mesmo assim mantemos l/t atualizados por consistência
    if (Number.isFinite(pNow) && Number.isFinite(pStart) && Number.isFinite(Number(a.p))) {
      const dp = pNow - pStart;
      this.p = Number(a.p) + dp;
    } else if (Number.isFinite(pNow)) {
      this.p = pNow;
    }

    if (Number.isFinite(tNow)) this.t = tNow;
  }
}
