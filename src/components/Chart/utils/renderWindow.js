function normalizeTimeLikeToSeconds(timeLike) {
  if (timeLike == null) return NaN;

  if (typeof timeLike === 'number') {
    return Number.isFinite(timeLike) ? Math.floor(timeLike) : NaN;
  }

  if (
    typeof timeLike === 'object' &&
    timeLike &&
    'year' in timeLike &&
    'month' in timeLike &&
    'day' in timeLike
  ) {
    const y = Number(timeLike.year);
    const m = Number(timeLike.month);
    const d = Number(timeLike.day);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return NaN;
    return Math.floor(Date.UTC(y, m - 1, d, 0, 0, 0, 0) / 1000);
  }

  const n = Number(timeLike);
  return Number.isFinite(n) ? Math.floor(n) : NaN;
}

function lowerBoundByTime(arr, target) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const t = Number(arr[mid]?.time);
    if (Number.isFinite(t) && t < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBoundByTime(arr, target) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const t = Number(arr[mid]?.time);
    if (Number.isFinite(t) && t <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function buildFullSeries(closed, liveCandle) {
  const arr = Array.isArray(closed) ? closed : [];
  if (!liveCandle || typeof liveCandle !== 'object') return arr;

  const lt = Number(liveCandle?.time);
  if (!Number.isFinite(lt)) return arr;

  if (!arr.length) return [liveCandle];

  const last = arr[arr.length - 1];
  const lastT = Number(last?.time);

  if (Number.isFinite(lastT) && lastT === lt) {
    return [...arr.slice(0, -1), liveCandle];
  }

  return [...arr, liveCandle];
}

function getVisibleTimeRange(masterChart) {
  try {
    const range = masterChart?.timeScale?.()?.getVisibleRange?.();
    const from = normalizeTimeLikeToSeconds(range?.from);
    const to = normalizeTimeLikeToSeconds(range?.to);
    if (Number.isFinite(from) && Number.isFinite(to) && to >= from) {
      return { from, to };
    }
  } catch {}
  return null;
}

export function buildPerformanceWindow(closed, liveCandle, masterChart, options = {}) {
  const {
    fallbackRecentBars = 1800,
    leftWarmupBars = 400,
    leftViewportBufferBars = 250,
    rightViewportBufferBars = 150,
    maxWindowBars = 3200,
    minWindowBars = 900,
  } = options || {};

  const full = buildFullSeries(closed, liveCandle);
  const total = full.length;
  if (!total) return full;

  if (total <= maxWindowBars) return full;

  const range = getVisibleTimeRange(masterChart);
  if (!range) {
    const keep = Math.max(minWindowBars, fallbackRecentBars);
    return full.slice(Math.max(0, total - keep));
  }

  const leftIdxRaw = lowerBoundByTime(full, range.from);
  const rightIdxRaw = upperBoundByTime(full, range.to) - 1;

  const leftIdx = Math.max(0, Math.min(total - 1, leftIdxRaw));
  const rightIdx = Math.max(leftIdx, Math.min(total - 1, rightIdxRaw));

  let start = Math.max(0, leftIdx - leftWarmupBars - leftViewportBufferBars);
  let end = Math.min(total - 1, rightIdx + rightViewportBufferBars);

  let size = end - start + 1;
  if (size < minWindowBars) {
    const missing = minWindowBars - size;
    const growLeft = Math.ceil(missing * 0.65);
    const growRight = Math.floor(missing * 0.35);
    start = Math.max(0, start - growLeft);
    end = Math.min(total - 1, end + growRight);
    size = end - start + 1;
  }

  if (size > maxWindowBars) {
    const targetStart = Math.max(0, leftIdx - leftWarmupBars - leftViewportBufferBars);
    start = Math.min(targetStart, Math.max(0, total - maxWindowBars));
    end = Math.min(total - 1, start + maxWindowBars - 1);
  }

  return full.slice(start, end + 1);
}
