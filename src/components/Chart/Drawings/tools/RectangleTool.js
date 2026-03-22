// src/components/Chart/Drawings/tools/RectangleTool.js
import { ToolBase } from "./ToolBase";
import { RectangleBox } from "../objects/RectangleBox";
import { canonicalizeH1Pair, hasFiniteTimePrice } from "./h1Canonical";


export class RectangleTool extends ToolBase {
  constructor(defaultStyle) {
    super("rectangle", defaultStyle);

    this._stage = 0;
    this._a = null;
    this._aScreen = null;
  }

  onBegin(engine, pointer) {
    this._stage = 1;

    // world A
    this._a = { ...(pointer.world || { t: NaN, p: NaN, l: NaN }) };
    // screen A
    this._aScreen = { x: pointer.x, y: pointer.y };

    this.preview = new RectangleBox(this._a, this._a);

    this.preview.aScreen = { x: pointer.x, y: pointer.y };
    this.preview.bScreen = { x: pointer.x, y: pointer.y };

    try {
      const cur = this.preview.style || this.preview.getStyle?.() || {};
      const next = { ...(this.defaultStyle || {}), ...cur };

      if (!next.fill) {
        const stroke = next.stroke || next.color || "rgba(0, 132, 255, 0.98)";
        next.fill = engine?._colorToRgba ? engine._colorToRgba(stroke, 0.10) : "rgba(0, 132, 255, 0.10)";
      }

      if (this.preview.setStyle) this.preview.setStyle(next);
      else this.preview.style = next;
    } catch {}

    engine.invalidate();
  }

  onDragMove(engine, pointer) {
    if (!this.preview) return;

    // ✅ precisa atualizar WORLD também, senão fica tamanho 0 e não desenha
    this.preview.b = { ...(pointer.world || this.preview.b) };

    // screen soberano pro preview
    this.preview.bScreen = { x: pointer.x, y: pointer.y };

    engine.invalidate();
  }

  onEnd(engine, pointer, { commit } = {}) {
    if (!this.preview || this._stage !== 1) return false;
    if (!commit) return false;

    // ✅ congelar pelo preview (igual LineTool)
    const aS = this._aScreen || this.preview.aScreen || { x: pointer.x, y: pointer.y };
    const bS = this.preview.bScreen || { x: pointer.x, y: pointer.y };

    const aWorld = engine?.transform?.xyToTimePrice?.(aS) || { t: NaN, p: NaN, l: NaN };
    const bWorld = engine?.transform?.xyToTimePrice?.(bS) || { t: NaN, p: NaN, l: NaN };

    if (!hasFiniteTimePrice(aWorld) || !hasFiniteTimePrice(bWorld)) return false;

    const { a: canonicalA, b: canonicalB } = canonicalizeH1Pair(aWorld, bWorld);
    const obj = new RectangleBox(canonicalA, canonicalB);

    obj.aScreen = { ...aS };
    obj.bScreen = { ...bS };

    try {
      const cur = obj.style || obj.getStyle?.() || {};
      const next = { ...(this.defaultStyle || {}), ...cur };

      if (!next.fill) {
        const stroke = next.stroke || next.color || "rgba(0, 132, 255, 0.98)";
        next.fill = engine?._colorToRgba ? engine._colorToRgba(stroke, 0.10) : "rgba(0, 132, 255, 0.10)";
      }

      if (obj.setStyle) obj.setStyle(next);
      else obj.style = next;
    } catch {}

    engine.addObject(obj);
    this.reset();
    return true;
  }

  onClickPlace(engine, pointer) {
    if (this._stage === 0) {
      this.onBegin(engine, pointer);
      return false;
    }
    if (this._stage === 1) {
      return this.onEnd(engine, pointer, { commit: true });
    }
    return false;
  }

  onHoverMove(engine, pointer) {
    this.onDragMove(engine, pointer);
  }
}
