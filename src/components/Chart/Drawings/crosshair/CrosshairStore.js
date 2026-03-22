// src/components/Chart/Drawings/crosshair/CrosshairStore.js
// Snapshot soberano do crosshair.
// Guarda TIME/PREÇO + também POINT.X (pixel) + LOGICAL.
// Isso elimina offsets por gaps e por conversões diferentes no commit.

const _state = {
  t: NaN,     // time (segundos)
  p: NaN,     // price
  x: NaN,     // pixel x (LWC coordinate)
  l: NaN,     // logical index
  at: 0,
};

function _now() {
  return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
}

export const CrosshairStore = {
  set(next) {
    const t = Number(next?.t);
    const p = Number(next?.p);
    const x = Number(next?.x);
    const l = Number(next?.l);
    const at = Number(next?.at);

    // t e p continuam obrigatórios
    if (Number.isFinite(t) && Number.isFinite(p)) {
      _state.t = t;
      _state.p = p;

      // opcionais, mas se existirem, gravamos
      _state.x = Number.isFinite(x) ? x : _state.x;
      _state.l = Number.isFinite(l) ? l : _state.l;

      _state.at = Number.isFinite(at) ? at : _now();
    }
  },

  clear() {
    _state.t = NaN;
    _state.p = NaN;
    _state.x = NaN;
    _state.l = NaN;
    _state.at = 0;
  },

  get(maxAgeMs = 1500) {
    const t = Number(_state.t);
    const p = Number(_state.p);
    if (!Number.isFinite(t) || !Number.isFinite(p)) return null;

    const x = Number(_state.x);
    const l = Number(_state.l);

    const at = Number(_state.at) || 0;
    const now = _now();
    const age = now - at;

    if (!Number.isFinite(at)) {
      return {
        t, p,
        x: Number.isFinite(x) ? x : NaN,
        l: Number.isFinite(l) ? l : NaN,
        at: now,
      };
    }

    if (age >= 0 && age <= maxAgeMs) {
      return {
        t, p,
        x: Number.isFinite(x) ? x : NaN,
        l: Number.isFinite(l) ? l : NaN,
        at,
      };
    }

    return null;
  },
};
