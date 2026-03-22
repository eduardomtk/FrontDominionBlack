// src/components/Chart/Drawings/tools/VerticalLineTool.js
import { ToolBase } from "./ToolBase";
import { VerticalLine } from "../objects/VerticalLine";
import { canonicalizeH1World, hasFiniteTimePrice } from "./h1Canonical";


export class VerticalLineTool extends ToolBase {
  constructor(defaultStyle) {
    super("vertical", defaultStyle);

    this._stage = 0;
    this._x0 = null;
    this._y0 = null;
  }

  onBegin(engine, pointer) {
    this._stage = 1;

    // ✅ guarda screen inicial
    this._x0 = pointer.x;
    this._y0 = pointer.y;

    // preview inicial
    const w = pointer.world || { t: NaN, p: NaN, l: NaN };
    this.preview = new VerticalLine({ ...w });

    this.preview.xScreen = pointer.x;

    try {
      const cur = this.preview.style || this.preview.getStyle?.() || {};
      const next = { ...(this.defaultStyle || {}), ...cur };
      if (this.preview.setStyle) this.preview.setStyle(next);
      else this.preview.style = next;
    } catch {}

    engine.invalidate();
  }

  onDragMove(engine, pointer) {
    if (!this.preview) return;

    // ✅ preview screen soberano
    this.preview.xScreen = pointer.x;

    // mantém world atualizado (p/ selected/handles e afins)
    this.preview.t = Number(pointer.world?.t);
    this.preview.p = Number(pointer.world?.p);
    this.preview.l = Number(pointer.world?.l);

    engine.invalidate();
  }

  onEnd(engine, pointer, { commit } = {}) {
    if (!this.preview || this._stage !== 1) return false;
    if (!commit) return false;

    // ✅ congelar pelo preview: usa o X final em screen
    const xS = Number.isFinite(Number(this.preview.xScreen)) ? Number(this.preview.xScreen) : pointer.x;
    const yS = pointer.y; // precisa de Y p/ price no xyToTimePrice

    const w = engine?.transform?.xyToTimePrice?.({ x: xS, y: yS }) || { t: NaN, p: NaN, l: NaN };
    if (!hasFiniteTimePrice(w)) return false;

    const canonical = canonicalizeH1World(w);
    const obj = new VerticalLine(canonical);
    obj.xScreen = xS;

    try {
      const cur = obj.style || obj.getStyle?.() || {};
      const next = { ...(this.defaultStyle || {}), ...cur };
      if (obj.setStyle) obj.setStyle(next);
      else obj.style = next;
    } catch {}

    engine.addObject(obj);
    this.reset();
    return true;
  }

  onClickPlace(engine, pointer) {
    // 1 clique = coloca e commita
    if (this._stage === 0) {
      this.onBegin(engine, pointer);
      return this.onEnd(engine, pointer, { commit: true });
    }
    return this.onEnd(engine, pointer, { commit: true });
  }

  onHoverMove(engine, pointer) {
    // sem preview fora do gesto
  }

  reset() {
    super.reset();
    this._stage = 0;
    this._x0 = null;
    this._y0 = null;
  }
}
