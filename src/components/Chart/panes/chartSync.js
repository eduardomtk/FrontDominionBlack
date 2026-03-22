// src/components/chart/panes/chartSync.js
// Master (main chart) -> Slave viewport sync
//
// ✅ Perfis:
// - role: "pane"  -> NÃO aplica RANGE (ViewportBroker é o soberano). Só replica barSpacing/rightOffset/opções.
// - role: "footer"-> pode aplicar RANGE (continuous=true se quiser)
//
// ✅ FIX CRÍTICO (anti-conflito):
// - Para panes, DESLIGA setVisibleRange/setVisibleLogicalRange aqui.
//   Se não, briga com ViewportBroker e causa “pulo”/clamp e trava na vela passada.
//
// ✅ Menos recalculo:
// - Comparações com EPS (não strict ===).
// - continuous default depende do role.
//
// ✅ API extra:
// - return function unsub() { ... }
// - unsub.force() => força reaplicar mesmo se caches "iguais"

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : NaN;
}

function near(a, b, eps = 1e-6) {
  const x = num(a);
  const y = num(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) <= eps;
}

function logicalEq(a, b) {
  if (!a || !b) return false;
  return near(a.from, b.from, 1e-4) && near(a.to, b.to, 1e-4);
}

function timeEq(a, b) {
  if (!a || !b) return false;
  return near(a.from, b.from, 1e-3) && near(a.to, b.to, 1e-3);
}

// ✅ LWC v4 costuma expor barSpacing()/rightOffset() (não getBarSpacing/getRightOffset)
// Mantemos compat também com get* e options().
function readMasterSpacingAndOffset(mt) {
  let bs = NaN;
  let ro = NaN;

  // 1) APIs novas (barSpacing/rightOffset)
  try {
    const gbs = mt.barSpacing?.();
    if (Number.isFinite(num(gbs)) && num(gbs) > 0) bs = num(gbs);
  } catch {}
  try {
    const gro = mt.rightOffset?.();
    if (Number.isFinite(num(gro))) ro = num(gro);
  } catch {}

  // 2) APIs antigas (getBarSpacing/getRightOffset)
  if (!Number.isFinite(bs)) {
    try {
      const gbs = mt.getBarSpacing?.();
      if (Number.isFinite(num(gbs)) && num(gbs) > 0) bs = num(gbs);
    } catch {}
  }
  if (!Number.isFinite(ro)) {
    try {
      const gro = mt.getRightOffset?.();
      if (Number.isFinite(num(gro))) ro = num(gro);
    } catch {}
  }

  // 3) fallback options()
  if (!Number.isFinite(bs) || !Number.isFinite(ro)) {
    try {
      const o = mt.options?.() || {};
      if (!Number.isFinite(bs)) {
        const obs = num(o.barSpacing);
        if (Number.isFinite(obs) && obs > 0) bs = obs;
      }
      if (!Number.isFinite(ro)) {
        const oro = num(o.rightOffset);
        if (Number.isFinite(oro)) ro = oro;
      }
    } catch {}
  }

  return { bs, ro };
}

export function syncTimeScale(masterChart, slaveChart, masterContainerEl, opts = {}) {
  if (!masterChart || !slaveChart) {
    const noop = () => {};
    noop.force = () => {};
    return noop;
  }

  const role = String(opts?.role || "generic").toLowerCase(); // "pane" | "footer" | "generic"
  const mode = String(opts?.mode || "logical").toLowerCase(); // "logical" | "time"

  // ✅ continuous default: panes NÃO rodam loop
  const continuous = opts?.continuous === undefined ? role !== "pane" : opts?.continuous !== false;

  const debug = !!opts?.debug;
  const tag = String(opts?.tag || "SYNC").trim();

  // ✅ Anti-briga com ViewportBroker:
  // panes NÃO aplicam RANGE aqui (broker é soberano)
  const disableRange = opts?.disableRange === undefined ? role === "pane" : !!opts?.disableRange;

  const mt = masterChart.timeScale?.();
  const st = slaveChart.timeScale?.();
  if (!mt || !st) {
    const noop = () => {};
    noop.force = () => {};
    return noop;
  }

  let disposed = false;

  let lastBS = NaN;
  let lastRO = NaN;
  let lastLR = null;
  let lastTR = null;

  let rafId = 0;
  let rafRunning = false;

  let rafForeverId = 0;

  let schedId = 0;
  let scheduled = false;

  const dbg = (stage, data = {}) => {
    if (!debug) return;
    try {
      console.log(`[${tag}] ${stage}`, data);
    } catch {}
  };

  const applySpacingOffset = (force = false) => {
    if (disposed) return;

    try {
      const { bs, ro } = readMasterSpacingAndOffset(mt);

      const opt = {};
      if (Number.isFinite(bs) && (force || !near(bs, lastBS, 1e-6))) opt.barSpacing = bs;
      if (Number.isFinite(ro) && (force || !near(ro, lastRO, 1e-6))) opt.rightOffset = ro;

      try {
        const o = mt.options?.() || {};
        if (typeof o.fixLeftEdge === "boolean") opt.fixLeftEdge = o.fixLeftEdge;
        if (typeof o.fixRightEdge === "boolean") opt.fixRightEdge = o.fixRightEdge;
        if (typeof o.lockVisibleTimeRangeOnResize === "boolean") opt.lockVisibleTimeRangeOnResize = o.lockVisibleTimeRangeOnResize;
        if (typeof o.shiftVisibleRangeOnNewBar === "boolean") opt.shiftVisibleRangeOnNewBar = o.shiftVisibleRangeOnNewBar;
      } catch {}

      if (Object.keys(opt).length) {
        st.applyOptions?.(opt);
        if (Number.isFinite(bs)) lastBS = bs;
        if (Number.isFinite(ro)) lastRO = ro;
      }

      return { bs: lastBS, ro: lastRO };
    } catch {}
    return { bs: lastBS, ro: lastRO };
  };

  const applyRange = (force = false) => {
    if (disposed) return { applied: false, kind: "" };
    if (disableRange) return { applied: false, kind: "disabled" };

    try {
      if (mode === "time") {
        const tr = mt.getVisibleRange?.() ?? null;
        if (tr && tr.from != null && tr.to != null) {
          if (force || !timeEq(tr, lastTR)) {
            st.setVisibleRange?.(tr);
            lastTR = { from: tr.from, to: tr.to };
            dbg("range(time)", { tr });
            return { applied: true, kind: "time" };
          }
        }
        return { applied: false, kind: "time" };
      }

      // mode === "logical"
      const lr = mt.getVisibleLogicalRange?.() ?? null;
      if (lr && lr.from != null && lr.to != null) {
        if (force || !logicalEq(lr, lastLR)) {
          st.setVisibleLogicalRange?.(lr);
          lastLR = { from: lr.from, to: lr.to };
          dbg("range(logical)", { lr });
          return { applied: true, kind: "logical" };
        }
        return { applied: false, kind: "logical" };
      }

      // fallback
      const tr = mt.getVisibleRange?.() ?? null;
      if (tr && tr.from != null && tr.to != null) {
        if (force || !timeEq(tr, lastTR)) {
          st.setVisibleRange?.(tr);
          lastTR = { from: tr.from, to: tr.to };
          dbg("range(fallback-time)", { tr });
          return { applied: true, kind: "fallback-time" };
        }
      }
    } catch {}

    return { applied: false, kind: "" };
  };

  const applyFromMaster = (force = false) => {
    if (disposed) return;

    // ✅ ORDEM:
    // - Se RANGE estiver habilitado: aplica RANGE -> reaplica spacing/offset
    // - Se RANGE estiver desabilitado (pane): só spacing/offset
    const r = applyRange(force);
    const needReapply = force || r.applied;

    applySpacingOffset(needReapply || force);

    if (debug) {
      dbg("apply", {
        mode,
        role,
        force,
        disableRange,
        appliedRange: r,
        bs: lastBS,
        ro: lastRO,
      });
    }
  };

  const scheduleApply = (o = {}) => {
    if (disposed) return;
    if (scheduled) return;

    const force = !!o.force;
    if (force) {
      lastLR = null;
      lastTR = null;
      lastBS = NaN;
      lastRO = NaN;
    }

    scheduled = true;
    schedId = requestAnimationFrame(() => {
      scheduled = false;
      schedId = 0;
      applyFromMaster(force);
    });
  };

  const stopRaf = () => {
    if (rafId) {
      try { cancelAnimationFrame(rafId); } catch {}
      rafId = 0;
    }
    rafRunning = false;
  };

  const startRaf = (autoStopMs = 250) => {
    if (disposed) return;
    if (rafRunning) return;

    rafRunning = true;
    const startAt = performance.now?.() ?? Date.now();

    const tick = () => {
      if (disposed) return stopRaf();
      scheduleApply();

      const now = performance.now?.() ?? Date.now();
      if (now - startAt > autoStopMs) return stopRaf();

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
  };

  const startContinuousLoop = () => {
    if (!continuous) return;
    if (rafForeverId) return;

    const loop = () => {
      if (disposed) return;
      scheduleApply();
      rafForeverId = requestAnimationFrame(loop);
    };

    rafForeverId = requestAnimationFrame(loop);
  };

  const stopContinuousLoop = () => {
    if (rafForeverId) {
      try { cancelAnimationFrame(rafForeverId); } catch {}
      rafForeverId = 0;
    }
  };

  // init
  applyFromMaster(true);
  startContinuousLoop();

  const unsubscribers = [];

  // ✅ Mesmo com disableRange=true (pane), ainda queremos disparar applySpacingOffset
  // quando o usuário scroll/zoom/pan no master (esses eventos mudam o visible range).
  try {
    if (typeof mt.subscribeVisibleLogicalRangeChange === "function") {
      const cb = () => scheduleApply();
      mt.subscribeVisibleLogicalRangeChange(cb);
      unsubscribers.push(() => mt.unsubscribeVisibleLogicalRangeChange(cb));
    }
  } catch {}

  try {
    if (typeof mt.subscribeVisibleTimeRangeChange === "function") {
      const cb = () => scheduleApply();
      mt.subscribeVisibleTimeRangeChange(cb);
      unsubscribers.push(() => mt.unsubscribeVisibleTimeRangeChange(cb));
    }
  } catch {}

  const el = masterContainerEl || null;
  const domUnsubs = [];

  if (el && el.addEventListener) {
    let dragging = false;

    const onPointerDown = () => {
      dragging = true;
      startRaf(10_000);
    };

    const onPointerUp = () => {
      dragging = false;
      scheduleApply({ force: true });
      startRaf(250);
    };

    const onPointerMove = () => {
      if (dragging) startRaf(10_000);
    };

    const onWheel = () => {
      startRaf(450);
    };

    el.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    el.addEventListener("pointermove", onPointerMove, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });

    domUnsubs.push(() => el.removeEventListener("pointerdown", onPointerDown));
    domUnsubs.push(() => el.removeEventListener("pointermove", onPointerMove));
    domUnsubs.push(() => el.removeEventListener("wheel", onWheel));
    domUnsubs.push(() => window.removeEventListener("pointerup", onPointerUp));
    domUnsubs.push(() => window.removeEventListener("pointercancel", onPointerUp));
  }

  const unsub = () => {
    disposed = true;

    stopRaf();
    stopContinuousLoop();

    if (schedId) {
      try { cancelAnimationFrame(schedId); } catch {}
      schedId = 0;
    }
    scheduled = false;

    for (const u of unsubscribers) {
      try { u?.(); } catch {}
    }
    for (const u of domUnsubs) {
      try { u?.(); } catch {}
    }
  };

  // ✅ API extra: force
  unsub.force = () => {
    try {
      scheduleApply({ force: true });
      startRaf(250);
    } catch {}
  };

  return unsub;
}

// ---------
// Crosshair sync (mantive o seu exatamente, sem mexer)
// ---------
export function syncCrosshair(masterChart, slaveChart, a, b) {
  if (!masterChart || !slaveChart) return () => {};
  const ms = masterChart;
  const ss = slaveChart;

  const getMasterSeries = typeof b === "function" ? a : null;
  const getSlaveSeries = typeof b === "function" ? b : null;
  const getAnySeries = typeof b !== "function" ? a : null;

  let syncing = false;
  let lastMasterTime = null;
  let lastSlaveTime = null;

  const deriveTime = (chart, param, lastFallback) => {
    const direct = param?.time ?? null;
    if (direct != null) return direct;

    const pt = param?.point;
    const x = pt ? num(pt.x) : NaN;
    if (Number.isFinite(x)) {
      try {
        const t = chart.timeScale?.()?.coordinateToTime?.(x);
        if (t != null) return t;
      } catch {}
    }
    return lastFallback ?? null;
  };

  const derivePrice = (series, param) => {
    try {
      const sp = param?.seriesPrices;
      if (sp && typeof sp.get === "function" && series) {
        const v = sp.get(series);
        if (v != null && typeof v === "object" && "value" in v) {
          const pv = num(v.value);
          if (Number.isFinite(pv)) return pv;
        }
        if (typeof v === "number") {
          const pv = num(v);
          if (Number.isFinite(pv)) return pv;
        }
      }
    } catch {}

    const pt = param?.point;
    const y = pt ? num(pt.y) : NaN;
    if (Number.isFinite(y) && series?.coordinateToPrice) {
      try {
        const p = series.coordinateToPrice(y);
        const pv = num(p);
        if (Number.isFinite(pv)) return pv;
      } catch {}
    }
    return null;
  };

  const onMasterMove = (param) => {
    if (syncing) return;
    syncing = true;

    try {
      if (getMasterSeries && getSlaveSeries) {
        const mSeries = getMasterSeries();
        const sSeries = getSlaveSeries();
        if (!sSeries) return;

        const time = deriveTime(ms, param, lastMasterTime);
        if (time == null) return;
        lastMasterTime = time;

        const priceForSlave = derivePrice(mSeries, param);
        ss.setCrosshairPosition?.(priceForSlave, time, sSeries);
        return;
      }

      const series = typeof getAnySeries === "function" ? getAnySeries() : null;
      if (!series) return;

      const time = deriveTime(ms, param, lastMasterTime);
      if (time == null) return;
      lastMasterTime = time;

      const price = derivePrice(series, param);
      ss.setCrosshairPosition?.(price, time, series);
    } catch {
    } finally {
      syncing = false;
    }
  };

  const onSlaveMove = (param) => {
    if (syncing) return;
    syncing = true;

    try {
      if (getMasterSeries && getSlaveSeries) {
        const mSeries = getMasterSeries();
        const sSeries = getSlaveSeries();
        if (!mSeries) return;

        const time = deriveTime(ss, param, lastSlaveTime);
        if (time == null) return;
        lastSlaveTime = time;

        const priceForMaster = derivePrice(sSeries, param);
        ms.setCrosshairPosition?.(priceForMaster, time, mSeries);
        return;
      }

      const series = typeof getAnySeries === "function" ? getAnySeries() : null;
      if (!series) return;

      const time = deriveTime(ss, param, lastSlaveTime);
      if (time == null) return;
      lastSlaveTime = time;

      const price = derivePrice(series, param);
      ms.setCrosshairPosition?.(price, time, series);
    } catch {
    } finally {
      syncing = false;
    }
  };

  try { ms.subscribeCrosshairMove?.(onMasterMove); } catch {}
  try { ss.subscribeCrosshairMove?.(onSlaveMove); } catch {}

  return () => {
    try { ms.unsubscribeCrosshairMove?.(onMasterMove); } catch {}
    try { ss.unsubscribeCrosshairMove?.(onSlaveMove); } catch {}
  };
}