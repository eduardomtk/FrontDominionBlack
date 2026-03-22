// src/components/Chart/Drawings/tools/HorizontalLineTool.js
import { ToolBase } from "./ToolBase";
import { HorizontalLine } from "../objects/HorizontalLine";
import { canonicalizeH1World, hasFinitePrice } from "./h1Canonical";


export class HorizontalLineTool extends ToolBase {
  constructor(defaultStyle) {
    super("horizontal", defaultStyle);

    this._stage = 0;
    this._x0 = null;
    this._y0 = null;
  }

  onBegin(engine, pointer) {
    this._stage = 1;

    this._x0 = pointer.x;
    this._y0 = pointer.y;

    const w = pointer.world || { t: NaN, p: NaN, l: NaN };
    this.preview = new HorizontalLine({ ...w });

    // preview fallback (screen)
    this.preview.yScreen = pointer.y;

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
    this.preview.yScreen = pointer.y;

    // mantém world atualizado
    this.preview.p = Number(pointer.world?.p);
    this.preview.t = Number(pointer.world?.t);
    this.preview.l = Number(pointer.world?.l);

    engine.invalidate();
  }

  onEnd(engine, pointer, { commit } = {}) {
    if (!this.preview || this._stage !== 1) return false;
    if (!commit) return false;

    // ✅ congelar pelo preview: usa o Y final em screen
    const xS = pointer.x; // X só pra calcular time/logical no xyToTimePrice
    const yS = Number.isFinite(Number(this.preview.yScreen)) ? Number(this.preview.yScreen) : pointer.y;

    const w = engine?.transform?.xyToTimePrice?.({ x: xS, y: yS }) || { t: NaN, p: NaN, l: NaN };
    if (!hasFinitePrice(w)) return false;

    const canonical = canonicalizeH1World(w);
    const obj = new HorizontalLine(canonical);
    obj.yScreen = yS;

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
    if (this._stage === 1) {
      return this.onEnd(engine, pointer, { commit: true });
    }
    return false;
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
