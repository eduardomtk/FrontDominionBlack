// src/components/Chart/Drawings/tools/ToolBase.js
export class ToolBase {
  constructor(id, defaultStyle = {}) {
    this.id = id;
    this.defaultStyle = defaultStyle || {};
    this.preview = null;
  }

  reset() {
    this.preview = null;
    this._stage = 0;
    this._a = null;
  }

  // ✅ por padrão, ferramentas de desenho começam no pointerdown (drag)
  beginOnPointerDown() {
    return true;
  }

  // ✅ se existe preview, desenha preview
  needsPreview() {
    return !!this.preview;
  }

  drawPreview(ctx, transform) {
    if (!this.preview) return;
    this.preview.draw?.(ctx, transform, { preview: true });
  }
}
