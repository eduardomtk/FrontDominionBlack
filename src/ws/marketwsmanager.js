import MarketWSClient from "./MarketWSClient";

export default class MarketWSManager {
  constructor({ url, onMarketEvent }) {
    if (!url) throw new Error("MarketWSManager: url é obrigatório");
    this.onMarketDataCallback = onMarketEvent || null;
    this.activeKeys = new Set();
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
    if (!normalized || !this.currentKey) return;
    const { pair, type, timeframe, data } = normalized;
    const [currentPair, currentTf] = this.currentKey.split("|");
    if (pair !== currentPair) return;
    const tf = timeframe || currentTf || "M1";
    if (tf !== currentTf) return;
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

    if (!this.client.ws || this.client.ws.readyState !== WebSocket.OPEN) this.client.connect();

    if (this.currentKey === key) {
      if (!forceResync) return;
      const now = Date.now();
      const last = Number(this.lastForceAtByKey.get(key) || 0);
      if (now - last < 600) return;
      this.lastForceAtByKey.set(key, now);
      console.log("♻️ [MarketWSManager] forçando resync soberano:", symbol, tf);
      try { this.client.reaffirm(symbol, tf, { resnapshot: true, requestLiveSeed: false }); } catch {}
      return;
    }

    const prevKey = this.currentKey;
    if (prevKey && prevKey !== key) {
      this.lastForceAtByKey.delete(prevKey);
    }

    this.currentKey = key;
    this.activeKeys = new Set([key]);
    this.lastForceAtByKey.set(key, Date.now());

    try {
      if (typeof this.client.replaceSubscription === "function") {
        this.client.replaceSubscription(symbol, tf, { resnapshot: true, requestLiveSeed: false });
      } else {
        this.client.subscribe(symbol, tf, { resnapshot: true, requestLiveSeed: false });
      }
    } catch {}

    console.log("📡 [MarketWSManager] par aberto exclusivo:", symbol, tf, prevKey ? `prev=${prevKey}` : "");
  }

  closePair(pair, timeframe = "M1") {
    if (!pair) return;
    const symbol = String(pair).toUpperCase().trim();
    const tf = String(timeframe || "M1").toUpperCase().trim() || "M1";
    const key = this._makeKey(symbol, tf);
    if (!key || this.currentKey !== key) return;
    try { this.client.unsubscribe(symbol, tf); } catch {}
    this.activeKeys.clear();
    this.currentKey = "";
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
