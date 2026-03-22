import { dist } from "./math";

// distância ponto -> segmento
export function distancePointToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;

  const abLen2 = abx * abx + aby * aby;
  if (abLen2 <= 0) return dist(px, py, ax, ay);

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLen2));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return dist(px, py, cx, cy);
}
