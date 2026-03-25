import { getPayoutBySymbol } from "./AssetRegistry";

/**
 * TradeEngine (PROFISSIONAL / DETERMINÍSTICA)
 *
 * ✅ Objetivo: garantir que o FECHAMENTO registrado no histórico seja 100% o fechamento correto do trade,
 * no exato “boundary” do candle de expiração — sem depender de “chegada tardia” de history.
 *
 * Como garantimos isso:
 * 1) Continuamos ouvindo candleEngine.subscribeCandles((candles, liveCandle) => ...)
 * 2) Fechamos trades por 2 gatilhos:
 *    (A) HISTORY CLOSE: quando chega um candle fechado em candles[] (último candle fechado)
 *    (B) LIVE ROLL: quando a liveCandle muda de bucket (time muda) => significa que o candle anterior FECHOU.
 *        Nesse instante, usamos o último close conhecido da live anterior como closePrice verdadeiro.
 *
 * ✅ Regra de resultado (sem empate devolvendo):
 * - CALL: close > open => WIN, senão LOSS (inclui empate)
 * - PUT : close < open => WIN, senão LOSS (inclui empate)
 */
export default class TradeEngine {
  constructor({ symbol, timeframe, candleEngine }) {
    if (!symbol) throw new Error("TradeEngine: symbol is required");
    if (!timeframe) throw new Error("TradeEngine: timeframe is required");
    if (!candleEngine) throw new Error("TradeEngine: candleEngine is required");

    this.symbol = symbol;
    this.timeframe = timeframe;
    this.candleEngine = candleEngine;

    // 🔒 fallback de payout por símbolo.
    // O payout soberano de cada operação deve vir do payload do trade
    // (o mesmo que o painel da direita já exibiu ao usuário).
    this.defaultPayout = getPayoutBySymbol(symbol);

    this.activeTrades = new Map();
    this.subscribers = new Set();

    // ✅ rastreia live anterior para detectar "roll" (mudança de bucket)
    this._lastLive = null; // { time(sec bucket), close(number) }

    this.onCandle = this.onCandle.bind(this);

    // 🔌 subscribe seguro (com unsubscribe)
    this.unsubscribeCandles = this.candleEngine.subscribeCandles(this.onCandle);
  }

  // --------------------------
  // ✅ Time normalization helpers
  // --------------------------
  toMs(t) {
    const n = Number(t);
    if (!Number.isFinite(n)) return NaN;
    // epoch seconds ~ 1.7e9 | epoch ms ~ 1.7e12
    return n < 1e11 ? n * 1000 : n;
  }

  _timeframeMs() {
    const tfSec = Number(this.candleEngine?.timeframeSec);
    if (Number.isFinite(tfSec) && tfSec > 0) return tfSec * 1000;
    return 60 * 1000;
  }

  _num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  _getOpenPrice(trade) {
    const fromEngine = this._num(this.candleEngine?.liveCandle?.close);
    if (fromEngine !== null) return fromEngine;

    const fromTrade = this._num(trade?.openPrice);
    if (fromTrade !== null) return fromTrade;

    return null;
  }

  _resolveTradePayout(trade) {
    const incoming = this._num(trade?.payout);
    if (incoming !== null && incoming > 0 && incoming <= 1) {
      return incoming;
    }

    const fallback = this._num(this.defaultPayout);
    if (fallback !== null && fallback > 0 && fallback <= 1) {
      return fallback;
    }

    return 0.7;
  }

  // --------------------------
  // ✅ Open trade
  // --------------------------
  openTrade(trade) {
    if (!trade?.id) return false;

    // 🔒 Se já existe, não sobrescreve
    if (this.activeTrades.has(trade.id)) return false;

    // Normaliza expirationTime para ms (obrigatório)
    const expMs = this.toMs(trade.expirationTime);
    if (!Number.isFinite(expMs)) return false;

    const openPrice = this._getOpenPrice(trade);
    if (typeof openPrice !== "number") return false;

    const resolvedPayout = this._resolveTradePayout(trade);

    this.activeTrades.set(trade.id, {
      ...trade,
      openPrice,
      payout: resolvedPayout,
      status: "OPEN",
      expirationTime: expMs, // ✅ ms internamente
    });

    return true;
  }

  /**
   * Recebe candles (fechados + live)
   * candleEngine chama fn(candles, liveCandle)
   *
   * ✅ Aqui está a garantia do fechamento correto:
   * - Se o bucket da live mudou, o candle anterior acabou de FECHAR:
   *   fechamos usando o último close da live anterior.
   * - Se chegou candle fechado no history, também fechamos (redundância).
   */
  onCandle(candles, liveCandle) {
    const tfMs = this._timeframeMs();

    // --------------------------
    // (B) LIVE ROLL: live bucket mudou -> candle anterior fechou
    // --------------------------
    if (liveCandle) {
      const liveBucketSec = this._num(liveCandle?.time);
      const liveClose = this._num(liveCandle?.close);

      if (liveBucketSec !== null && liveClose !== null) {
        const prev = this._lastLive;

        // detecta roll: mudou o bucket
        if (prev && Number(prev.time) !== Number(liveBucketSec)) {
          const prevStartMs = this.toMs(prev.time);
          if (Number.isFinite(prevStartMs)) {
            const prevCloseMs = prevStartMs + tfMs;

            // ✅ fecha trades usando close real do candle que acabou de fechar
            this._resolveAtClose({
              closeMs: prevCloseMs,
              closePrice: Number(prev.close),
              source: "live_roll",
            });
          }
        }

        // atualiza lastLive para o bucket atual
        this._lastLive = { time: Number(liveBucketSec), close: Number(liveClose) };
      }
    }

    // --------------------------
    // (A) HISTORY CLOSE: último candle fechado disponível
    // --------------------------
    if (Array.isArray(candles) && candles.length) {
      const lastClosed = candles[candles.length - 1];
      const startMs = this.toMs(lastClosed?.time);
      const closePrice = this._num(lastClosed?.close);

      if (Number.isFinite(startMs) && closePrice !== null) {
        const closeMs = startMs + tfMs;

        // ✅ redundância: se history chegou atrasado, ainda fecha (ou ignora se já fechou)
        this._resolveAtClose({
          closeMs,
          closePrice: Number(closePrice),
          source: "history_close",
        });
      }
    }
  }

  /**
   * ✅ Resolve trades no fechamento do candle (closeMs).
   * closeMs = bucketStart + timeframeMs
   *
   * Fecha todo trade cujo expirationTime <= closeMs
   * (isso garante que NUNCA pega candle anterior por engano)
   */
  _resolveAtClose({ closeMs, closePrice, source }) {
    const cm = Number(closeMs);
    const cp = Number(closePrice);

    if (!Number.isFinite(cm) || !Number.isFinite(cp)) return;
    if (this.activeTrades.size === 0) return;

    const toClose = [];

    for (const trade of this.activeTrades.values()) {
      if (trade.status !== "OPEN") continue;

      const exp = Number(trade.expirationTime);
      if (!Number.isFinite(exp)) continue;

      // ✅ fecha quando o FECHAMENTO do candle alcança/ultrapassa a expiração
      if (cm < exp) continue;

      // ✅ regra soberana (empate = LOSS)
      const win =
        trade.direction === "CALL"
          ? cp > Number(trade.openPrice)
          : cp < Number(trade.openPrice);

      const profit = win ? trade.amount * trade.payout : -trade.amount;

      toClose.push({
        ...trade,
        closePrice: cp,
        closedAt: cm, // ✅ fechamento real em ms (boundary do candle)
        result: win ? "WIN" : "LOSS",
        profit,
        status: "CLOSED",
        // ✅ metadado de auditoria (não quebra nada se o UI ignorar)
        closeSource: source,
      });
    }

    for (const closed of toClose) {
      this.activeTrades.delete(closed.id);
      this.emit(closed);
    }
  }

  /**
   * Subscribe para trades fechados
   */
  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  emit(trade) {
    for (const fn of this.subscribers) {
      fn(trade);
    }
  }

  /**
   * Destrói completamente a engine
   */
  destroy() {
    this.unsubscribeCandles?.();
    this.activeTrades.clear();
    this.subscribers.clear();
    this._lastLive = null;
  }
}
