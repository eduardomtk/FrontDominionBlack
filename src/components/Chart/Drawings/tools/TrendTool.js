// src/components/Chart/Drawings/tools/TrendTool.js
import { ToolBase } from "./ToolBase";
import { InfiniteLine } from "../objects/InfiniteLine";
import { canonicalizeH1Pair, hasFiniteTimePrice } from "./h1Canonical";


export class TrendTool extends ToolBase {
  constructor(defaultStyle) {
    super("trend", defaultStyle);

    this._stage = 0;
    this._a = null;
    this._aScreen = null;
  }

  onBegin(engine, pointer) {
    this._stage = 1;

    this._aScreen = { x: pointer.x, y: pointer.y };
    this._a = { ...pointer.world };

    this.preview = new InfiniteLine(this._a, this._a);

    this.preview.aScreen = { x: pointer.x, y: pointer.y };
    this.preview.bScreen = { x: pointer.x, y: pointer.y };

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

    this.preview.bScreen = { x: pointer.x, y: pointer.y };
    this.preview.b = { ...pointer.world };

    engine.invalidate();
  }

  onEnd(engine, pointer, { commit } = {}) {
    if (!this.preview || this._stage !== 1) return false;
    if (!commit) return false;

    const aS = this._aScreen || this.preview.aScreen || { x: pointer.x, y: pointer.y };
    const bS = this.preview.bScreen || { x: pointer.x, y: pointer.y };

    const aWorld = engine?.transform?.xyToTimePrice?.({ x: aS.x, y: aS.y }) || { t: NaN, p: NaN };
    const bWorld = engine?.transform?.xyToTimePrice?.({ x: bS.x, y: bS.y }) || { t: NaN, p: NaN };

    if (!hasFiniteTimePrice(aWorld) || !hasFiniteTimePrice(bWorld)) return false;

    const { a: canonicalA, b: canonicalB } = canonicalizeH1Pair(aWorld, bWorld);
    const obj = new InfiniteLine(canonicalA, canonicalB);

    obj.aScreen = { ...aS };
    obj.bScreen = { ...bS };

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

  reset() {
    super.reset();
    this._stage = 0;
    this._a = null;
    this._aScreen = null;
  }
}
