function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export class BaseObject {
  constructor(type) {
    this.id = uid();
    this.type = type;
  }

  toJSON() {
    return { id: this.id, type: this.type };
  }

  // ctx: canvas 2d
  // transform: ChartTransformAdapter
  draw(ctx, transform, { selected } = {}) {
    void ctx;
    void transform;
    void selected;
  }

  // return:
  // { type: "handle", objectId, handleId } OR { type: "body", objectId }
  hitTest(screenPt, transform, { hitEps, handleRadius } = {}) {
    void screenPt;
    void transform;
    void hitEps;
    void handleRadius;
    return null;
  }

  // handleId -> move
  moveHandle(handleId, worldPt) {
    void handleId;
    void worldPt;
  }

  // move by drag (body)
  moveByDrag(dragInfo, worldPt) {
    void dragInfo;
    void worldPt;
  }
}
