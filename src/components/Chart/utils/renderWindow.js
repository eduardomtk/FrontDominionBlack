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



const PERF_WINDOW_CACHE = {
  key: "",
  value: null,
};

function buildWindowOptionsSig(options = {}) {
  return [
    Number(options.fallbackRecentBars),
    Number(options.leftWarmupBars),
    Number(options.leftViewportBufferBars),
    Number(options.rightViewportBufferBars),
    Number(options.maxWindowBars),
    Number(options.minWindowBars),
  ].join('|');
}

function buildSeriesSig(closed, liveCandle) {
  const arr = Array.isArray(closed) ? closed : [];
  const len = arr.length;
  const firstT = len ? Number(arr[0]?.time) : NaN;
  const last = len ? arr[len - 1] : null;
  const lastT = Number(last?.time);
  const lastC = Number(last?.close);
  const liveT = Number(liveCandle?.time);
  const liveC = Number(liveCandle?.close);
  return [
    len,
    Number.isFinite(firstT) ? firstT : 'NaN',
    Number.isFinite(lastT) ? lastT : 'NaN',
    Number.isFinite(lastC) ? lastC : 'NaN',
    Number.isFinite(liveT) ? liveT : 'NaN',
    Number.isFinite(liveC) ? liveC : 'NaN',
  ].join('|');
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

  const optionsSig = buildWindowOptionsSig({
    fallbackRecentBars,
    leftWarmupBars,
    leftViewportBufferBars,
    rightViewportBufferBars,
    maxWindowBars,
    minWindowBars,
  });
  const seriesSig = buildSeriesSig(closed, liveCandle);

  const range = getVisibleTimeRange(masterChart);
  if (!range) {
    const keep = Math.max(minWindowBars, fallbackRecentBars);
    const start = Math.max(0, total - keep);
    const cacheKey = ['no-range', seriesSig, optionsSig, start, total - 1].join('|');
    if (PERF_WINDOW_CACHE.key === cacheKey && Array.isArray(PERF_WINDOW_CACHE.value)) {
      return PERF_WINDOW_CACHE.value;
    }
    const out = full.slice(start);
    PERF_WINDOW_CACHE.key = cacheKey;
    PERF_WINDOW_CACHE.value = out;
    return out;
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

  const cacheKey = [seriesSig, optionsSig, leftIdx, rightIdx, start, end].join('|');
  if (PERF_WINDOW_CACHE.key === cacheKey && Array.isArray(PERF_WINDOW_CACHE.value)) {
    return PERF_WINDOW_CACHE.value;
  }

  const out = full.slice(start, end + 1);
  PERF_WINDOW_CACHE.key = cacheKey;
  PERF_WINDOW_CACHE.value = out;
  return out;
}
