const BROKER_MARK = "__lwc_viewport_broker__";
const ROLLOVER_DEBOUNCE_MS = 70;

const SLAVE_CATCHUP_MAX_ATTEMPTS = 18;
const SLAVE_CATCHUP_WINDOW_MS = 1200;

// ✅ Manual-hold (estado do broker) = "o usuário saiu do realtime".
// - entra em manualHold no início da interação (pointer/wheel)
// - só sai quando o MASTER realmente voltou ao edge (scrollPosition≈0 / diff≈0)
const LIVE_EDGE_SCROLL_EPS = 0.9;
const LIVE_EDGE_DIFF_EPS = 2.25;

// ✅ Guard do “micro pulo”:
// se o slave estiver atrás do master (baseIndex), NÃO aplicar logicalRange 1:1 nesse frame.
// Isso evita clamp do LWC que causa “vai e volta”.
const SLAVE_BEHIND_EPS = 0.65;

// ✅ Edge-guard dos panes:
// perto dos limites, o slave pode ficar alguns décimos diferente do master por clamp interno do LWC.
// Nesses casos, tratar como sincronizado evita o 'pane tentando ir mais além'.
const MASTER_LEFT_EDGE = -8.0;
const EDGE_NEAR_EPS = 1.25;
const EDGE_RANGE_EPS = 0.9;

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
  return near(a.from, b.from, 1e-3) && near(a.to, b.to, 1e-3);
}

function safeGetVisibleLogicalRange(ts) {
  if (!ts?.getVisibleLogicalRange) return null;
  try {
    const r = ts.getVisibleLogicalRange();
    if (!r) return null;
    const f = Number(r.from);
    const t = Number(r.to);
    if (!Number.isFinite(f) || !Number.isFinite(t)) return null;
    return { from: f, to: t };
  } catch {
    return null;
  }
}

function safeSetVisibleLogicalRange(ts, range) {
  if (!ts?.setVisibleLogicalRange || !range) return;
  try {
    ts.setVisibleLogicalRange(range);
  } catch {}
}

function safeGetVisibleRangeRaw(ts) {
  if (!ts?.getVisibleRange) return null;
  try {
    const r = ts.getVisibleRange();
    if (!r || r.from == null || r.to == null) return null;
    return { from: r.from, to: r.to };
  } catch {
    return null;
  }
}

function safeGetRightOffset(ts) {
  let ro = NaN;

  if (ts?.rightOffset) {
    try {
      ro = Number(ts.rightOffset());
    } catch {}
  }

  if (!Number.isFinite(ro)) {
    try {
      const o = ts?.options?.() || {};
      const oro = Number(o.rightOffset);
      if (Number.isFinite(oro)) ro = oro;
    } catch {}
  }

  return ro;
}

function safeGetBarSpacing(ts) {
  let bs = NaN;

  if (ts?.barSpacing) {
    try {
      bs = Number(ts.barSpacing());
    } catch {}
  }

  if (!Number.isFinite(bs) || bs <= 0) {
    try {
      const o = ts?.options?.() || {};
      const obs = Number(o.barSpacing);
      if (Number.isFinite(obs) && obs > 0) bs = obs;
    } catch {}
  }

  return bs;
}

function safeApplyOptions(ts, opts) {
  if (!ts?.applyOptions) return;
  try {
    ts.applyOptions(opts);
  } catch {}
}

function safeGetBaseIndex(ts) {
  if (!ts?.getBaseIndex) return NaN;
  try {
    return Number(ts.getBaseIndex());
  } catch {
    return NaN;
  }
}

function safeGetScrollPosition(ts) {
  if (!ts?.scrollPosition) return NaN;
  try {
    const sp = Number(ts.scrollPosition());
    return Number.isFinite(sp) ? sp : NaN;
  } catch {
    return NaN;
  }
}

function safeGetRightPriceScaleWidth(chart) {
  if (!chart?.priceScale) return NaN;

  // 1) width() (real width calculado pelo LWC)
  try {
    const w = Number(chart.priceScale("right")?.width?.());
    if (Number.isFinite(w) && w > 0) return w;
  } catch {}

  // 2) fallback: minimumWidth configurado
  try {
    const o = chart.priceScale("right")?.options?.();
    const mw = Number(o?.minimumWidth);
    if (Number.isFinite(mw) && mw > 0) return mw;
  } catch {}

  return NaN;
}

function nearLeftViewportEdge(range, eps = EDGE_NEAR_EPS) {
  if (!range) return false;
  const from = Number(range.from);
  return Number.isFinite(from) && from <= (MASTER_LEFT_EDGE + eps);
}

function nearRightViewportEdge(range, baseIndex, rightOffset, eps = EDGE_NEAR_EPS) {
  if (!range) return false;
  const to = Number(range.to);
  const bi = Number(baseIndex);
  const ro = Number(rightOffset);
  if (!Number.isFinite(to) || !Number.isFinite(bi) || !Number.isFinite(ro)) return false;
  return Math.abs(to - (bi + ro)) <= eps;
}

function edgeClampedEquivalent(master, slave) {
  if (!master || !slave) return false;

  const fromDelta = Math.abs(Number(slave.from) - Number(master.from));
  const toDelta = Math.abs(Number(slave.to) - Number(master.to));
  if (!Number.isFinite(fromDelta) || !Number.isFinite(toDelta)) return false;

  if (fromDelta > EDGE_RANGE_EPS || toDelta > EDGE_RANGE_EPS) return false;

  const sameLeftEdge = nearLeftViewportEdge(master) && nearLeftViewportEdge(slave);
  const sameRightEdge =
    nearRightViewportEdge(master, master.__baseIndex, master.__rightOffset) &&
    nearRightViewportEdge(slave, master.__baseIndex, master.__rightOffset);

  return sameLeftEdge || sameRightEdge;
}

function rangeSig(range) {
  if (!range) return "";
  const from = Number(range.from);
  const to = Number(range.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return "";
  return `${from.toFixed(4)}|${to.toFixed(4)}`;
}

function masterSyncSig(master) {
  if (!master) return "";
  return [
    rangeSig(master.logicalRange),
    Number.isFinite(master.rightOffset) ? Number(master.rightOffset).toFixed(4) : "nan",
    Number.isFinite(master.barSpacing) ? Number(master.barSpacing).toFixed(4) : "nan",
    Number.isFinite(master.baseIndex) ? Number(master.baseIndex).toFixed(4) : "nan",
    master.manual ? "manual" : "auto",
    master.atLiveEdge ? "edge" : "off",
  ].join("::");
}

function clampLogicalRangeToMasterLimits(range, master) {
  if (!range) return null;

  const from = Number(range.from);
  const to = Number(range.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;

  let nextFrom = from;
  let nextTo = to;

  if (nextFrom < MASTER_LEFT_EDGE) {
    const shift = MASTER_LEFT_EDGE - nextFrom;
    nextFrom += shift;
    nextTo += shift;
  }

  const bi = Number(master?.baseIndex);
  const ro = Number(master?.rightOffset);
  if (Number.isFinite(bi) && Number.isFinite(ro)) {
    const maxTo = bi + ro;
    if (nextTo > maxTo + EDGE_NEAR_EPS) {
      const shift = nextTo - maxTo;
      nextFrom -= shift;
      nextTo -= shift;
      if (nextFrom < MASTER_LEFT_EDGE) {
        const pull = MASTER_LEFT_EDGE - nextFrom;
        nextFrom += pull;
        nextTo += pull;
      }
    }
  }

  return { from: nextFrom, to: nextTo };
}

function scheduleDoubleRAF(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

class ViewportBroker {
  constructor(masterChart) {
    this.masterChart = masterChart;
    this.masterTS = masterChart?.timeScale?.();

    this.slaves = new Map();

    this._disposed = false;
    this._syncing = false;

    this._raf = 0;
    this._watchdogTimer = 0;

    this._rolloverTimer = 0;
    this._lastMasterBaseIndex = NaN;

    // ✅ Interaction + Hold
    this._interactionActive = false;
    this._manualHold = false;

    this._onMasterChange = this._onMasterChange.bind(this);

    const ts = this.masterTS;
    if (ts) {
      try {
        ts.subscribeVisibleLogicalRangeChange?.(this._onMasterChange);
      } catch {}
      try {
        ts.subscribeVisibleTimeRangeChange?.(this._onMasterChange);
      } catch {}
    }

    this._watchdogTimer = window.setInterval(() => {
      if (this._disposed) return;
      this.forceSync("watchdog");
    }, 250);
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;

    if (this._raf) {
      try {
        cancelAnimationFrame(this._raf);
      } catch {}
      this._raf = 0;
    }

    if (this._watchdogTimer) {
      try {
        clearInterval(this._watchdogTimer);
      } catch {}
      this._watchdogTimer = 0;
    }

    if (this._rolloverTimer) {
      try {
        clearTimeout(this._rolloverTimer);
      } catch {}
      this._rolloverTimer = 0;
    }

    const ts = this.masterTS;
    if (ts) {
      try {
        ts.unsubscribeVisibleLogicalRangeChange?.(this._onMasterChange);
      } catch {}
      try {
        ts.unsubscribeVisibleTimeRangeChange?.(this._onMasterChange);
      } catch {}
    }

    this.slaves.clear();
  }

  // ✅ chamado pelo Workspace durante wheel/drag
  setInteractionActive(active) {
    if (this._disposed) return;

    const next = !!active;
    const prev = this._interactionActive;

    this._interactionActive = next;

    // entrou em interação => pode virar manual (hold)
    if (next && !prev) {
      this._manualHold = true;
    }
  }

  addSlave(slaveChart, { id } = {}) {
    if (this._disposed) return () => {};
    if (!slaveChart?.timeScale) return () => {};

    const ts = slaveChart.timeScale();
    const sid = String(id || `slave_${Math.random().toString(16).slice(2)}`);

    this.slaves.set(sid, {
      chart: slaveChart,
      ts,
      state: {
        catchupSince: 0,
        catchupAttempts: 0,
        lastAppliedMasterBI: NaN,
        lastAppliedSlaveBI: NaN,
        lastAppliedRangeSig: "",
        lastAppliedMasterSig: "",
      },
    });

    // ✅ preset inicial
    try {
      const mts = this.masterTS;
      const mo = mts?.options?.() || {};
      const ro = Number(mo.rightOffset);
      const bs = Number(mo.barSpacing);

      const opt = { shiftVisibleRangeOnNewBar: false };
      if (Number.isFinite(ro)) opt.rightOffset = ro;
      if (Number.isFinite(bs) && bs > 0) opt.barSpacing = bs;

      safeApplyOptions(ts, opt);
    } catch {}

    // ✅ Sincroniza largura do priceScale direito do slave com o master.
    // Isso elimina “desalinhamento no X / ir para o futuro” que aparece após trocar par (principalmente em crypto,
    // onde o label do preço pode alargar o right scale do master e o pane fica com plotArea diferente).
    const mw = safeGetRightPriceScaleWidth(this.masterChart);
    if (Number.isFinite(mw) && mw > 0 && slaveChart?.priceScale) {
      try {
        slaveChart.priceScale("right")?.applyOptions?.({ minimumWidth: Math.max(1, Math.round(mw)) });
      } catch {}
    }

    scheduleDoubleRAF(() => {
      if (this._disposed) return;
      this.forceSync("addSlave");
    });

    return () => this.removeSlave(sid);
  }

  removeSlave(id) {
    const sid = String(id || "");
    if (!sid) return;
    this.slaves.delete(sid);
  }

  forceSync(reason = "manual") {
    if (this._disposed) return;
    this._scheduleSync(reason);
  }

  // ✅ RAF pump chama isso
  forceSyncNow(reason = "manual") {
    if (this._disposed) return;
    this._sync(reason);
  }

  _readMaster() {
    const ts = this.masterTS;
    if (!ts) return null;

    const rawLogicalRange = safeGetVisibleLogicalRange(ts);
    const timeRange = safeGetVisibleRangeRaw(ts);

    const rightOffset = safeGetRightOffset(ts);
    const barSpacing = safeGetBarSpacing(ts);
    const baseIndex = safeGetBaseIndex(ts);

    const rightScaleWidth = safeGetRightPriceScaleWidth(this.masterChart);

    const logicalRange = clampLogicalRangeToMasterLimits(rawLogicalRange, { baseIndex, rightOffset }) || rawLogicalRange;

    if (!logicalRange && !timeRange) return null;

    const widthBars =
      logicalRange &&
      Number.isFinite(Number(logicalRange.to)) &&
      Number.isFinite(Number(logicalRange.from))
        ? Number(logicalRange.to) - Number(logicalRange.from)
        : NaN;

    // ✅ Detecta se o master está realmente no live-edge
    const sp = safeGetScrollPosition(ts);
    let atLiveEdge = false;

    if (Number.isFinite(sp)) {
      atLiveEdge = Math.abs(sp) <= LIVE_EDGE_SCROLL_EPS;
    } else if (logicalRange && Number.isFinite(baseIndex) && Number.isFinite(rightOffset)) {
      const diff = Number(logicalRange.to) - (Number(baseIndex) + Number(rightOffset));
      atLiveEdge = Math.abs(diff) <= LIVE_EDGE_DIFF_EPS;
    }

    // ✅ manualHold persiste até voltar para o live-edge (sem interação ativa)
    if (!this._interactionActive) {
      if (this._manualHold && atLiveEdge) {
        this._manualHold = false;
      }
    }

    // ✅ autoScroll: só quando NÃO está em interação e NÃO está em manualHold e está no live-edge
    const autoScroll = !this._interactionActive && !this._manualHold && atLiveEdge && Number.isFinite(baseIndex);

    return {
      logicalRange: logicalRange || null,
      timeRange: timeRange || null,
      rightOffset: Number.isFinite(rightOffset) ? rightOffset : NaN,
      barSpacing: Number.isFinite(barSpacing) ? barSpacing : NaN,
      baseIndex: Number.isFinite(baseIndex) ? baseIndex : NaN,
      widthBars: Number.isFinite(widthBars) ? widthBars : NaN,
      autoScroll,
      rightScaleWidth: Number.isFinite(rightScaleWidth) ? rightScaleWidth : NaN,
      manual: !!this._manualHold || !!this._interactionActive,
      atLiveEdge,
    };
  }

  _readSlave(ts) {
    return {
      logicalRange: safeGetVisibleLogicalRange(ts),
      timeRange: safeGetVisibleRangeRaw(ts),
      rightOffset: safeGetRightOffset(ts),
      barSpacing: safeGetBarSpacing(ts),
      baseIndex: safeGetBaseIndex(ts),
    };
  }

  _applyOptionsIfNeeded(ts, master, slaveSnap) {
    const opt = {};
    let changed = false;

    // ✅ barSpacing sempre replica (zoom consistente)
    if (Number.isFinite(master.barSpacing)) {
      if (!Number.isFinite(slaveSnap.barSpacing) || !near(slaveSnap.barSpacing, master.barSpacing, 1e-3)) {
        opt.barSpacing = master.barSpacing;
        changed = true;
      }
    }

    // ✅ rightOffset sempre replica.
    // Nos limites isso evita o pane ficar tentando um offset diferente do principal.
    if (Number.isFinite(master.rightOffset)) {
      if (!Number.isFinite(slaveSnap.rightOffset) || !near(slaveSnap.rightOffset, master.rightOffset, 1e-3)) {
        opt.rightOffset = master.rightOffset;
        changed = true;
      }
    }

    opt.shiftVisibleRangeOnNewBar = false;

    if (Object.keys(opt).length) safeApplyOptions(ts, opt);
    return changed;
  }

  _applyRightScaleWidthIfNeeded(slaveChart, master) {
    if (!slaveChart?.priceScale) return;

    const mw = Number(master?.rightScaleWidth);
    if (!Number.isFinite(mw) || mw <= 0) return;

    let cur = NaN;
    try {
      cur = Number(slaveChart.priceScale("right")?.width?.());
    } catch {}
    if (!Number.isFinite(cur) || cur <= 0) {
      try {
        const o = slaveChart.priceScale("right")?.options?.();
        cur = Number(o?.minimumWidth);
      } catch {}
    }

    if (!Number.isFinite(cur) || Math.abs(cur - mw) > 0.5) {
      try {
        slaveChart.priceScale("right")?.applyOptions?.({ minimumWidth: Math.max(1, Math.round(mw)) });
      } catch {}
    }
  }

  _shouldCatchupRetry(master, slaveState) {
    if (!master?.autoScroll) return false;

    const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

    if (!slaveState.catchupSince || now - slaveState.catchupSince > SLAVE_CATCHUP_WINDOW_MS) {
      slaveState.catchupSince = now;
      slaveState.catchupAttempts = 0;
    }

    slaveState.catchupAttempts += 1;
    return slaveState.catchupAttempts <= SLAVE_CATCHUP_MAX_ATTEMPTS;
  }

  _expectedSlaveLogical(ts, master, slaveState) {
    if (!master) return null;

    // ✅ Regra soberana: se o master expõe visibleLogicalRange, replica 1:1.
    // (Mas só chamaremos isso quando o slave NÃO estiver atrasado; guard fica em _applyToSlave)
    if (master.logicalRange) {
      return clampLogicalRangeToMasterLimits(
        {
          from: Number(master.logicalRange.from),
          to: Number(master.logicalRange.to),
        },
        master
      );
    }

    const ro = Number.isFinite(master.rightOffset) ? Number(master.rightOffset) : 0;

    // ✅ Fallback (raro): sem logicalRange do master
    if (master.autoScroll && Number.isFinite(master.widthBars)) {
      const slaveBI = safeGetBaseIndex(ts);
      if (!Number.isFinite(slaveBI)) return null;

      // monotonic guard: reset duro
      if (Number.isFinite(slaveState.lastAppliedMasterBI) && Number.isFinite(master.baseIndex)) {
        if (Number(master.baseIndex) < Number(slaveState.lastAppliedMasterBI) - 0.5) {
          slaveState.lastAppliedMasterBI = NaN;
          slaveState.lastAppliedSlaveBI = NaN;
        }
      }

      const to = Number(slaveBI) + ro;
      const from = Number(to) - Number(master.widthBars);
      return { from, to };
    }

    return null;
  }

  _needsSync(slaveSnap, master, expected) {
    if (expected && slaveSnap.logicalRange) {
      const masterTagged = {
        ...expected,
        __baseIndex: master?.baseIndex,
        __rightOffset: master?.rightOffset,
      };
      if (!logicalEq(slaveSnap.logicalRange, expected) && !edgeClampedEquivalent(masterTagged, slaveSnap.logicalRange)) return true;
    } else if (expected && !slaveSnap.logicalRange) {
      return true;
    }

    if (Number.isFinite(master.rightOffset)) {
      if (!Number.isFinite(slaveSnap.rightOffset) || !near(slaveSnap.rightOffset, master.rightOffset, 1e-3)) return true;
    }

    if (Number.isFinite(master.barSpacing)) {
      if (!Number.isFinite(slaveSnap.barSpacing) || !near(slaveSnap.barSpacing, master.barSpacing, 1e-3)) return true;
    }

    return false;
  }

  _applyToSlave(ts, master, slaveState) {
    const before = this._readSlave(ts);

    // ✅ sempre replica zoom/offset quando aplicável
    const optionsChanged = this._applyOptionsIfNeeded(ts, master, before);

    const expected = this._expectedSlaveLogical(ts, master, slaveState);
    const expectedTagged = expected
      ? { ...expected, __baseIndex: master?.baseIndex, __rightOffset: master?.rightOffset }
      : null;
    const expectedSig = rangeSig(expected);

    // ✅ FAST PATH durante interação manual:
    // aplicar somente 1x por snapshot do master, sem watchdogs extras / doubleRAF.
    // Isso reduz atraso perceptível e a sensação de “pane correndo atrás”.
    if (master.manual) {
      const needsRange =
        expected &&
        (!before.logicalRange ||
          (!logicalEq(before.logicalRange, expected) && !edgeClampedEquivalent(expectedTagged, before.logicalRange)));

      if (needsRange) {
        safeSetVisibleLogicalRange(ts, expected);
      }

      slaveState.lastAppliedRangeSig = expectedSig || slaveState.lastAppliedRangeSig;
      slaveState.lastAppliedMasterSig = masterSyncSig(master);

      if (master.autoScroll && Number.isFinite(master.baseIndex)) {
        slaveState.lastAppliedMasterBI = Number(master.baseIndex);
        slaveState.lastAppliedSlaveBI = Number(before.baseIndex);
      }

      if (!needsRange && !optionsChanged) return;
      return;
    }

    // ✅ FIX do micro-pulo:
    // Se estamos em realtime (autoScroll) e o slave está atrasado no baseIndex,
    // NÃO aplicar logicalRange agora (isso gera clamp -> “volta e vai”).
    if (
      master.autoScroll &&
      Number.isFinite(master.baseIndex) &&
      Number.isFinite(before.baseIndex) &&
      Number(before.baseIndex) < Number(master.baseIndex) - SLAVE_BEHIND_EPS
    ) {
      if (this._shouldCatchupRetry(master, slaveState)) {
        requestAnimationFrame(() => {
          if (this._disposed) return;
          this.forceSync("slaveBehind");
        });
      }
      return;
    }

    if (!expected) {
      if (this._shouldCatchupRetry(master, slaveState)) {
        requestAnimationFrame(() => {
          if (this._disposed) return;
          this.forceSync("slaveCatchup");
        });
      }
      return;
    }

    safeSetVisibleLogicalRange(ts, expected);
    slaveState.lastAppliedRangeSig = expectedSig;
    slaveState.lastAppliedMasterSig = masterSyncSig(master);

    if (master.autoScroll && Number.isFinite(master.baseIndex)) {
      slaveState.lastAppliedMasterBI = Number(master.baseIndex);
      slaveState.lastAppliedSlaveBI = Number(before.baseIndex);
    }

    scheduleDoubleRAF(() => {
      if (this._disposed) return;

      const after = this._readSlave(ts);
      this._applyOptionsIfNeeded(ts, master, after);

      // ✅ se ainda divergiu (normal em clamp), tenta mais uma vez
      const expectedAfter = this._expectedSlaveLogical(ts, master, slaveState);
      const expectedAfterTagged = expectedAfter
        ? { ...expectedAfter, __baseIndex: master?.baseIndex, __rightOffset: master?.rightOffset }
        : null;
      if (
        expectedAfter &&
        after.logicalRange &&
        !logicalEq(after.logicalRange, expectedAfter) &&
        !edgeClampedEquivalent(expectedAfterTagged, after.logicalRange)
      ) {
        // mas evita forçar se o slave ainda estiver atrás (mesmo motivo do micro-pulo)
        if (
          !(
            master.autoScroll &&
            Number.isFinite(master.baseIndex) &&
            Number.isFinite(after.baseIndex) &&
            Number(after.baseIndex) < Number(master.baseIndex) - SLAVE_BEHIND_EPS
          )
        ) {
          safeSetVisibleLogicalRange(ts, expectedAfter);
          slaveState.lastAppliedRangeSig = rangeSig(expectedAfter);
        }
      }
    });
  }

  _onMasterChange() {
    if (this._disposed) return;

    const ts = this.masterTS;
    if (!ts) {
      this._scheduleSync("masterChange");
      return;
    }

    const bi = safeGetBaseIndex(ts);
    let isRollover = false;

    if (Number.isFinite(bi) && Number.isFinite(this._lastMasterBaseIndex)) {
      if (bi > this._lastMasterBaseIndex + 0.5) isRollover = true;
    }
    if (Number.isFinite(bi)) this._lastMasterBaseIndex = bi;

    if (isRollover) {
      if (this._rolloverTimer) {
        try {
          clearTimeout(this._rolloverTimer);
        } catch {}
      }
      this._rolloverTimer = window.setTimeout(() => {
        this._rolloverTimer = 0;
        this.forceSync("rollover");
      }, ROLLOVER_DEBOUNCE_MS);
      return;
    }

    this._scheduleSync("masterChange");
  }

  _scheduleSync(reason) {
    if (this._disposed) return;
    if (this._raf) return;

    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._sync(reason);
    });
  }

  _sync(reason) {
    if (this._disposed) return;
    if (this._syncing) return;

    const master = this._readMaster();
    if (!master) return;

    const masterSig = masterSyncSig(master);

    this._syncing = true;
    try {
      for (const [, s] of this.slaves.entries()) {
        const ts = s?.ts;
        const st = s?.state;
        if (!ts || !st) continue;

        if (reason !== "watchdog" && st.lastAppliedMasterSig === masterSig) continue;

        const snap = this._readSlave(ts);
        const expected = this._expectedSlaveLogical(ts, master, st);
        const needs = this._needsSync(snap, master, expected);

        if (!needs && reason !== "watchdog") {
          st.lastAppliedMasterSig = masterSig;
          continue;
        }

        // ✅ mantém plotArea idêntico ao master (priceScale direita)
        try {
          this._applyRightScaleWidthIfNeeded(s?.chart, master);
        } catch {}

        this._applyToSlave(ts, master, st);
        st.lastAppliedMasterSig = masterSig;
      }
    } finally {
      this._syncing = false;
    }
  }
}

export function ensureViewportBroker(masterChart) {
  if (!masterChart) return null;

  const any = masterChart;
  const existing = any[BROKER_MARK];
  if (existing && typeof existing.addSlave === "function") return existing;

  const broker = new ViewportBroker(masterChart);
  any[BROKER_MARK] = broker;
  return broker;
}

export function disposeViewportBroker(masterChart) {
  if (!masterChart) return;
  const any = masterChart;
  const b = any[BROKER_MARK];
  if (b && typeof b.dispose === "function") {
    try {
      b.dispose();
    } catch {}
  }
  try {
    delete any[BROKER_MARK];
  } catch {}
}