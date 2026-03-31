import MarketWSClient from "./MarketWSClient";

export default class MarketWSManager {
  constructor({ url, onMarketEvent }) {
    if (!url) throw new Error("MarketWSManager: url é obrigatório");
    this.onMarketDataCallback = onMarketEvent || null;
    this.activeKeys = new Set();
    this.pinnedKeys = new Set();
    this.currentKey = "";
    this.url = url;
    this.lastForceAtByKey = new Map();

    this.client = new MarketWSClient({
      url: this.url,
      onMarketEvent: (event) => this._handleInternalEvent(event),
    });

    console.log("🧩 [MarketWSManager] instanciado com URL:", url);
  }

  setCallback(fn) {
    this.onMarketDataCallback = fn;
    console.log("🔗 [MarketWSManager] Bridge com Store configurada com sucesso.");
  }

  _normalizeTimeframe(raw) {
    if (!raw) return null;
    const s = String(raw).trim().toUpperCase();
    if (["M1", "M5", "M15", "M30", "H1"].includes(s)) return s;
    if (["1M", "1MIN", "1MINUTE", "1"].includes(s)) return "M1";
    if (["5M", "5MIN", "5MINUTE", "5"].includes(s)) return "M5";
    if (["15M", "15MIN", "15MINUTE", "15"].includes(s)) return "M15";
    if (["30M", "30MIN", "30MINUTE", "30"].includes(s)) return "M30";
    if (["1H", "60M", "60", "60MIN"].includes(s)) return "H1";
    return null;
  }

  _makeKey(pair, timeframe) {
    const symbol = String(pair || "").toUpperCase().trim();
    const tf = String(timeframe || "M1").toUpperCase().trim() || "M1";
    return symbol ? `${symbol}|${tf}` : "";
  }

  _normalizeEvent(event) {
    if (!event || typeof event !== "object") return null;
    const pair = String(event.pair || "").toUpperCase().trim();
    const type = String(event.type || "").trim();
    if (!pair || !type) return null;
    const tf =
      this._normalizeTimeframe(event.timeframe) ||
      this._normalizeTimeframe(event.tf) ||
      this._normalizeTimeframe(event.resolution) ||
      this._normalizeTimeframe(event?.data?.timeframe) ||
      this._normalizeTimeframe(event?.data?.tf) ||
      this._normalizeTimeframe(event?.data?.resolution) ||
      null;
    return { pair, type, timeframe: tf, data: event.data };
  }

  _emit(pair, type, timeframe, data) {
    if (!this.onMarketDataCallback) return;
    this.onMarketDataCallback({ pair, type, timeframe, data });
  }

  _handleInternalEvent(event) {
    const normalized = this._normalizeEvent(event);
    if (!normalized) return;
    const { pair, type, timeframe, data } = normalized;
    const tf = timeframe || "M1";
    const key = this._makeKey(pair, tf);
    if (!key || !this.activeKeys.has(key)) return;
    this._emit(pair, type, tf, data);
  }

  connect() {
    console.log("🔌 [MarketWSManager] conectando WS...");
    this.client.connect();
  }

  disconnect() {
    console.log("🧨 [MarketWSManager] desconectando WS...");
    try { this.client.ws?.close(); } catch {}
    this.activeKeys.clear();
    this.pinnedKeys.clear();
    this.currentKey = "";
    this.lastForceAtByKey.clear();
  }

  openPair(pair, timeframe = "M1", options = undefined) {
    if (!pair) return;
    const symbol = String(pair).toUpperCase().trim();
    const tf = String(timeframe || "M1").toUpperCase().trim() || "M1";
    const key = this._makeKey(symbol, tf);
    if (!key) return;

    const opts = options && typeof options === "object" ? options : {};
    const forceResync = !!opts.forceResync;
    const prevKey = this.currentKey;

    if (!this.client.ws || this.client.ws.readyState !== WebSocket.OPEN) this.client.connect();

    const wasActive = this.activeKeys.has(key);
    this.currentKey = key;
    this.activeKeys.add(key);

    const now = Date.now();
    const last = Number(this.lastForceAtByKey.get(key) || 0);
    const isSubscribed = !!this.client.isSubscribed?.(symbol, tf);

    if (!isSubscribed) {
      this.lastForceAtByKey.set(key, now);
      try { this.client.subscribe(symbol, tf, { resnapshot: true, requestLiveSeed: false }); } catch {}
    } else if ((forceResync || wasActive) && now - last >= 600) {
      this.lastForceAtByKey.set(key, now);
      try { this.client.reaffirm(symbol, tf, { resnapshot: true, requestLiveSeed: false }); } catch {}
    }

    if (prevKey && prevKey !== key && !this.pinnedKeys.has(prevKey)) {
      const [prevPair, prevTf] = prevKey.split("|");
      try { this.client.unsubscribe(prevPair, prevTf || "M1"); } catch {}
      this.activeKeys.delete(prevKey);
      this.lastForceAtByKey.delete(prevKey);
    }

    console.log("📡 [MarketWSManager] par focado:", symbol, tf, prevKey ? `prev=${prevKey}` : "", this.pinnedKeys.size ? `pins=${this.pinnedKeys.size}` : "");
  }

  pinPair(pair, timeframe = "M1", options = undefined) {
    if (!pair) return;
    const symbol = String(pair).toUpperCase().trim();
    const tf = String(timeframe || "M1").toUpperCase().trim() || "M1";
    const key = this._makeKey(symbol, tf);
    if (!key) return;

    const opts = options && typeof options === "object" ? options : {};
    const forceResync = !!opts.forceResync;

    if (!this.client.ws || this.client.ws.readyState !== WebSocket.OPEN) this.client.connect();

    this.pinnedKeys.add(key);
    this.activeKeys.add(key);

    const now = Date.now();
    const last = Number(this.lastForceAtByKey.get(key) || 0);
    if (forceResync || now - last >= 600 || !this.client.isSubscribed?.(symbol, tf)) {
      this.lastForceAtByKey.set(key, now);
      try { this.client.reaffirm(symbol, tf, { resnapshot: true, requestLiveSeed: false }); } catch {}
    }
  }

  unpinPair(pair, timeframe = "M1") {
    if (!pair) return;
    const symbol = String(pair).toUpperCase().trim();
    const tf = String(timeframe || "M1").toUpperCase().trim() || "M1";
    const key = this._makeKey(symbol, tf);
    if (!key) return;

    this.pinnedKeys.delete(key);

    if (this.currentKey === key) return;
    if (!this.activeKeys.has(key)) return;

    try { this.client.unsubscribe(symbol, tf); } catch {}
    this.activeKeys.delete(key);
    this.lastForceAtByKey.delete(key);
  }

  closePair(pair, timeframe = "M1") {
    if (!pair) return;
    const symbol = String(pair).toUpperCase().trim();
    const tf = String(timeframe || "M1").toUpperCase().trim() || "M1";
    const key = this._makeKey(symbol, tf);
    if (!key) return;

    if (this.currentKey === key) this.currentKey = "";
    if (this.pinnedKeys.has(key)) return;
    if (!this.activeKeys.has(key)) return;

    try { this.client.unsubscribe(symbol, tf); } catch {}
    this.activeKeys.delete(key);
    this.lastForceAtByKey.delete(key);
  }

  loadMoreHistory(pair, timeframe = "M1", fromTime = 0, limit = 500) {
    if (!pair) return;
    const symbol = String(pair).toUpperCase().trim();
    const tf = String(timeframe || "M1").toUpperCase().trim() || "M1";
    const key = this._makeKey(symbol, tf);
    if (!key || !this.activeKeys.has(key)) return;
    this.client.loadMoreHistory?.(symbol, tf, fromTime, limit);
  }

  isPairActive(pair, timeframe = "M1") {
    const key = this._makeKey(pair, timeframe);
    return !!key && this.activeKeys.has(key);
  }

  getActivePairs() {
    return Array.from(this.activeKeys);
  }
}
