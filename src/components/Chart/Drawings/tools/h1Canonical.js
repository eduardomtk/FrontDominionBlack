const CANONICAL_TIMEFRAME = "H1";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export function canonicalizeH1World(world) {
  const t = num(world?.t);
  const p = num(world?.p);
  const out = { ...(world || {}) };
  out.t = t;
  out.p = p;
  out.tf = CANONICAL_TIMEFRAME;
  delete out.l;
  return out;
}

export function canonicalizeH1Pair(aWorld, bWorld) {
  return {
    a: canonicalizeH1World(aWorld),
    b: canonicalizeH1World(bWorld),
  };
}

export function hasFiniteTimePrice(world) {
  return Number.isFinite(num(world?.t)) && Number.isFinite(num(world?.p));
}

export function hasFinitePrice(world) {
  return Number.isFinite(num(world?.p));
}
