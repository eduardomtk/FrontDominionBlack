// src/components/Chart/Drawings/tools/LineTool.js
import { ToolBase } from "./ToolBase";
import { SegmentLine } from "../objects/SegmentLine";
import { canonicalizeH1Pair, hasFiniteTimePrice } from "./h1Canonical";


export class LineTool extends ToolBase {
  constructor(defaultStyle) {
    super("line", defaultStyle);

    this._stage = 0;
    this._aScreen = null;
  }

  onBegin(engine, pointer) {
    this._stage = 1;

    // ✅ A screen soberano
    this._aScreen = { x: pointer.x, y: pointer.y };

    // world só pra compat inicial do objeto
    const w = pointer.world || { t: NaN, p: NaN, l: NaN };
    this.preview = new SegmentLine({ ...w }, { ...w });

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

    // ✅ preview soberano em tela
    this.preview.bScreen = { x: pointer.x, y: pointer.y };

    // mantém world atualizado se vier válido, mas NÃO depende disso
    this.preview.b = { ...(pointer.world || this.preview.b) };

    engine.invalidate();
  }

  onEnd(engine, pointer, { commit } = {}) {
    if (!this.preview || this._stage !== 1) return false;
    if (!commit) return false;

    // ✅ congelar: usa exatamente os screens do preview
    const aS = this._aScreen || this.preview.aScreen || { x: pointer.x, y: pointer.y };
    const bS = this.preview.bScreen || { x: pointer.x, y: pointer.y };

    const aWorld = engine?.transform?.xyToTimePrice?.(aS) || { t: NaN, p: NaN, l: NaN };
    const bWorld = engine?.transform?.xyToTimePrice?.(bS) || { t: NaN, p: NaN, l: NaN };

    if (!hasFiniteTimePrice(aWorld) || !hasFiniteTimePrice(bWorld)) return false;

    const { a: canonicalA, b: canonicalB } = canonicalizeH1Pair(aWorld, bWorld);
    const obj = new SegmentLine(canonicalA, canonicalB);

    // guarda screen também
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
    this._aScreen = null;
  }
}
