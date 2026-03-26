import { useMarketStore } from "@/stores/market.store";

export default class MarketWSClient {
  constructor({ url, onMarketEvent }) {
    this.url = url;
    this.onMarketEvent = onMarketEvent;
    this.ws = null;

    this.pendingSubscriptions = new Set();
    this._forceSeedTimers = {};
    this._historyResyncTimers = {};
    this._pairSessionId = {};
    this._subSeq = {};
    this._subSeqCounter = 0;
    this._bootReadyByKey = {};
    this._reaffirmAt = {};
    this._dbg = { lastHistoryAt: 0, lastLiveAt: 0 };
    this.currentExclusiveKey = "";

    // ✅ TIME SYNC
    this._timePingId = 0;
    this._timePending = new Map(); // id -> t0(Date.now)
    this._timeTimer = null;
    this._timeKickTimer = null;

    // ✅ guarda últimas amostras e escolhe menor RTT (mais confiável)
    this._timeSamples = []; // { serverNowAtReceiveMs, perfNowMs, rttMs, at }

    console.log("🧠 [MarketWS] Instanciado e pronto para monitoramento.");
  }

  _normalizeTimeframe(raw) {
    if (!raw) return null;

    const s = String(raw).trim().toUpperCase();
    if (s === "M1" || s === "M5" || s === "M15" || s === "M30" || s === "H1") return s;

    if (s === "1M" || s === "1MIN" || s === "1MINUTE" || s === "1") return "M1";
    if (s === "5M" || s === "5MIN" || s === "5MINUTE" || s === "5") return "M5";
    if (s === "15M" || s === "15MIN" || s === "15MINUTE" || s === "15") return "M15";
    if (s === "30M" || s === "30MIN" || s === "30MINUTE" || s === "30") return "M30";
    if (s === "1H" || s === "H1" || s === "60M" || s === "60" || s === "60MIN") return "H1";

    return null;
  }

  _makeKey(symbol, timeframe) {
    const s = String(symbol || "").toUpperCase().trim();
    const tf = String(timeframe || "M1").toUpperCase().trim() || "M1";
    if (!s) return "";
    return `${s}|${tf}`;
  }

  _splitKey(key) {
    const k = String(key || "");
    const parts = k.split("|");
    const symbol = String(parts[0] || "").toUpperCase().trim();
    const tf = String(parts[1] || "M1").toUpperCase().trim() || "M1";
    return { symbol, timeframe: tf };
  }

  _getActiveTFsForSymbol(symbol) {
    const s = String(symbol || "").toUpperCase().trim();
    if (!s) return [];

    const list = [];
    for (const key of this.pendingSubscriptions) {
      const { symbol: sym, timeframe } = this._splitKey(key);
      if (sym !== s) continue;
      const seq = Number(this._subSeq[key] || 0);
      list.push({ timeframe: timeframe || "M1", seq });
    }

    list.sort((a, b) => Number(b.seq) - Number(a.seq));

    const seen = new Set();
    const out = [];
    for (const x of list) {
      const tf = String(x.timeframe || "M1").toUpperCase().trim() || "M1";
      if (seen.has(tf)) continue;
      seen.add(tf);
      out.push(tf);
    }
    return out;
  }

  _inferTimeframeForSymbol(symbol) {
    const s = String(symbol || "").toUpperCase().trim();
    if (!s) return "M1";

    let bestTf = "M1";
    let bestSeq = -1;

    for (const key of this.pendingSubscriptions) {
      const { symbol: sym, timeframe } = this._splitKey(key);
      if (sym !== s) continue;

      const seq = Number(this._subSeq[key] || 0);
      if (seq > bestSeq) {
        bestSeq = seq;
        bestTf = timeframe || "M1";
      }
    }

    return bestTf || "M1";
  }

  _send(obj) {
    if (!obj) return false;

    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(obj));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  // ============================
  // ✅ TIME SYNC
  // ============================
  _perfNow() {
    try {
      const p = performance?.now?.();
      return Number.isFinite(p) ? p : 0;
    } catch {
      return 0;
    }
  }

  _timeSendPing() {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    const id = ++this._timePingId;
    const t0 = Date.now();
    this._timePending.set(id, t0);

    this._send({ type: "time_ping", id, t0 });
  }

  _timeOnPong(msg) {
    const id = msg?.id;
    const serverMs = Number(msg?.serverMs);
    const t1 = Date.now();

    if (!Number.isFinite(serverMs)) return;

    const t0 = this._timePending.get(id);
    this._timePending.delete(id);
    if (!Number.isFinite(t0)) return;

    const rtt = t1 - t0;
    if (!Number.isFinite(rtt) || rtt <= 0 || rtt > 8000) return;

    // server "agora" no recebimento (assumindo latência simétrica)
    const serverNowAtReceiveMs = serverMs + rtt / 2;
    const perfNowMs = this._perfNow();

    const sample = { serverNowAtReceiveMs, perfNowMs, rttMs: rtt, at: t1 };
    this._timeSamples.push(sample);
    if (this._timeSamples.length > 10) this._timeSamples.shift();

    // escolhe a amostra de menor RTT (mais confiável)
    let best = null;
    for (const s of this._timeSamples) {
      if (!best || s.rttMs < best.rttMs) best = s;
    }
    if (!best) return;

    // aplica via store (âncora + smoothing lá)
    const st = useMarketStore.getState();
    st.applyTimeSample?.(best);
  }

  _timeStart() {
    this._timeStop();

    // kick rápido no connect (estabiliza pós-F5)
    let n = 0;
    this._timeKickTimer = setInterval(() => {
      n += 1;
      this._timeSendPing();
      if (n >= 10) {
        try { clearInterval(this._timeKickTimer); } catch {}
        this._timeKickTimer = null;
      }
    }, 120);

    // resync contínuo
    this._timeTimer = setInterval(() => {
      this._timeSendPing();
    }, 2500);
  }

  _timeStop() {
    if (this._timeTimer) {
      try { clearInterval(this._timeTimer); } catch {}
      this._timeTimer = null;
    }
    if (this._timeKickTimer) {
      try { clearInterval(this._timeKickTimer); } catch {}
      this._timeKickTimer = null;
    }
    this._timePending.clear();
    this._timeSamples = [];
  }

  connect() {
    if (this.ws) return;

    console.log("🌐 [MarketWS] Conectando ao servidor de liquidez:", this.url);
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("✅ [MarketWS] Conexão estabelecida com sucesso!");
      this._timeStart();

      if (this.pendingSubscriptions.size > 0) {
        for (const key of this.pendingSubscriptions) {
          const { symbol, timeframe } = this._splitKey(key);
          this._send({ type: "activate", symbol, timeframe, resnapshot: true });
        }
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg?.type === "time_pong") {
          this._timeOnPong(msg);
          return;
        }

        const symbol = (msg.symbol || (msg.payload && msg.payload.symbol) || msg.pair || "")
          .toUpperCase()
          .trim();

        const tfFromMsg =
          this._normalizeTimeframe(msg.timeframe) ||
          this._normalizeTimeframe(msg.tf) ||
          this._normalizeTimeframe(msg.resolution) ||
          this._normalizeTimeframe(msg?.payload?.timeframe) ||
          this._normalizeTimeframe(msg?.payload?.tf) ||
          this._normalizeTimeframe(msg?.payload?.resolution) ||
          null;

        const currentExclusiveKey = String(this.currentExclusiveKey || "");
        const currentExclusive = currentExclusiveKey ? this._splitKey(currentExclusiveKey) : null;

        if (msg.type === "market_snapshot") {
          if (!symbol) return;

          const payload = msg?.payload || msg;
          const tf =
            tfFromMsg ||
            this._normalizeTimeframe(payload?.timeframe) ||
            this._normalizeTimeframe(payload?.tf) ||
            this._inferTimeframeForSymbol(symbol);

          this.onMarketEvent?.({
            type: "market_snapshot",
            pair: symbol,
            timeframe: tf || "M1",
            data: payload,
          });
          return;
        }

        if (msg.type === "history_stream_start") {
          if (!symbol) return;
          const tf = tfFromMsg || this._inferTimeframeForSymbol(symbol);

          this.onMarketEvent?.({
            type: "history_stream_start",
            pair: symbol,
            timeframe: tf,
            data: msg.payload || msg,
          });

          return;
        }

        if (msg.type === "history" || msg.type === "history_stream") {
          if (!symbol) return;

          let candles = msg?.payload?.candles ?? msg?.payload;

          if (Array.isArray(candles)) {
          } else if (candles && Array.isArray(candles.candles)) {
            candles = candles.candles;
          } else if (candles && typeof candles === "object") {
            candles = [candles];
          } else {
            candles = [];
          }

          if (!candles.length) return;

          let tfs = tfFromMsg ? [tfFromMsg] : this._getActiveTFsForSymbol(symbol);

          if (!tfs.length) {
            const tfFallback = this._inferTimeframeForSymbol(symbol);
            this.onMarketEvent?.({
              type: "history_stream",
              pair: symbol,
              timeframe: tfFallback,
              data: candles,
            });
            return;
          }

          for (const tf of tfs) {
            this.onMarketEvent?.({
              type: "history_stream",
              pair: symbol,
              timeframe: tf,
              data: candles,
            });
          }

          const now = Date.now();
          if (now - this._dbg.lastHistoryAt > 2000) {
            this._dbg.lastHistoryAt = now;
            console.log(`[WS_IN] history_stream ${symbol} tfs=[${tfs.join(",")}] +${candles.length}`);
          }
          return;
        }

        if (msg.type === "history_prepend") {
          if (!symbol) return;

          const payload = msg?.payload || {};
          let candles = payload?.candles;

          if (Array.isArray(candles)) {
          } else if (candles && Array.isArray(candles.candles)) {
            candles = candles.candles;
          } else if (candles && typeof candles === "object") {
            candles = [candles];
          } else {
            candles = [];
          }

          const tf =
            tfFromMsg ||
            this._normalizeTimeframe(payload?.timeframe) ||
            this._normalizeTimeframe(payload?.tf) ||
            this._inferTimeframeForSymbol(symbol);

          console.log(`[WS_IN] history_prepend ${symbol} (${tf || "M1"}) +${candles.length}`);

          this.onMarketEvent?.({
            type: "history_prepend",
            pair: symbol,
            timeframe: tf || "M1",
            data: {
              ...payload,
              candles,
            },
          });
          return;
        }

        if (msg.type === "tick") {
          if (!symbol) return;

          const payload = msg.payload || msg;
          let tfs = tfFromMsg ? [tfFromMsg] : this._getActiveTFsForSymbol(symbol);

          if (!tfs.length) {
            const tfFallback = this._inferTimeframeForSymbol(symbol);
            this.onMarketEvent?.({ type: "tick", pair: symbol, timeframe: tfFallback, data: payload });
            return;
          }

          for (const tf of tfs) {
            this.onMarketEvent?.({ type: "tick", pair: symbol, timeframe: tf, data: payload });
          }
          return;
        }

        if (msg.type === "candle_update") {
          if (!symbol) return;

          const payload = msg.payload;
          let tfs = tfFromMsg ? [tfFromMsg] : this._getActiveTFsForSymbol(symbol);

          if (!tfs.length) {
            const tfFallback = this._inferTimeframeForSymbol(symbol);
            this.onMarketEvent?.({ type: "candle_update", pair: symbol, timeframe: tfFallback, data: payload });
            return;
          }

          for (const tf of tfs) {
            this.onMarketEvent?.({ type: "candle_update", pair: symbol, timeframe: tf, data: payload });
          }

          const now = Date.now();
          if (now - this._dbg.lastLiveAt > 2000) {
            this._dbg.lastLiveAt = now;
            console.log(`[WS_IN] candle_update ${symbol} tfs=[${tfs.join(",")}]`);
          }
          return;
        }

        if (msg.type === "candle_close") {
          if (!symbol) return;

          const payload = msg.payload;
          let tfs = tfFromMsg ? [tfFromMsg] : this._getActiveTFsForSymbol(symbol);

          if (!tfs.length) {
            const tfFallback = this._inferTimeframeForSymbol(symbol);
            this.onMarketEvent?.({ type: "candle_close", pair: symbol, timeframe: tfFallback, data: payload });
            return;
          }

          for (const tf of tfs) {
            this.onMarketEvent?.({ type: "candle_close", pair: symbol, timeframe: tf, data: payload });
          }
          return;
        }
      } catch (e) {
        console.error("❌ [MarketWS] Erro crítico ao processar JSON:", e);
      }
    };

    this.ws.onclose = () => {
      console.warn("🔌 [MarketWS] Conexão fechada. Reconectando em 3s...");
      this.ws = null;
      this._timeStop();

      for (const k of Object.keys(this._forceSeedTimers)) {
        try { clearTimeout(this._forceSeedTimers[k]); } catch {}
        delete this._forceSeedTimers[k];
      }
      for (const k of Object.keys(this._historyResyncTimers)) {
        try { clearTimeout(this._historyResyncTimers[k]); } catch {}
        delete this._historyResyncTimers[k];
      }

      setTimeout(() => this.connect(), 3000);
    };
  }

  _forceLiveSeed(symbol, timeframe) {
    const key = this._makeKey(symbol, timeframe);
    if (!key) return;

    const { symbol: s, timeframe: tf } = this._splitKey(key);

    if (this._forceSeedTimers[key]) {
      try { clearTimeout(this._forceSeedTimers[key]); } catch {}
      delete this._forceSeedTimers[key];
    }

    this._send({ type: "request_live_seed", symbol: s, timeframe: tf });

    this._forceSeedTimers[key] = setTimeout(() => {
      this._send({ type: "request_live_seed", symbol: s, timeframe: tf });
      delete this._forceSeedTimers[key];
    }, 120);
  }

  _requestHistoryResync(symbol, timeframe) {}

  _clearTimersForKey(key) {
    if (!key) return;

    if (this._forceSeedTimers[key]) {
      try { clearTimeout(this._forceSeedTimers[key]); } catch {}
      delete this._forceSeedTimers[key];
    }

    if (this._historyResyncTimers[key]) {
      try { clearTimeout(this._historyResyncTimers[key]); } catch {}
      delete this._historyResyncTimers[key];
    }
  }

  _syncExclusiveState(nextKey) {
    const keep = String(nextKey || "");
    this.currentExclusiveKey = keep;
  }

  replaceSubscription(symbol, timeframe = "M1", options = undefined) {
    const s = (symbol || "").toUpperCase().trim();
    const tf = String(timeframe || "M1").toUpperCase().trim() || "M1";
    const key = this._makeKey(s, tf);
    if (!key) return;

    this._syncExclusiveState(key);
    this.subscribe(s, tf, options);
  }

  reaffirm(symbol, timeframe = "M1", options = undefined) {
    const s = (symbol || "").toUpperCase().trim();
    const tf = String(timeframe || "M1").toUpperCase().trim() || "M1";
    const key = this._makeKey(s, tf);
    if (!key) return;

    this._syncExclusiveState(key);
    this.pendingSubscriptions.add(key);

    const now = Date.now();
    const last = Number(this._reaffirmAt[key] || 0);
    if (now - last < 350) return;
    this._reaffirmAt[key] = now;

    const opts = options && typeof options === "object" ? options : {};
    const resnapshot = !!opts.resnapshot;
    const requestLiveSeed = !!opts.requestLiveSeed;

    if (this.ws?.readyState === WebSocket.OPEN) {
      this._send({ type: "activate", symbol: s, timeframe: tf, resnapshot });
      if (requestLiveSeed) this._forceLiveSeed(s, tf);
    }
  }

  isSubscribed(symbol, timeframe = "M1") {
    const s = (symbol || "").toUpperCase().trim();
    const tf = String(timeframe || "M1").toUpperCase().trim() || "M1";
    const key = this._makeKey(s, tf);
    if (!key) return false;
    return this.pendingSubscriptions.has(key);
  }

  subscribe(symbol, timeframe = "M1", options = undefined) {
    const s = (symbol || "").toUpperCase().trim();
    const tf = String(timeframe || "M1").toUpperCase().trim() || "M1";
    const key = this._makeKey(s, tf);
    if (!key) return;

    this._syncExclusiveState(key);

    this._pairSessionId[key] = Number(this._pairSessionId[key] || 0) + 1;

    this._subSeqCounter += 1;
    this._subSeq[key] = this._subSeqCounter;

    this.pendingSubscriptions.add(key);

    const opts = options && typeof options === "object" ? options : {};
    const resnapshot = !!opts.resnapshot;
    const requestLiveSeed = !!opts.requestLiveSeed;

    if (this.ws?.readyState === WebSocket.OPEN) {
      this._send({ type: "activate", symbol: s, timeframe: tf, resnapshot });
      if (requestLiveSeed) this._forceLiveSeed(s, tf);
    }
  }

  unsubscribe(symbol, timeframe = "M1") {
    const s = (symbol || "").toUpperCase().trim();
    const tf = String(timeframe || "M1").toUpperCase().trim() || "M1";
    const key = this._makeKey(s, tf);
    if (!key) return;

    this._pairSessionId[key] = Number(this._pairSessionId[key] || 0) + 1;

    this.pendingSubscriptions.delete(key);
    delete this._subSeq[key];
    if (this.currentExclusiveKey === key) this.currentExclusiveKey = "";

    if (this._forceSeedTimers[key]) {
      try { clearTimeout(this._forceSeedTimers[key]); } catch {}
      delete this._forceSeedTimers[key];
    }
    if (this._historyResyncTimers[key]) {
      try { clearTimeout(this._historyResyncTimers[key]); } catch {}
      delete this._historyResyncTimers[key];
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this._send({ type: "deactivate", symbol: s, timeframe: tf });
    }
  }

  loadMoreHistory(symbol, timeframe = "M1", fromTime = 0, limit = 500) {
    const s = (symbol || "").toUpperCase().trim();
    const tf = String(timeframe || "M1").toUpperCase().trim() || "M1";
    const key = this._makeKey(s, tf);
    if (!key) return;

    const payload = {
      symbol: s,
      timeframe: tf,
      fromTime: Number(fromTime) || 0,
      limit: Math.max(1, Number(limit) || 500),
    };

    if (this.ws?.readyState === WebSocket.OPEN) {
      const ok = this._send({ type: "load_more_history", ...payload });
      if (!ok) this._send({ type: "request_more_history", ...payload });
      console.log(`📚 [MARKET] loadMoreHistory enviado: ${s} (${tf}) fromTime=${payload.fromTime} limit=${payload.limit}`);
    }
  }
}
