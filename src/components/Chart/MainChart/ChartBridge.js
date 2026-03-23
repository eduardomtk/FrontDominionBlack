// src/components/chart/ChartBridge.js

export default class ChartBridge {
  constructor({ series, chart }) {
    this.series = series;
    this.chart = chart;

    this.initialized = false;
    this._processing = false;

    this._lastSetDataTime = null;
    this._lastSeriesTime = null;
    this._lastDataSig = "";

    this._didInitialViewportPreset = false;

    // ✅ NOVO: controla scroll inicial para não "reancorar" ao criar panes
    this._didInitialScrollToRealTime = false;
    this._userHasMovedViewport = false;

    this.VIEWPORT_PRESET = {
      RIGHT_OFFSET: 15,
      BAR_SPACING: 10.5,
    };

    // ✅ ADIÇÃO: modo (candles | heikin)
    this.renderMode = "candles";

    // ✅ NOVO: detecta interação do usuário (se ele mexer, nunca mais forçamos scroll)
    try {
      const ts = this.chart?.timeScale?.();
      if (ts && typeof ts.subscribeVisibleTimeRangeChange === "function") {
        this._onUserRangeChange = () => {
          // Se já rolou o scroll inicial, e depois mudou de novo, assumimos que foi interação/layout.
          // Marcamos como "mexido" para não voltar a ancorar.
          if (this._didInitialScrollToRealTime) this._userHasMovedViewport = true;
        };
        ts.subscribeVisibleTimeRangeChange(this._onUserRangeChange);
      }
    } catch {}
  }

  setRenderMode(mode) {
    const m = String(mode || "candles").toLowerCase();
    const next = m === "heikin" ? "heikin" : "candles";
    if (next === this.renderMode) return;

    this.renderMode = next;

    // reset seguro
    this.initialized = false;
    this._lastSetDataTime = null;
    this._lastSeriesTime = null;
    this._lastDataSig = "";
    this._didInitialViewportPreset = false;

    // ✅ mantém flags de usuário/scroll (não queremos reancorar ao trocar modo)
    // this._didInitialScrollToRealTime  -> mantém
    // this._userHasMovedViewport        -> mantém

    try {
      this.series?.setData([]);
    } catch {}
  }

  _isValidCandle(c) {
    if (!c) return false;
    const time = Number(c.time);
    const open = Number(c.open);
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);

    return (
      Number.isFinite(time) &&
      Number.isFinite(open) &&
      Number.isFinite(high) &&
      Number.isFinite(low) &&
      Number.isFinite(close)
    );
  }

  _sanitizeCandles(candles) {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const normalized = candles
      .filter(Boolean)
      .map((c) => ({
        time: Number(c.time),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      }))
      .filter((c) => this._isValidCandle(c));

    normalized.sort((a, b) => a.time - b.time);

    const deduped = [];
    for (let i = 0; i < normalized.length; i++) {
      const cur = normalized[i];
      const prev = deduped[deduped.length - 1];

      if (!prev) {
        deduped.push(cur);
        continue;
      }

      if (cur.time === prev.time) deduped[deduped.length - 1] = cur;
      else deduped.push(cur);
    }

    return deduped;
  }

  _applyInitialViewportPresetOnce() {
    if (this._didInitialViewportPreset || !this.chart) return;

    const { RIGHT_OFFSET, BAR_SPACING } = this.VIEWPORT_PRESET;

    try {
      this.chart.timeScale().applyOptions({
        rightOffset: RIGHT_OFFSET,
        barSpacing: BAR_SPACING,
      });
    } catch {}

    // ✅ IMPORTANTE: NÃO chamar scrollToRealTime aqui.
    // Scroll é comportamento e em multi-pane isso pode reancorar e "criar" o vão visual.
    this._didInitialViewportPreset = true;
  }

  _scrollToRealTimeOnceSafe() {
    if (!this.chart) return;
    if (this._didInitialScrollToRealTime) return;
    if (this._userHasMovedViewport) return;

    this._didInitialScrollToRealTime = true;

    // ✅ defer: evita race com resize/creation de panes
    try {
      setTimeout(() => {
        try {
          if (this._userHasMovedViewport) return;
          this.chart?.timeScale?.()?.scrollToRealTime?.();
        } catch {}
      }, 0);
    } catch {}
  }

  _makeDataSig(cleanCandles) {
    if (!Array.isArray(cleanCandles) || cleanCandles.length === 0) return "";
    const first = cleanCandles[0];
    const last = cleanCandles[cleanCandles.length - 1];
    const ft = Number(first?.time);
    const lt = Number(last?.time);
    if (!Number.isFinite(ft) || !Number.isFinite(lt)) return "";
    return `${cleanCandles.length}:${ft}:${lt}`;
  }

  _setDataSafe(cleanCandles) {
    if (!cleanCandles || cleanCandles.length === 0) return false;

    const lastClosed = cleanCandles[cleanCandles.length - 1];
    const nextSig = this._makeDataSig(cleanCandles);

    // ✅ FIX CRÍTICO:
    // _lastSeriesTime pode estar apontando para o candle LIVE atual (bucket aberto),
    // que normalmente é 1 bucket à frente do último candle FECHADO.
    // Em um history_prepend legítimo, o último fechado continua igual, mas o início
    // do array vai para trás. Se compararmos contra _lastSeriesTime, bloqueamos
    // exatamente esse setData e o gráfico fica com "espaços vazios": o store cresce,
    // a viewport passa a enxergar mais barras lógicas, mas a série continua desenhada
    // só com a janela antiga.
    //
    // O bloqueio correto para snapshots fechados é comparar apenas contra o último
    // fechado já aplicado por setData (_lastSetDataTime), nunca contra o live.
    if (this._lastSetDataTime != null && Number(lastClosed.time) < Number(this._lastSetDataTime)) {
      return false;
    }

    this.series.setData(cleanCandles);
    this._lastSetDataTime = lastClosed.time;
    this._lastSeriesTime = Math.max(Number(this._lastSeriesTime ?? 0), Number(lastClosed.time));
    this._lastDataSig = nextSig;
    return true;
  }

  _updateLiveSafe(liveCandle) {
    if (!this._isValidCandle(liveCandle)) return false;

    const t = Number(liveCandle.time);

    if (this._lastSeriesTime != null && t < Number(this._lastSeriesTime)) {
      return false;
    }

    this.series.update(liveCandle);

    if (this._lastSeriesTime == null || t > Number(this._lastSeriesTime)) {
      this._lastSeriesTime = t;
    }
    return true;
  }

  // ===== Heikin helpers =====
  _toHeikinClosed(cleanClosed) {
    const ha = [];
    for (let i = 0; i < cleanClosed.length; i++) {
      const c = cleanClosed[i];
      const prev = ha[i - 1];

      const haClose = (c.open + c.high + c.low + c.close) / 4;
      const haOpen = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
      const haHigh = Math.max(c.high, haOpen, haClose);
      const haLow = Math.min(c.low, haOpen, haClose);

      ha.push({ time: c.time, open: haOpen, high: haHigh, low: haLow, close: haClose });
    }
    return ha;
  }

  _toHeikinLive(prevHa, liveRaw) {
    if (!this._isValidCandle(liveRaw)) return null;

    const haClose = (liveRaw.open + liveRaw.high + liveRaw.low + liveRaw.close) / 4;
    const haOpen = prevHa ? (Number(prevHa.open) + Number(prevHa.close)) / 2 : (liveRaw.open + liveRaw.close) / 2;
    const haHigh = Math.max(liveRaw.high, haOpen, haClose);
    const haLow = Math.min(liveRaw.low, haOpen, haClose);

    return { time: Number(liveRaw.time), open: haOpen, high: haHigh, low: haLow, close: haClose };
  }

  update(candles, liveCandle) {
    if (this._processing || !this.series || !this.chart) return;
    this._processing = true;

    try {
      const cleanClosed = this._sanitizeCandles(candles);
      if (!cleanClosed.length) return;

      const lastClosed = cleanClosed[cleanClosed.length - 1];

      // ✅ candles normal
      if (this.renderMode === "candles") {
        if (!this.initialized) {
          const ok = this._setDataSafe(cleanClosed);
          if (!ok) return;

          this.initialized = true;
          this._applyInitialViewportPresetOnce();
          this._scrollToRealTimeOnceSafe();

          if (liveCandle) this._updateLiveSafe(liveCandle);
          return;
        }

        const nextSig = this._makeDataSig(cleanClosed);
        if (this._lastSetDataTime !== lastClosed.time || this._lastDataSig !== nextSig) {
          this._setDataSafe(cleanClosed);
        }

        if (liveCandle) this._updateLiveSafe(liveCandle);
        return;
      }

      // ✅ heikin
      const haClosed = this._toHeikinClosed(cleanClosed);
      const haLast = haClosed[haClosed.length - 1];

      if (!this.initialized) {
        const ok = this._setDataSafe(haClosed);
        if (!ok) return;

        this.initialized = true;
        this._applyInitialViewportPresetOnce();
        this._scrollToRealTimeOnceSafe();

        if (liveCandle) {
          const haLive = this._toHeikinLive(haLast, liveCandle);
          if (haLive) this._updateLiveSafe(haLive);
        }
        return;
      }

      const nextSig = this._makeDataSig(haClosed);
      if (this._lastSetDataTime !== lastClosed.time || this._lastDataSig !== nextSig) {
        this._setDataSafe(haClosed);
      }

      if (liveCandle) {
        const haLive = this._toHeikinLive(haLast, liveCandle);
        if (haLive) this._updateLiveSafe(haLive);
      }
    } catch (error) {
      console.error("❌ Erro no Bridge:", error);
    } finally {
      this._processing = false;
    }
  }

  clear() {
    try {
      this.series.setData([]);
    } catch {}

    this.initialized = false;
    this._lastSetDataTime = null;
    this._lastSeriesTime = null;
    this._lastDataSig = "";
    this._didInitialViewportPreset = false;

    // ✅ não resetar scroll/user flags aqui
    // para não reancorar ao adicionar/remover panes
  }

  disconnect() {
    this.initialized = false;
    this._lastSetDataTime = null;
    this._lastSeriesTime = null;
    this._lastDataSig = "";
    this._didInitialViewportPreset = false;
  }
}
