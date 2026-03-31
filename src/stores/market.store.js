import { create } from "zustand";
import { bindMarketWSManagerToStore } from "../ws/market.ws.instance";

// ✅ Agora suportamos todos os TFs do seu projeto
const TF_MAP = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600 };

// ✅ Hot window atual de produção: 1000 velas
const HISTORY_LIMIT = 1000;

// ============================
// ✅ BLINDAGEM DE STREAM HISTORY (PROFISSIONAL)
// ============================
const _historySessionIdByKey = Object.create(null); // key -> number
const _historyBufferByKey = Object.create(null); // key -> candles[]
const _historyCommitTimerByKey = Object.create(null); // key -> timeout
const _historyLoadMoreRequestByKey = Object.create(null); // key -> { fromTime, sentAt }
const HISTORY_COMMIT_QUIET_MS = 60;
const ORPHAN_KEEPALIVE_MS = 0;
const _orphanCloseTimerByKey = Object.create(null);
const _postHydrationResyncTimersByKey = Object.create(null);
const SNAPSHOT_CACHE_TTL_MS = 75 * 1000;
const SNAPSHOT_CACHE_MAX_CANDLES = 1000;
const SNAPSHOT_CACHE_VERSION = "v8";
const MEMORY_SNAPSHOT_TTL_MS = 20 * 1000;
const _memorySnapshotByKey = new Map();

// ============================
// ✅ TIME NORMALIZATION (ms -> s)
// ============================
function getFrontHistoryLimit(timeframe = "M1") {
  const tf = String(timeframe || "M1").toUpperCase().trim() || "M1";
  if (tf === "M1" || tf === "M5") return 20000;
  return 10000;
}

function normalizeEpochSeconds(t) {
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  if (n >= 1e12) return Math.floor(n / 1000);
  return Math.floor(n);
}

function makePairKey(symbol, timeframe) {
  const s = String(symbol || "").toUpperCase().trim();
  const tf = String(timeframe || "M1").toUpperCase().trim();
  return `${s}|${tf}`;
}

function getBucketTime(t, timeframeSec) {
  const time = normalizeEpochSeconds(t);
  const tf = Number(timeframeSec) || 60;
  if (!Number.isFinite(time) || !Number.isFinite(tf) || tf <= 0) return null;
  return Math.floor(time / tf) * tf;
}

function sanitizeCandlesArray(data, limit = HISTORY_LIMIT) {
  const arr = Array.isArray(data) ? data : [];
  if (arr.length === 0) return [];

  const normalized = arr
    .filter(Boolean)
    .map((c) => ({
      time: normalizeEpochSeconds(c.time ?? c.t),
      open: Number(c.open ?? c.o),
      high: Number(c.high ?? c.h),
      low: Number(c.low ?? c.l),
      close: Number(c.close ?? c.c),
      volume: Number(c.volume ?? c.v) || 0,
    }))
    .filter(
      (c) =>
        Number.isFinite(c.time) &&
        [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v))
    )
    .sort((a, b) => a.time - b.time);

  const out = [];
  for (const c of normalized) {
    const last = out[out.length - 1];
    if (!last || last.time !== c.time) out.push(c);
    else out[out.length - 1] = c;
  }

  if (Number.isFinite(limit) && limit > 0 && out.length > limit) return out.slice(out.length - limit);
  return out;
}

function mergeCandles(existing, incoming, limit = HISTORY_LIMIT) {
  const a = Array.isArray(existing) ? existing : [];
  const b = Array.isArray(incoming) ? incoming : [];
  if (a.length === 0) return Number.isFinite(limit) && limit > 0 ? b.slice(Math.max(0, b.length - limit)) : b.slice();
  if (b.length === 0) return Number.isFinite(limit) && limit > 0 ? a.slice(Math.max(0, a.length - limit)) : a.slice();

  const map = new Map();
  for (const c of a) {
    const t = Number(c?.time);
    if (Number.isFinite(t)) map.set(t, c);
  }
  for (const c of b) {
    const t = Number(c?.time);
    if (Number.isFinite(t)) map.set(t, c);
  }

  const out = Array.from(map.values()).sort((x, y) => Number(x.time) - Number(y.time));
  if (Number.isFinite(limit) && limit > 0 && out.length > limit) return out.slice(out.length - limit);
  return out;
}


function makeHistorySig(candles) {
  const arr = Array.isArray(candles) ? candles : [];
  if (!arr.length) return "";

  const first = arr[0];
  const last = arr[arr.length - 1];
  const ft = Number(first?.time);
  const lt = Number(last?.time);
  if (!Number.isFinite(ft) || !Number.isFinite(lt)) return "";

  const tail = arr.slice(Math.max(0, arr.length - 6));
  const tailSig = tail
    .map((c) => {
      const t = Number(c?.time);
      const o = Number(c?.open);
      const h = Number(c?.high);
      const l = Number(c?.low);
      const cl = Number(c?.close);
      return [t, o, h, l, cl]
        .map((v) => (Number.isFinite(v) ? String(v) : "x"))
        .join(",");
    })
    .join("|");

  return `${arr.length}:${ft}:${lt}:${tailSig}`;
}

function historySnapshotStorageKey(key) {
  return `market-history:${SNAPSHOT_CACHE_VERSION}:${String(key || "")}`;
}

function writeMemorySnapshot(key, candles, liveCandle = null, meta = {}) {
  if (!key) return;
  const arr = Array.isArray(candles) ? candles.slice(Math.max(0, candles.length - SNAPSHOT_CACHE_MAX_CANDLES)) : [];
  const live = sanitizeCandleLike(liveCandle);
  if (!arr.length && !live) return;
  _memorySnapshotByKey.set(key, {
    key,
    ts: Date.now(),
    timeframe: String(meta?.timeframe || key.split("|")[1] || "M1").toUpperCase().trim(),
    timeframeSec: Number(meta?.timeframeSec) || 60,
    candles: arr,
    liveCandle: live,
  });
}

function readMemorySnapshot(key) {
  if (!key) return null;
  const cached = _memorySnapshotByKey.get(key);
  if (!cached) return null;
  const ts = Number(cached?.ts || 0);
  if (!Number.isFinite(ts) || ts <= 0 || Date.now() - ts > MEMORY_SNAPSHOT_TTL_MS) {
    _memorySnapshotByKey.delete(key);
    return null;
  }
  return cached;
}

function dispatchTradingReady(eventName, detail = {}) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  } catch {}
}

function persistHistorySnapshot(key, candles, liveCandle = null, meta = {}) {
  if (typeof localStorage === "undefined") return;
  const arr = Array.isArray(candles) ? candles : [];
  const live = sanitizeCandleLike(liveCandle);
  if (!key || (!arr.length && !live)) return;

  const compact = arr.slice(Math.max(0, arr.length - SNAPSHOT_CACHE_MAX_CANDLES));
  writeMemorySnapshot(key, compact, live, meta);

  try {
    localStorage.setItem(
      historySnapshotStorageKey(key),
      JSON.stringify({
        key,
        ts: Date.now(),
        timeframe: String(meta?.timeframe || key.split("|")[1] || "M1").toUpperCase().trim(),
        timeframeSec: Number(meta?.timeframeSec) || 60,
        candles: compact,
        liveCandle: live,
      })
    );
  } catch {}
}

function readHistorySnapshot(key) {
  if (!key) return null;

  const fromCache = (entry) => {
    if (!entry) return null;
    const tf = String(entry?.timeframe || key.split("|")[1] || "M1").toUpperCase().trim();
    const timeframeSec = Number(entry?.timeframeSec) || (TF_MAP[tf] || 60);
    const candles = sanitizeCandlesArray(entry?.candles, SNAPSHOT_CACHE_MAX_CANDLES);

    let liveCandle = sanitizeCandleLike(entry?.liveCandle);
    if (liveCandle) {
      const nowBucket = getBucketTime(Math.floor(Date.now() / 1000), timeframeSec);
      const liveBucket = getBucketTime(liveCandle.time, timeframeSec);
      const lastClosedTime = candles.length ? Number(candles[candles.length - 1]?.time || 0) : 0;
      if (
        (nowBucket != null && liveBucket != null && liveBucket !== nowBucket) ||
        (lastClosedTime > 0 && Number(liveCandle.time) <= lastClosedTime)
      ) {
        liveCandle = null;
      }
    }

    if (!candles.length || !liveCandle || !isSnapshotLiveFresh(liveCandle, timeframeSec)) {
      return null;
    }

    return { candles, liveCandle, timeframe: tf, timeframeSec, ts: Number(entry?.ts || Date.now()) };
  };

  const mem = fromCache(readMemorySnapshot(key));
  if (mem) return mem;

  if (typeof localStorage === "undefined") return null;

  try {
    const raw = localStorage.getItem(historySnapshotStorageKey(key));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const ts = Number(parsed?.ts || 0);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    if (Date.now() - ts > SNAPSHOT_CACHE_TTL_MS) {
      try { localStorage.removeItem(historySnapshotStorageKey(key)); } catch {}
      return null;
    }

    return fromCache(parsed);
  } catch {
    return null;
  }
}

function sanitizeCandleLike(data) {
  if (!data) return null;
  const c = data?.candle || data;

  const time = normalizeEpochSeconds(c?.time ?? c?.t);
  const open = Number(c?.open ?? c?.o);
  const high = Number(c?.high ?? c?.h);
  const low = Number(c?.low ?? c?.l);
  const close = Number(c?.close ?? c?.c);
  const volume = Number(c?.volume ?? c?.v) || 0;

  if (!Number.isFinite(time) || ![open, high, low, close].every(Number.isFinite)) {
    return null;
  }

  return { time, open, high, low, close, volume };
}

function sanitizeTick(data) {
  if (!data) return null;

  const time = normalizeEpochSeconds(data?.time ?? data?.t);
  const bid = Number(data?.bid ?? data?.price ?? data?.c ?? data?.close);
  const ask = Number(data?.ask);

  if (!Number.isFinite(time) || !Number.isFinite(bid)) return null;

  return { time, bid, ask: Number.isFinite(ask) ? ask : bid };
}

function isSnapshotLiveFresh(liveCandle, timeframeSec) {
  const live = sanitizeCandleLike(liveCandle);
  if (!live) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  const nowBucket = getBucketTime(nowSec, timeframeSec);
  const liveBucket = getBucketTime(live.time, timeframeSec);
  return nowBucket != null && liveBucket != null && nowBucket === liveBucket;
}

function buildBootReadySnapshot(input, timeframeSec, timeframe = "M1") {
  const payload = input || {};
  const candles = sanitizeCandlesArray(payload?.candles || payload?.history || [], HISTORY_LIMIT);
  const liveCandle = sanitizeCandleLike(payload?.liveCandle || payload?.live || null);
  const lastTick = sanitizeTick(payload?.lastTick || null);
  const safeLive = isSnapshotLiveFresh(liveCandle, timeframeSec) ? liveCandle : null;
  const historyReady = payload?.historyReady !== false && candles.length > 0;
  const liveReady = payload?.liveReady !== false && !!safeLive;
  const lastHistoryTime = candles.length ? Number(candles[candles.length - 1]?.time || 0) : 0;
  return {
    candles,
    liveCandle: safeLive,
    lastTick,
    historyReady,
    liveReady,
    version: Number(payload?.version || 0) || 0,
    updatedAt: Number(payload?.updatedAt || 0) || 0,
    archiveStatus: payload?.archiveStatus || null,
    hasMore: payload?.hasMore !== false,
    lastHistoryTime,
    lastLiveTime: Number(safeLive?.time || 0) || 0,
  };
}

function canUseCachedPairSeed(pairState, timeframeSec) {
  if (!pairState || typeof pairState !== "object") return false;
  const candles = sanitizeCandlesArray(pairState.candles);
  const live = sanitizeCandleLike(pairState.liveCandle);
  return candles.length > 0 && isSnapshotLiveFresh(live, timeframeSec);
}


function upsertClosedCandle({ candles, closed, limit = null }) {
  let next = Array.isArray(candles) ? [...candles] : [];

  const t = Number(closed.time);
  const last = next.length ? next[next.length - 1] : null;

  if (last && Number(last.time) === t) {
    next[next.length - 1] = closed;
  } else {
    const idx = next.findIndex((c) => Number(c?.time) === t);
    if (idx >= 0) next[idx] = closed;
    else next.push(closed);
  }

  next.sort((a, b) => Number(a.time) - Number(b.time));
  if (Number.isFinite(limit) && limit > 0 && next.length > limit) next = next.slice(next.length - limit);

  return next;
}

function wsOpenPair(wsManager, symbol, timeframe, options = undefined) {
  if (typeof wsManager?.openPair !== "function") return;
  wsManager.openPair(symbol, timeframe, options);
}

function wsPinPair(wsManager, symbol, timeframe, options = undefined) {
  if (typeof wsManager?.pinPair === "function") {
    wsManager.pinPair(symbol, timeframe, options);
    return;
  }
  if (typeof wsManager?.openPair !== "function") return;
  wsManager.openPair(symbol, timeframe, options);
}

function wsUnpinPair(wsManager, symbol, timeframe) {
  if (typeof wsManager?.unpinPair === "function") {
    wsManager.unpinPair(symbol, timeframe);
    return;
  }
}

function wsClosePair(wsManager, symbol, timeframe) {
  if (typeof wsManager?.closePair !== "function") return;
  wsManager.closePair(symbol, timeframe);
}

function wsLoadMore(wsManager, symbol, timeframe, fromTime, limit = 500) {
  if (typeof wsManager?.loadMoreHistory !== "function") return;
  wsManager.loadMoreHistory(symbol, timeframe, fromTime, limit);
}

function clearOrphanCloseTimer(key) {
  if (!key) return;
  if (_orphanCloseTimerByKey[key]) {
    try {
      clearTimeout(_orphanCloseTimerByKey[key]);
    } catch {}
    delete _orphanCloseTimerByKey[key];
  }
}
function clearPostHydrationResyncTimers(key) {
  if (!key) return;
  const timers = _postHydrationResyncTimersByKey[key];
  if (!Array.isArray(timers) || !timers.length) {
    delete _postHydrationResyncTimersByKey[key];
    return;
  }

  for (const timerId of timers) {
    try {
      clearTimeout(timerId);
    } catch {}
  }
  delete _postHydrationResyncTimersByKey[key];
}

function schedulePostHydrationResync() {}

function prunePairsKeepRecent(pairs, focusKey, keepCount = 4, pinned = {}) {
  const src = pairs && typeof pairs === "object" ? pairs : {};
  const pinMap = pinned && typeof pinned === "object" ? pinned : {};
  const entries = Object.entries(src);
  if (entries.length <= keepCount) return src;

  const ordered = entries.sort((a, b) => Number(b?.[1]?._hotTouchedAt || 0) - Number(a?.[1]?._hotTouchedAt || 0));
  const keep = new Set(focusKey ? [focusKey] : []);

  for (const [k] of ordered) {
    if (Number(pinMap?.[k] || 0) > 0) keep.add(k);
  }

  for (const [k] of ordered) {
    keep.add(k);
    if (keep.size >= keepCount) break;
  }

  const out = {};
  for (const [k, v] of entries) {
    if (keep.has(k)) out[k] = v;
  }
  return out;
}

function scheduleOrphanClose({ key, symbol, timeframe, set, get, wsManager }) {
  if (!key || !symbol || !timeframe) return;

  clearOrphanCloseTimer(key);

  _orphanCloseTimerByKey[key] = setTimeout(() => {
    delete _orphanCloseTimerByKey[key];

    const st = get();
    const pinnedCount = Number(st.pinned?.[key] || 0);
    const current = st.pairs?.[key];

    if (pinnedCount > 0 || !current) return;

    wsClosePair(wsManager, symbol, timeframe);

    try {
      if (_historyCommitTimerByKey[key]) clearTimeout(_historyCommitTimerByKey[key]);
    } catch {}
    delete _historyCommitTimerByKey[key];
    delete _historyBufferByKey[key];
    delete _historySessionIdByKey[key];
    clearPostHydrationResyncTimers(key);

    set((state) => {
      const pairs = { ...(state.pairs || {}) };
      if (!pairs[key]) return state;
      delete pairs[key];
      return { pairs };
    });
  }, ORPHAN_KEEPALIVE_MS);
}

function startHistorySession(key) {
  const nextId = Number(_historySessionIdByKey[key] || 0) + 1;
  _historySessionIdByKey[key] = nextId;
  _historyBufferByKey[key] = [];

  if (_historyCommitTimerByKey[key]) {
    try {
      clearTimeout(_historyCommitTimerByKey[key]);
    } catch {}
    delete _historyCommitTimerByKey[key];
  }

  return nextId;
}

function scheduleHistoryCommit({ key, sessionId, set, get }) {
  if (_historyCommitTimerByKey[key]) {
    try {
      clearTimeout(_historyCommitTimerByKey[key]);
    } catch {}
    delete _historyCommitTimerByKey[key];
  }

  _historyCommitTimerByKey[key] = setTimeout(() => {
    delete _historyCommitTimerByKey[key];

    const currentSess = Number(_historySessionIdByKey[key] || 0);
    if (currentSess !== Number(sessionId || 0)) return;

    const buffer = _historyBufferByKey[key];
    if (!Array.isArray(buffer) || buffer.length === 0) return;

    const st = get();
    const cur = st.pairs?.[key];
    if (!cur) return;

    const timeframe = String(cur.timeframe || key.split("|")[1] || "M1").toUpperCase().trim();
    const mergedCandles = mergeCandles(
      Array.isArray(cur.candles) ? cur.candles : [],
      buffer,
      getFrontHistoryLimit(timeframe)
    );

    const last = mergedCandles.length ? mergedCandles[mergedCandles.length - 1] : null;
    const lastT = last ? Number(last.time) : 0;

    let nextLive = cur.liveCandle;
    if (nextLive && Number(nextLive.time) <= Number(lastT || 0)) {
      nextLive = null;
    }

    set((state) => {
      const current = state.pairs?.[key];
      if (!current) return state;

      const limit = getFrontHistoryLimit(current.timeframe);
      const nextCandles = mergeCandles(
        Array.isArray(current.candles) ? current.candles : [],
        mergedCandles,
        limit
      );
      const nextLast = nextCandles.length ? nextCandles[nextCandles.length - 1] : null;
      const nextLastT = nextLast ? Number(nextLast.time) : 0;

      return {
        pairs: {
          ...state.pairs,
          [key]: {
            ...current,
            candles: nextCandles,
            liveCandle: nextLive,
            isLoadingHistory: false,
            _lastHistoryTime: Number.isFinite(nextLastT)
              ? Math.max(Number(current._lastHistoryTime || 0), nextLastT)
              : Number(current._lastHistoryTime || 0),
            _historySessionId: Number(sessionId || 0),
            _historyLoadMorePending: Boolean(current._historyLoadMorePending),
            _hotTouchedAt: Date.now(),
          },
        },
      };
    });

    persistHistorySnapshot(key, mergedCandles, nextLive, { timeframe: cur.timeframe, timeframeSec: cur.timeframeSec });
    dispatchTradingReady("tp:candlesReady", {
      key,
      source: "history_commit",
      candles: mergedCandles.length,
      lastTime: Number.isFinite(lastT) ? lastT : 0,
    });

    _historyBufferByKey[key] = [];
  }, HISTORY_COMMIT_QUIET_MS);
}

export const useMarketStore = create((set, get) => {
  const wsManager = bindMarketWSManagerToStore((event) => {
    get().updatePairData(event);
  });

  // ============================
  // ✅ CLOCK SYNC (soberano)
  // ============================
  const perfNowSafe = () => {
    try {
      const p = performance?.now?.();
      return Number.isFinite(p) ? p : 0;
    } catch {
      return 0;
    }
  };

  const computeServerNowFromState = (state) => {
    const anchor = Number(state.serverAnchorMs || 0);
    const p0 = Number(state.perfAnchorMs || 0);
    if (!Number.isFinite(anchor) || anchor <= 0 || !Number.isFinite(p0)) return Date.now();
    const p = perfNowSafe();
    const dt = p - p0;
    return anchor + (Number.isFinite(dt) ? dt : 0);
  };

  return {
    pairs: {},
  currentFocusKey: "",
    wsManager,

    // ✅ API para o footer (tempo soberano monotônico)
    serverAnchorMs: 0,
    perfAnchorMs: 0,

    timeOffsetMs: 0,     // mantido (compatibilidade)
    timeOffsetRtt: 0,
    timeOffsetAt: 0,

    // ✅ aplica uma amostra do WS (NTP-like) com smoothing
    applyTimeSample: ({ serverNowAtReceiveMs, perfNowMs, rttMs }) => {
      const srv = Number(serverNowAtReceiveMs);
      const pnow = Number(perfNowMs);
      const rtt = Number(rttMs);

      if (!Number.isFinite(srv) || !Number.isFinite(pnow)) return;

      set((state) => {
        const hasAnchor = Number(state.serverAnchorMs || 0) > 0 && Number(state.perfAnchorMs || 0) > 0;

        // offset compat (só pra debug/telemetria)
        const off = srv - Date.now();

        if (!hasAnchor) {
          return {
            ...state,
            serverAnchorMs: srv,
            perfAnchorMs: pnow,
            timeOffsetMs: off,
            timeOffsetRtt: Number.isFinite(rtt) ? rtt : Number(state.timeOffsetRtt || 0),
            timeOffsetAt: Date.now(),
          };
        }

        const curServerNow = computeServerNowFromState(state);
        const diff = srv - curServerNow; // quanto precisamos ajustar
        const abs = Math.abs(diff);

        // ✅ se vier amostra absurda (jitter forte), não “puxa” 1s pra trás; faz snap controlado
        // - snap forte se > 750ms
        // - smoothing se menor
        let nextAnchor = Number(state.serverAnchorMs);
        let nextPerf = Number(state.perfAnchorMs);

        if (abs > 750) {
          // snap: reancora (evita ficar 1s atrasado)
          nextAnchor = srv;
          nextPerf = pnow;
        } else {
          // smoothing: ajusta a âncora gradualmente (não dá “pulo” visual)
          const alpha = 0.35; // resposta rápida sem ficar tremendo
          nextAnchor = Number(state.serverAnchorMs) + diff * alpha;
          // perfAnchor mantém (monotônico)
        }

        return {
          ...state,
          serverAnchorMs: nextAnchor,
          perfAnchorMs: nextPerf,
          timeOffsetMs: off,
          timeOffsetRtt: Number.isFinite(rtt) ? rtt : Number(state.timeOffsetRtt || 0),
          timeOffsetAt: Date.now(),
        };
      });
    },

    // ✅ getter soberano (o footer usa isso)
    getServerNowMs: () => {
      const st = get();
      return computeServerNowFromState(st);
    },

    pinned: {},

    _isPinned: (key) => {
      const n = Number(get().pinned?.[key] || 0);
      return n > 0;
    },

    pinPair: ({ pair, timeframe = "M1" }) => {
      if (!pair) return;

      const symbol = String(pair).toUpperCase().trim();
      const tf = String(timeframe).toUpperCase().trim() || "M1";
      const timeframeSec = TF_MAP[tf] || 60;

      const key = makePairKey(symbol, tf);

      clearOrphanCloseTimer(key);

      set((state) => ({
        pinned: {
          ...(state.pinned || {}),
          [key]: Number(state.pinned?.[key] || 0) + 1,
        },
      }));

      const existing = get().pairs?.[key];
      if (!existing) {
        set((state) => ({
          pairs: {
            ...state.pairs,
            [key]: {
              timeframe: tf,
              timeframeSec,

              tickSeq: 0,
              _lastTickSeenTime: 0,
              _lastTickBucketTime: 0,
              _firstTickPriceInBucket: null,
              _firstTickBucketTime: 0,

              candles: [],
              liveCandle: null,
              lastTick: null,
              isLoadingHistory: true,

              _lastHistoryTime: 0,
              _lastLiveTime: 0,

              _historySessionId: 0,
              _historyLoadMorePending: false,
              _lastIncomingHistorySig: "",
              archiveStatus: null,
              hasMoreHistory: true,
              _hotTouchedAt: Date.now(),
            },
          },
        }));
      }

      wsPinPair(wsManager, symbol, tf);
    },

    unpinPair: ({ pair, timeframe = "M1" }) => {
      if (!pair) return;

      const symbol = String(pair).toUpperCase().trim();
      const tf = String(timeframe).toUpperCase().trim() || "M1";
      const key = makePairKey(symbol, tf);

      const cur = Number(get().pinned?.[key] || 0);
      if (cur <= 0) return;

      const next = cur - 1;

      set((state) => {
        const pinned = { ...(state.pinned || {}) };
        if (next <= 0) delete pinned[key];
        else pinned[key] = next;
        return { pinned };
      });

      if (next <= 0 && get().pairs?.[key]) {
        wsUnpinPair(wsManager, symbol, tf);
        scheduleOrphanClose({ key, symbol, timeframe: tf, set, get, wsManager });
      }
    },

    initPair: ({ pair, timeframe = "M1" }) => {
      if (!pair) return;

      const symbol = String(pair).toUpperCase().trim();
      const tf = String(timeframe).toUpperCase().trim() || "M1";
      const timeframeSec = TF_MAP[tf] || 60;

      const key = makePairKey(symbol, tf);

      const existingPairs = get().pairs || {};
      for (const k of Object.keys(existingPairs)) {
        if (!k) continue;
        if (!k.startsWith(`${symbol}|`)) continue;
        if (k === key) continue;

        if (get()._isPinned(k)) continue;

        const otherTf = String(k.split("|")[1] || "M1").toUpperCase().trim() || "M1";
        wsClosePair(wsManager, symbol, otherTf);
      }

      const sess = startHistorySession(key);

      const existing = existingPairs[key];

      if (existing) {
        wsClosePair(wsManager, symbol, tf);

        set((state) => ({
          pairs: {
            ...state.pairs,
            [key]: {
              timeframe: tf,
              timeframeSec,

              tickSeq: 0,
              _lastTickSeenTime: 0,
              _lastTickBucketTime: 0,
              _firstTickPriceInBucket: null,
              _firstTickBucketTime: 0,

              candles: [],
              liveCandle: null,
              lastTick: null,
              isLoadingHistory: true,

              _lastHistoryTime: 0,
              _lastLiveTime: 0,

              _historySessionId: sess,
              _historyLoadMorePending: false,
              _lastIncomingHistorySig: "",
              archiveStatus: null,
              hasMoreHistory: true,
              _hotTouchedAt: Date.now(),
            },
          },
        }));

        wsOpenPair(wsManager, symbol, tf);
        return;
      }

      set((state) => ({
        pairs: {
          ...state.pairs,
          [key]: {
            timeframe: tf,
            timeframeSec,

            tickSeq: 0,
            _lastTickSeenTime: 0,
            _lastTickBucketTime: 0,
            _firstTickPriceInBucket: null,
            _firstTickBucketTime: 0,

            candles: [],
            liveCandle: null,
            lastTick: null,
            isLoadingHistory: true,

            _lastHistoryTime: 0,
            _lastLiveTime: 0,

            _historySessionId: sess,
            _historyLoadMorePending: false,
            _hotTouchedAt: Date.now(),
          },
        },
      }));

      wsOpenPair(wsManager, symbol, tf);
    },

    updatePairData: (event) => {
      const { type, pair, data } = event || {};
      if (!pair || !type) return;

      const symbol = String(pair).toUpperCase().trim();
      const tf = String(event?.timeframe || data?.timeframe || "M1").toUpperCase().trim();
      const key = makePairKey(symbol, tf);

      if (type === "market_snapshot") {
        const snapshot = buildBootReadySnapshot(data, TF_MAP[tf] || 60, tf);
        const incomingSig = makeHistorySig(snapshot.candles);

        set((state) => {
          const current = state.pairs?.[key];
          if (!current) return state;

          const nextPair = {
            ...current,
            candles: snapshot.candles,
            liveCandle: snapshot.liveCandle,
            lastTick: snapshot.lastTick || current.lastTick || null,
            isLoadingHistory: false,
            _lastHistoryTime: Math.max(Number(current._lastHistoryTime || 0), Number(snapshot.lastHistoryTime || 0)),
            _lastLiveTime: Math.max(Number(current._lastLiveTime || 0), Number(snapshot.lastLiveTime || 0)),
            _historySessionId: Number(current._historySessionId || _historySessionIdByKey[key] || 0),
            _historyLoadMorePending: Boolean(current._historyLoadMorePending),
            _lastIncomingHistorySig: incomingSig || current._lastIncomingHistorySig || "",
            archiveStatus: snapshot.archiveStatus || current.archiveStatus || null,
            hasMoreHistory: snapshot.hasMore !== false,
            version: snapshot.version || Number(current.version || 0),
            updatedAt: snapshot.updatedAt || Number(current.updatedAt || 0),
            _hotTouchedAt: Date.now(),
          };

          persistHistorySnapshot(key, nextPair.candles, nextPair.liveCandle, {
            timeframe: nextPair.timeframe,
            timeframeSec: nextPair.timeframeSec,
          });

          return {
            pairs: {
              ...state.pairs,
              [key]: nextPair,
            },
          };
        });
        return;
      }

      if (type === "history_stream_start") {
        startHistorySession(key);
        set((state) => {
          const current = state.pairs?.[key];
          if (!current) return state;
          return {
            pairs: {
              ...state.pairs,
              [key]: {
                ...current,
                isLoadingHistory: true,
                _historySessionId: Number(_historySessionIdByKey[key] || 0),
              },
            },
          };
        });
        return;
      }

      set((state) => {
        const current = state.pairs[key];
        if (!current) return state;

        if (type === "history" || type === "history_stream") {
          const incoming = sanitizeCandlesArray(data);
          if (!incoming.length) return state;

          const incomingSig = makeHistorySig(incoming);
          const currentSig = makeHistorySig(current.candles);
          const bufferedSig = makeHistorySig(_historyBufferByKey[key]);

          if (
            incomingSig &&
            incomingSig === currentSig &&
            incomingSig === bufferedSig &&
            !current._historyLoadMorePending
          ) {
            return state;
          }

          const sess =
            Number(_historySessionIdByKey[key] || 0) ||
            Number(current._historySessionId || 0) ||
            0;

          const prevBuf = _historyBufferByKey[key];
          const nextBuf = mergeCandles(Array.isArray(prevBuf) ? prevBuf : [], incoming, getFrontHistoryLimit(tf));
          _historyBufferByKey[key] = nextBuf;

          scheduleHistoryCommit({ key, sessionId: sess, set, get });

          return {
            pairs: {
              ...state.pairs,
              [key]: {
                ...current,
                isLoadingHistory: true,
                _historySessionId: sess,
                _lastIncomingHistorySig: incomingSig || current._lastIncomingHistorySig || "",
                _hotTouchedAt: Date.now(),
              },
            },
          };
        }

        if (type === "history_prepend") {
          const prependPayload = data && typeof data === "object" ? data : {};
          const incoming = sanitizeCandlesArray(prependPayload?.candles || [], getFrontHistoryLimit(current.timeframe));
          const currentOldestTime = Number(current.candles?.[0]?.time || 0);
          const nextCandles = mergeCandles(
            current.candles,
            incoming,
            getFrontHistoryLimit(current.timeframe)
          );
          const nextOldestTime = Number(nextCandles?.[0]?.time || 0);

          const archiveStatus = prependPayload?.archiveStatus || current.archiveStatus || null;
          const hasMoreExplicit = typeof prependPayload?.hasMore === "boolean" ? prependPayload.hasMore : null;
          const inferredHasMore = incoming.length > 0 && Number.isFinite(currentOldestTime) && Number.isFinite(nextOldestTime) && nextOldestTime < currentOldestTime;
          const hasMoreHistory =
            hasMoreExplicit != null
              ? hasMoreExplicit
              : inferredHasMore;

          const nextPair = {
            ...current,
            candles: nextCandles,
            isLoadingHistory: false,
            _historyLoadMorePending: false,
            archiveStatus,
            hasMoreHistory,
            _hotTouchedAt: Date.now(),
          };

          delete _historyLoadMoreRequestByKey[key];

          persistHistorySnapshot(key, nextPair.candles, nextPair.liveCandle, {
            timeframe: nextPair.timeframe,
            timeframeSec: nextPair.timeframeSec,
          });

          return {
            pairs: {
              ...state.pairs,
              [key]: nextPair,
            },
          };
        }

        if (type === "candle_update") {
          const live = sanitizeCandleLike(data);
          if (!live) return state;

          const lastLive = Number(current._lastLiveTime || 0);
          const lastHist = Number(current._lastHistoryTime || 0);

          if (lastLive > 0 && live.time < lastLive) return state;
          if (lastHist > 0 && live.time <= lastHist) return state;

          const nextPair = {
            ...current,
            liveCandle: live,
            _lastLiveTime: Math.max(lastLive, live.time),
            _hotTouchedAt: Date.now(),
          };

          persistHistorySnapshot(key, nextPair.candles, nextPair.liveCandle, {
            timeframe: nextPair.timeframe,
            timeframeSec: nextPair.timeframeSec,
          });

          return {
            pairs: {
              ...state.pairs,
              [key]: nextPair,
            },
          };
        }

        if (type === "candle_close") {
          const closed = sanitizeCandleLike(data);
          if (!closed) return state;

          const lastHist = Number(current._lastHistoryTime || 0);
          const t = Number(closed.time);

          if (lastHist > 0 && t < lastHist) return state;

          const nextCandles = upsertClosedCandle({
            candles: current.candles,
            closed,
            limit: getFrontHistoryLimit(current.timeframe),
          });

          let nextLive = current.liveCandle;
          if (nextLive && Number(nextLive.time) <= t) {
            nextLive = null;
          }

          const sess = startHistorySession(key);

          const nextPair = {
            ...current,
            candles: nextCandles,
            liveCandle: nextLive,
            isLoadingHistory: true,
            _lastHistoryTime: Math.max(lastHist, t),
            _historySessionId: sess,
            _historyLoadMorePending: Boolean(current._historyLoadMorePending),
            _hotTouchedAt: Date.now(),
          };

          persistHistorySnapshot(key, nextPair.candles, nextPair.liveCandle, {
            timeframe: nextPair.timeframe,
            timeframeSec: nextPair.timeframeSec,
          });

          return {
            pairs: {
              ...state.pairs,
              [key]: nextPair,
            },
          };
        }

        if (type === "tick") {
          const tick = sanitizeTick(data);
          if (!tick) return state;

          const tfSec = Number(current.timeframeSec) || 60;
          const bucket = getBucketTime(tick.time, tfSec);

          const prevBucket = Number(current._lastTickBucketTime || 0);
          const seenTime = Number(current._lastTickSeenTime || 0);

          const nextTickSeq = Number(current.tickSeq || 0) + 1;
          const publishedTick = { ...tick, __seq: nextTickSeq };

          const next = {
            ...current,
            tickSeq: nextTickSeq,
            lastTick: publishedTick,
            _lastTickSeenTime: Math.max(seenTime, tick.time),
            _hotTouchedAt: Date.now(),
          };

          if (bucket != null) {
            next._lastTickBucketTime = Math.max(prevBucket, bucket);

            if (prevBucket <= 0 || bucket > prevBucket) {
              next._firstTickPriceInBucket = tick.bid;
              next._firstTickBucketTime = bucket;
            }
          }

          if (next.liveCandle) {
            const live = next.liveCandle;
            const tickBucket = bucket;
            const liveTime = Number(live?.time);
            if (tickBucket != null && Number.isFinite(liveTime) && tickBucket === liveTime) {
              const bid = Number(tick.bid);
              if (Number.isFinite(bid)) {
                next.liveCandle = {
                  ...live,
                  high: Math.max(Number(live.high), bid),
                  low: Math.min(Number(live.low), bid),
                  close: bid,
                  volume: (Number(live.volume) || 0) + 1,
                };
                next._lastLiveTime = Math.max(Number(next._lastLiveTime || 0), liveTime);
              }
            }
          }

          persistHistorySnapshot(key, next.candles, next.liveCandle, {
            timeframe: next.timeframe,
            timeframeSec: next.timeframeSec,
          });

          return {
            pairs: {
              ...state.pairs,
              [key]: next,
            },
          };
        }

        return state;
      });
    },

    loadMoreHistory: (pair, timeframe = "M1", fromTime = 0) => {
      if (!pair) return;
      const symbol = String(pair).toUpperCase().trim();
      const tf = String(timeframe || "M1").toUpperCase().trim();
      const key = makePairKey(symbol, tf);

      const current = get().pairs?.[key];
      if (!current) return;
      if (current.hasMoreHistory === false) return;

      const oldestTime = Number(current.candles?.[0]?.time || 0);
      const beforeTime = Number(fromTime) || oldestTime;
      if (!Number.isFinite(beforeTime) || beforeTime <= 0) return;

      const inflight = _historyLoadMoreRequestByKey[key];
      const inflightFromTime = Number(inflight?.fromTime || 0);
      const inflightSentAt = Number(inflight?.sentAt || 0);
      const now = Date.now();

      if (current._historyLoadMorePending) {
        if (inflightFromTime === beforeTime) return;
        if (inflightSentAt > 0 && now - inflightSentAt < 1500) return;
      }

      if (inflightFromTime === beforeTime && inflightSentAt > 0 && now - inflightSentAt < 1500) {
        return;
      }

      const limit = tf === "M1" || tf === "M5" ? 500 : 400;

      _historyLoadMoreRequestByKey[key] = {
        fromTime: beforeTime,
        sentAt: now,
      };

      set((state) => {
        const pairState = state.pairs?.[key];
        if (!pairState) return state;
        return {
          pairs: {
            ...state.pairs,
            [key]: {
              ...pairState,
              _historyLoadMorePending: true,
            },
          },
        };
      });

      wsLoadMore(wsManager, symbol, tf, beforeTime, limit);
    },

    removePair: (pair, timeframe = "M1") => {
      if (!pair) return;

      const symbol = String(pair).toUpperCase().trim();
      const tf = String(timeframe || "M1").toUpperCase().trim();
      const key = makePairKey(symbol, tf);

      if (!get().pairs[key]) return;

      if (get()._isPinned(key)) return;

      clearOrphanCloseTimer(key);
      wsClosePair(wsManager, symbol, tf);

      try {
        if (_historyCommitTimerByKey[key]) clearTimeout(_historyCommitTimerByKey[key]);
      } catch {}
      delete _historyCommitTimerByKey[key];
      delete _historyBufferByKey[key];
      delete _historySessionIdByKey[key];
      delete _historyLoadMoreRequestByKey[key];
      clearPostHydrationResyncTimers(key);
  
      set((state) => {
        const newPairs = { ...state.pairs };
        delete newPairs[key];
        return { pairs: newPairs };
      });
    },

    refreshPairForChart: ({ pair, timeframe = "M1" }) => {
      if (!pair) return;

      const symbol = String(pair).toUpperCase().trim();
      const tf = String(timeframe || "M1").toUpperCase().trim() || "M1";
      const timeframeSec = TF_MAP[tf] || 60;
      const key = makePairKey(symbol, tf);

      clearOrphanCloseTimer(key);

      const stateNow = get();
      const existing = stateNow.pairs?.[key];
      const existingUsable = canUseCachedPairSeed(existing, timeframeSec);
      const cachedSnapshot = existingUsable ? null : readHistorySnapshot(key);
      const cachedCandles = existingUsable
        ? sanitizeCandlesArray(existing?.candles)
        : Array.isArray(cachedSnapshot?.candles)
          ? cachedSnapshot.candles
          : [];
      const cachedLiveCandle = existingUsable
        ? sanitizeCandleLike(existing?.liveCandle)
        : (cachedSnapshot?.liveCandle || null);
      const cachedLastClosedTime = cachedCandles.length
        ? Number(cachedCandles[cachedCandles.length - 1]?.time || 0)
        : 0;
      const sess = startHistorySession(key);

      set((state) => {
        const nextPairs = {
          ...(state.pairs || {}),
          [key]: {
            ...(state.pairs?.[key] || {}),
            timeframe: tf,
            timeframeSec,
            tickSeq: Number(existing?.tickSeq || 0),
            _lastTickSeenTime: Number(existing?._lastTickSeenTime || 0),
            _lastTickBucketTime: Number(existing?._lastTickBucketTime || 0),
            _firstTickPriceInBucket: existing?._firstTickPriceInBucket ?? null,
            _firstTickBucketTime: Number(existing?._firstTickBucketTime || 0),
            candles: cachedCandles,
            liveCandle: cachedLiveCandle,
            lastTick: existing?.lastTick || null,
            isLoadingHistory: !(cachedCandles.length || cachedLiveCandle),
            _lastHistoryTime: Number.isFinite(cachedLastClosedTime) ? cachedLastClosedTime : 0,
            _lastLiveTime: Number(cachedLiveCandle?.time || 0) || 0,
            _historySessionId: sess,
            _historyLoadMorePending: false,
            _lastIncomingHistorySig: existing?._lastIncomingHistorySig || "",
            _hotTouchedAt: Date.now(),
          },
        };

        return {
          currentFocusKey: key,
          pairs: prunePairsKeepRecent(nextPairs, key, 4, state.pinned),
        };
      });

      try {
        wsOpenPair(wsManager, symbol, tf, {
          forceResync: true,
          source: "focus_switch",
        });
      } catch {}
    },

    clearPairForChart: ({ pair, timeframe = "M1" }) => {
      if (!pair) return;

      const symbol = String(pair).toUpperCase().trim();
      const tf = String(timeframe || "M1").toUpperCase().trim() || "M1";
      const key = makePairKey(symbol, tf);

      if (!get().pairs[key]) return;

      wsClosePair(wsManager, symbol, tf);
      try { if (_historyCommitTimerByKey[key]) clearTimeout(_historyCommitTimerByKey[key]); } catch {}
      delete _historyCommitTimerByKey[key];
      delete _historyBufferByKey[key];
      delete _historySessionIdByKey[key];
      delete _historyLoadMoreRequestByKey[key];
      clearPostHydrationResyncTimers(key);
      clearOrphanCloseTimer(key);

      set((state) => {
        const pairs = { ...(state.pairs || {}) };
        delete pairs[key];
        return {
          currentFocusKey: state.currentFocusKey === key ? "" : state.currentFocusKey,
          pairs,
        };
      });
    },
  };
});
