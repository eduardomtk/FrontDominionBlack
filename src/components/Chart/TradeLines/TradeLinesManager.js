import TradeLineOverlay from "./TradeLineOverlay";

function pickNumber(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeDirection(d) {
  const s = String(d || "").toUpperCase();
  if (s === "CALL" || s === "PUT") return s;
  if (s === "BUY") return "CALL";
  if (s === "SELL") return "PUT";
  return s || "CALL";
}

function normalizeExpiresAt(trade) {
  const exp1 = Number(trade?.expiresAt);
  if (Number.isFinite(exp1)) return exp1;

  const exp2 = Number(trade?.expirationTime);
  if (Number.isFinite(exp2)) return exp2;

  return null;
}

function measureRightPriceScaleWidth(chartContainer) {
  try {
    if (!chartContainer) return null;

    const root = chartContainer.getBoundingClientRect();
    if (!root?.width || !root?.height) return null;

    const canvases = chartContainer.querySelectorAll("canvas");
    let best = null;

    canvases.forEach((cv) => {
      const r = cv.getBoundingClientRect();
      const w = r.width;
      const h = r.height;

      const rightDist = Math.abs(r.right - root.right);
      if (rightDist > 2) return;

      const hRatio = h / root.height;
      if (hRatio < 0.7) return;

      if (w < 50 || w > 260) return;

      if (best == null || w < best) best = w;
    });

    return best;
  } catch {
    return null;
  }
}

function formatPrice(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(5);
}

function extractPriceFromSeriesData(barLike) {
  if (!barLike) return null;
  const v = pickNumber(barLike.close, barLike.value, barLike.price, barLike.last, barLike.open);
  return Number.isFinite(v) ? v : null;
}

export default class TradeLinesManager {
  constructor(chart, series, overlayRoot) {
    this.chart = chart || null;
    this.series = series || null;
    this.overlayRoot = overlayRoot || null;

    this.lines = new Map();
    this.axisOverlay = this._ensureAxisOverlay();

    this._axisTimer = null;
    this._tickAxisWidth();

    // ✅ fontes da verdade
    this._livePrice = null;            // vem do MainChart via setLivePrice
    this._crosshairPrice = null;       // crosshair do lightweight-charts (se existir)
    this._domMousePrice = null;        // ✅ NOVO: preço pelo mouse (DOM crosshair real)

    this._THRESH_PX = 12;

    // ✅ subscribe crosshair (mantém, mas não depende só disso)
    this._onCrosshairMove = null;
    this._bindCrosshair();

    // ✅ NOVO: tracker de mouse no container do chart (garante 100%)
    this._mouse = {
      el: this.overlayRoot?.parentElement || null,
      rect: null,
      raf: 0,
      pending: false,
      lastClientY: null,
      onMove: null,
      onLeave: null,
    };
    this._bindDomMouseTracker();

    this._updateYieldForAll();
  }

  // -----------------------------
  // ✅ API pública (MainChart chama)
  // -----------------------------
  setLivePrice(price) {
    const p = Number(price);
    this._livePrice = Number.isFinite(p) ? p : null;
    this._updateYieldForAll();
  }

  // -----------------------------
  // ✅ Layer container
  // -----------------------------
  _ensureAxisOverlay() {
    if (!this.overlayRoot) return null;

    const existing = this.overlayRoot.querySelector?.('[data-trade-axis-overlay="true"]');
    if (existing) return existing;

    const el = document.createElement("div");
    el.setAttribute("data-trade-axis-overlay", "true");

    el.style.position = "absolute";
    el.style.top = "0";
    el.style.right = "0";
    el.style.bottom = "0";
    el.style.width = "110px";

    el.style.pointerEvents = "none";
    el.style.zIndex = "20";
    el.style.overflow = "visible";

    this.overlayRoot.appendChild(el);
    return el;
  }

  _tickAxisWidth() {
    if (!this.axisOverlay || !this.overlayRoot) return;

    const chartContainer = this.overlayRoot.parentElement;
    const w = measureRightPriceScaleWidth(chartContainer);
    if (Number.isFinite(w) && w > 0) {
      this.axisOverlay.style.width = `${Math.round(w)}px`;
    }
  }

  _ensureAxisTimer(shouldRun) {
    if (shouldRun) {
      if (this._axisTimer) return;
      this._axisTimer = setInterval(() => {
        this._tickAxisWidth();
      }, 500);
      return;
    }

    if (this._axisTimer) {
      clearInterval(this._axisTimer);
      this._axisTimer = null;
    }
  }

  // -----------------------------
  // ✅ Crosshair subscription (Lightweight Charts)
  // -----------------------------
  _bindCrosshair() {
    if (!this.chart || !this.series) return;
    if (this._onCrosshairMove) return;

    this._onCrosshairMove = (param) => {
      try {
        if (!param || param.point == null || param.time == null) {
          this._crosshairPrice = null;
          this._updateYieldForAll();
          return;
        }

        const sd = param.seriesData?.get?.(this.series);
        const p = extractPriceFromSeriesData(sd);
        this._crosshairPrice = Number.isFinite(p) ? p : null;

        this._updateYieldForAll();
      } catch {
        // silêncio
      }
    };

    try {
      this.chart.subscribeCrosshairMove(this._onCrosshairMove);
    } catch {}
  }

  _unbindCrosshair() {
    if (!this.chart || !this._onCrosshairMove) return;
    try {
      this.chart.unsubscribeCrosshairMove(this._onCrosshairMove);
    } catch {}
    this._onCrosshairMove = null;
  }

  // -----------------------------
  // ✅ NOVO: DOM mouse tracker (o seu crosshair real)
  // -----------------------------
  _bindDomMouseTracker() {
    const el = this._mouse.el;
    if (!el || this._mouse.onMove) return;

    const compute = () => {
      this._mouse.pending = false;
      if (!this.series) return;

      try {
        // cache de rect (barato)
        this._mouse.rect = el.getBoundingClientRect();
        const rect = this._mouse.rect;
        const cy = this._mouse.lastClientY;

        if (!rect || cy == null) return;

        const y = cy - rect.top;
        // y fora do container -> zera
        if (y < 0 || y > rect.height) {
          if (this._domMousePrice !== null) {
            this._domMousePrice = null;
            this._updateYieldForAll();
          }
          return;
        }

        // 🔒 fonte de verdade do “crosshair DOM”: converter Y -> preço
        const p = this.series.coordinateToPrice?.(y);
        const num = Number(p);

        const next = Number.isFinite(num) ? num : null;
        if (next !== this._domMousePrice) {
          this._domMousePrice = next;
          this._updateYieldForAll();
        }
      } catch {
        // silêncio
      }
    };

    const schedule = () => {
      if (this._mouse.pending) return;
      this._mouse.pending = true;
      this._mouse.raf = requestAnimationFrame(compute);
    };

    this._mouse.onMove = (e) => {
      this._mouse.lastClientY = e.clientY;
      schedule();
    };

    this._mouse.onLeave = () => {
      this._mouse.lastClientY = null;
      if (this._domMousePrice !== null) {
        this._domMousePrice = null;
        this._updateYieldForAll();
      }
    };

    el.addEventListener("mousemove", this._mouse.onMove, { passive: true });
    el.addEventListener("mouseleave", this._mouse.onLeave, { passive: true });
  }

  _unbindDomMouseTracker() {
    const el = this._mouse.el;
    if (!el) return;

    if (this._mouse.onMove) {
      try { el.removeEventListener("mousemove", this._mouse.onMove); } catch {}
      this._mouse.onMove = null;
    }
    if (this._mouse.onLeave) {
      try { el.removeEventListener("mouseleave", this._mouse.onLeave); } catch {}
      this._mouse.onLeave = null;
    }

    if (this._mouse.raf) {
      try { cancelAnimationFrame(this._mouse.raf); } catch {}
      this._mouse.raf = 0;
    }

    this._mouse.pending = false;
    this._mouse.lastClientY = null;
    this._domMousePrice = null;
  }

  // -----------------------------
  // ✅ Yield logic (somente axisPrice)
  // -----------------------------
  _shouldYieldForOpenPrice(openPrice) {
    const s = this.series;
    if (!s) return false;

    const openY = s.priceToCoordinate(Number(openPrice));
    if (openY == null || !Number.isFinite(openY)) return false;

    // 1) compara com eixo vivo
    if (Number.isFinite(this._livePrice)) {
      const liveY = s.priceToCoordinate(Number(this._livePrice));
      if (liveY != null && Number.isFinite(liveY)) {
        if (Math.abs(openY - liveY) <= this._THRESH_PX) return true;
      }
    }

    // 2) compara com crosshair do lightweight-charts (se existir)
    if (Number.isFinite(this._crosshairPrice)) {
      const chY = s.priceToCoordinate(Number(this._crosshairPrice));
      if (chY != null && Number.isFinite(chY)) {
        if (Math.abs(openY - chY) <= this._THRESH_PX) return true;
      }
    }

    // 3) ✅ compara com o preço do mouse (DOM crosshair real)
    if (Number.isFinite(this._domMousePrice)) {
      const myY = s.priceToCoordinate(Number(this._domMousePrice));
      if (myY != null && Number.isFinite(myY)) {
        if (Math.abs(openY - myY) <= this._THRESH_PX) return true;
      }
    }

    return false;
  }

  _updateYieldForAll() {
    this.lines.forEach((item) => {
      const axisEl = item?.axisPrice?.el;
      const openPrice = Number(item?.openPrice);
      if (!axisEl || !Number.isFinite(openPrice)) return;

      const yieldOn = this._shouldYieldForOpenPrice(openPrice);
      axisEl.style.opacity = yieldOn ? "0.10" : "1";
    });
  }

  // -----------------------------
  // ✅ Axis price label
  // -----------------------------
  _mountAxisPriceLabel({ id, price, colorStrong }) {
    if (!this.axisOverlay || !this.series) return null;

    const el = document.createElement("div");
    el.setAttribute("data-trade-axis-price", id);

    el.style.position = "absolute";
    el.style.left = "0px";
    el.style.right = "0px";
    el.style.top = "0px";
    el.style.transform = "translateY(-50%)";
    el.style.pointerEvents = "none";
    el.style.zIndex = "25";

    el.style.height = "18px";
    el.style.lineHeight = "16px";
    el.style.boxSizing = "border-box";

    const RIGHT_INSET = 8;
    el.style.width = `calc(100% - ${RIGHT_INSET}px)`;
    el.style.marginRight = `${RIGHT_INSET}px`;

    el.style.padding = "0 6px";
    el.style.borderRadius = "2px";

    el.style.fontFamily = "Inter, sans-serif";
    el.style.fontWeight = "700";
    el.style.fontSize = "11.5px";
    el.style.color = "#ffffff";

    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.textAlign = "center";

    el.style.background = colorStrong;
    el.style.border = `1px solid ${colorStrong}`;
    el.style.boxShadow = "0 2px 4px rgba(0,0,0,0.45)";

    el.style.opacity = "1";
    el.style.transition = "opacity 120ms ease";

    el.textContent = formatPrice(price);

    this.axisOverlay.appendChild(el);

    let raf = 0;
    let destroyed = false;

    const loop = () => {
      if (destroyed) return;
      raf = requestAnimationFrame(loop);

      const y = this.series.priceToCoordinate(Number(price));
      if (y !== null && Number.isFinite(y)) {
        el.style.top = `${y}px`;
        el.style.display = "flex";
      } else {
        el.style.display = "none";
      }
    };

    raf = requestAnimationFrame(loop);

    return {
      el,
      destroy: () => {
        destroyed = true;
        try { if (raf) cancelAnimationFrame(raf); } catch {}
        raf = 0;
        try { el.remove(); } catch {}
      },
    };
  }

  // -----------------------------
  // ✅ Public: syncTrades
  // -----------------------------
  syncTrades(activeTrades) {
    const list = Array.isArray(activeTrades) ? activeTrades : [];

    this._ensureAxisTimer(list.length > 0);
    this._tickAxisWidth();

    const activeIds = new Set(list.map((t) => String(t?.id ?? t?.tradeId ?? "")).filter(Boolean));

    list.forEach((raw) => {
      const id = String(raw?.id ?? raw?.tradeId ?? "");
      if (!id) return;
      if (this.lines.has(id)) return;

      const openPrice = pickNumber(raw?.openPrice, raw?.entryPrice, raw?.price, raw?.open, raw?.rate);
      if (!Number.isFinite(openPrice)) return;

      const direction = normalizeDirection(raw?.direction ?? raw?.side ?? raw?.type);
      const amount = pickNumber(raw?.amount, raw?.stake, raw?.value) ?? 0;
      const expiresAt = normalizeExpiresAt(raw);

      const safeTrade = {
        ...raw,
        id,
        openPrice,
        direction,
        amount,
        expiresAt: Number.isFinite(expiresAt) ? expiresAt : undefined,
      };

      const lineColor =
        safeTrade.direction === "CALL" ? "rgba(0, 193, 118, 0.55)" : "rgba(255, 77, 79, 0.55)";

      const labelColorStrong =
        safeTrade.direction === "CALL" ? "rgba(0, 193, 118, 1)" : "rgba(255, 77, 79, 1)";

      const priceLine = this.series.createPriceLine({
        price: safeTrade.openPrice,
        color: lineColor,
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: false,
        title: "",
      });

      TradeLineOverlay.mount({
        trade: safeTrade,
        container: this.axisOverlay || this.overlayRoot,
        series: this.series,
      });

      const axisPrice = this._mountAxisPriceLabel({
        id,
        price: safeTrade.openPrice,
        colorStrong: labelColorStrong,
      });

      this.lines.set(id, { priceLine, axisPrice, openPrice: safeTrade.openPrice });

      this._updateYieldForAll();
    });

    [...this.lines.keys()].forEach((id) => {
      if (!activeIds.has(id)) {
        const item = this.lines.get(id);

        try { this.series.removePriceLine(item.priceLine); } catch {}
        try { item.axisPrice?.destroy?.(); } catch {}

        TradeLineOverlay.unmount(id);
        this.lines.delete(id);
      }
    });

    this._ensureAxisTimer(this.lines.size > 0);
    this._updateYieldForAll();
  }

  destroy() {
    this._ensureAxisTimer(false);

    this.lines.forEach((item, id) => {
      try { item.axisPrice?.destroy?.(); } catch {}
      TradeLineOverlay.unmount(id);
    });
    this.lines.clear();

    this._unbindCrosshair();
    this._unbindDomMouseTracker();

    try { this.axisOverlay?.remove?.(); } catch {}
    this.axisOverlay = null;
  }
}
