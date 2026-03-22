/**
 * CandleEngine
 * Contrato:
 * - subscribeCandles((candles, liveCandle) => {})
 * - subscribePrice((price) => {})
 *
 * Regras soberanas:
 * - history = fechados
 * - candle_update (live) = cria/atualiza candle vivo
 * - tick = preço instantâneo; só pode atualizar a live SE ela já existir (não cria)
 *
 * ✅ FIX PROFISSIONAL:
 * Alguns streams incluem no HISTORY a vela do bucket atual (quase-live).
 * Nesse caso, ela NÃO pode contaminar _lastClosedTime.
 * Ela deve virar liveCandle para não bloquear candle_update até o próximo minuto.
 */
export default class CandleEngine {
  constructor({ symbol, timeframeSec }) {
    this.symbol = symbol;
    this.timeframeSec = timeframeSec;

    this.candles = [];
    this.liveCandle = null;

    this.candleSubscribers = new Set();
    this.priceSubscribers = new Set();

    this._lastClosedTime = 0;
    this._lastEmittedTime = 0;

    this._lastPrice = null;
    this._closedEpoch = 0;
    this._closedSnapshotEpoch = -1;
    this._closedSnapshot = [];

    // ✅ performance: snapshot cache (evita copiar 3000 candles a cada tick)
    this._closedEpoch = 0;
    this._closedSnapshotEpoch = -1;
    this._closedSnapshot = [];
  }

  // ✅ helpers públicos (para o CandleContext blindar rollback)
  isEmpty() {
    return (this.candles?.length || 0) === 0 && !this.liveCandle;
  }

  getLastClosedTime() {
    return Number(this._lastClosedTime) || 0;
  }

  getLastTime() {
    const lastClosed = Array.isArray(this.candles) && this.candles.length
      ? Number(this.candles[this.candles.length - 1]?.time) || 0
      : 0;
    const liveT = this.liveCandle ? (Number(this.liveCandle.time) || 0) : 0;
    return Math.max(lastClosed || 0, liveT || 0);
  }

  // ✅ Insere candle fechado na lista soberana (dedupe + monotonic)
  _pushClosed(c) {
    if (!c) return;

    const t = Number(c.time);
    if (!Number.isFinite(t)) return;

    // não regride
    if (this._lastClosedTime > 0 && t < Number(this._lastClosedTime)) return;

    const arr = Array.isArray(this.candles) ? this.candles : [];
    const last = arr.length ? arr[arr.length - 1] : null;
    const lt = last ? Number(last.time) : NaN;

    // dedupe por time
    if (Number.isFinite(lt) && lt === t) {
      arr[arr.length - 1] = { ...c };
    } else if (!Number.isFinite(lt) || t > lt) {
      arr.push({ ...c });
    } else {
      // inserção fora de ordem: procura e substitui; se não achar, ignora.
      const idx = arr.findIndex((x) => Number(x?.time) === t);
      if (idx >= 0) arr[idx] = { ...c };
      else return;
    }

    this.candles = arr;
    this._bumpClosedEpoch();
    this._lastClosedTime = t;
  }

  subscribeCandles(fn) {
    if (typeof fn !== "function") return () => {};
    this.candleSubscribers.add(fn);

    if (this.candles.length > 0 || this.liveCandle) {
      fn(this._getClosedSnapshot(), this.liveCandle ? { ...this.liveCandle } : null);
    }

    return () => this.candleSubscribers.delete(fn);
  }

  subscribePrice(fn) {
    if (typeof fn !== "function") return () => {};
    this.priceSubscribers.add(fn);

    if (this.liveCandle) fn(this.liveCandle.close);
    else if (Number.isFinite(this._lastPrice)) fn(this._lastPrice);

    return () => this.priceSubscribers.delete(fn);
  }


  // ✅ performance: snapshot do array de candles fechados (recria só quando o CLOSED muda)
  _bumpClosedEpoch() {
    this._closedEpoch = (Number(this._closedEpoch) || 0) + 1;
  }

  _getClosedSnapshot() {
    const epoch = Number(this._closedEpoch) || 0;
    if (this._closedSnapshotEpoch !== epoch) {
      const snap = Array.isArray(this.candles) ? this.candles.slice() : [];
      // freeze: evita mutação acidental por subscribers (custo ocorre só quando CLOSED muda)
      try { Object.freeze(snap); } catch {}
      this._closedSnapshot = snap;
      this._closedSnapshotEpoch = epoch;
    }
    return this._closedSnapshot;
  }

  _emit() {
    if (this.candles.length === 0 && !this.liveCandle) return;

    const candlesCopy = this._getClosedSnapshot();
    const liveCopy = this.liveCandle ? { ...this.liveCandle } : null;

    const lastClosed = candlesCopy.length ? candlesCopy[candlesCopy.length - 1] : null;
    const tClosed = lastClosed ? Number(lastClosed.time) : 0;
    const tLive = liveCopy ? Number(liveCopy.time) : 0;
    const t = Math.max(tClosed || 0, tLive || 0);

    if (Number.isFinite(t) && t > this._lastEmittedTime) this._lastEmittedTime = t;

    for (const fn of this.candleSubscribers) fn(candlesCopy, liveCopy);
  }

  _emitPrice(price) {
    const p = Number(price);
    if (!Number.isFinite(p)) return;
    this._lastPrice = p;
    for (const fn of this.priceSubscribers) fn(p);
  }

  _parseTime(time) {
    const n = Number(time);
    if (Number.isFinite(n)) return n;

    if (typeof time === "string") {
      const d = new Date(time.replace(/\./g, "/"));
      const s = Math.floor(d.getTime() / 1000);
      if (Number.isFinite(s)) return s;
    }

    return Math.floor(Date.now() / 1000);
  }

  _bucketTime(timeSec) {
    const t = Number(timeSec);
    const tf = Number(this.timeframeSec) || 60;
    if (!Number.isFinite(t) || !Number.isFinite(tf) || tf <= 0) return null;
    return Math.floor(t / tf) * tf;
  }

  _normalizeCandle(c) {
    if (!c) return null;

    const timeRaw = c.time ?? c.t;
    const time = Number(timeRaw);

    const open = Number(c.open ?? c.o);
    const high = Number(c.high ?? c.h);
    const low = Number(c.low ?? c.l);
    const close = Number(c.close ?? c.c);

    if (!Number.isFinite(time) || ![open, high, low, close].every((v) => Number.isFinite(v))) {
      return null;
    }

    const bucket = this._bucketTime(time);
    if (!Number.isFinite(bucket)) return null;

    return {
      time: bucket,
      open,
      high,
      low,
      close,
      volume: Number(c.volume ?? c.v) || 0,
    };
  }

  _mergeClosedHistory(incomingClosed) {
    const incoming = Array.isArray(incomingClosed) ? incomingClosed : [];
    const existing = Array.isArray(this.candles) ? this.candles : [];

    if (!existing.length) return incoming.slice();
    if (!incoming.length) return existing.slice();

    const byTime = new Map();

    for (const c of existing) {
      const t = Number(c?.time);
      if (!Number.isFinite(t)) continue;
      byTime.set(t, { ...c });
    }

    for (const c of incoming) {
      const t = Number(c?.time);
      if (!Number.isFinite(t)) continue;
      byTime.set(t, { ...c });
    }

    return Array.from(byTime.values()).sort((a, b) => Number(a.time) - Number(b.time));
  }

  // HISTORY (fechados soberanos)
  // ✅ retorna boolean: true se aplicou / false se ignorou
  onHistory(history) {
    if (!Array.isArray(history) || history.length === 0) return false;

    const formatted = history
      .map((c) => this._normalizeCandle(c))
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);

    if (!formatted.length) return false;

    // ✅ FIX PROFISSIONAL (pane rollback):
    // history pode chegar incluindo o bucket atual alguns ms depois do candle_update.
    // Se já temos uma live soberana nesse mesmo bucket, essa última barra do history
    // precisa continuar sendo tratada como live — mesmo que o relógio local ainda não
    // tenha virado exatamente para esse bucket.
    const nowSec = Math.floor(Date.now() / 1000);
    const nowBucket = this._bucketTime(nowSec);
    const currentLiveTime = this.liveCandle ? Number(this.liveCandle.time) : NaN;

    let extractedLive = null;
    let closed = formatted;

    const last = formatted[formatted.length - 1];
    const lastT = last ? Number(last.time) : NaN;
    const shouldExtractLive =
      last && (
        (Number.isFinite(nowBucket) && lastT === Number(nowBucket)) ||
        (Number.isFinite(currentLiveTime) && lastT === currentLiveTime)
      );

    if (shouldExtractLive) {
      extractedLive = { ...last };
      closed = formatted.slice(0, -1);
    }

    const nextClosed = this._mergeClosedHistory(closed);
    this.candles = nextClosed;
    this._bumpClosedEpoch();

    const lastClosed = nextClosed.length ? nextClosed[nextClosed.length - 1] : null;
    this._lastClosedTime = lastClosed ? Number(lastClosed.time) || 0 : 0;

    // ✅ se já existe live soberana no mesmo bucket, preserva a live atual
    // (normalmente mais nova que a fotografia do history).
    if (extractedLive) {
      if (!(this.liveCandle && Number(this.liveCandle.time) === Number(extractedLive.time))) {
        this.liveCandle = extractedLive;
      }
    }

    // se live ficou stale, descarta
    if (
      this.liveCandle &&
      this._lastClosedTime > 0 &&
      Number(this.liveCandle.time) <= Number(this._lastClosedTime)
    ) {
      this.liveCandle = null;
    }

    // preço: prioriza live se existir, senão último fechado
    if (this.liveCandle) this._emitPrice(this.liveCandle.close);
    else if (lastClosed) this._emitPrice(lastClosed.close);

    this._emit();
    return true;
  }

  // LIVE (ÚNICA fonte que cria/atualiza candle vivo)
  onCandleUpdate(candleLike) {
    const c = this._normalizeCandle(candleLike);
    if (!c) return;

    const t = Number(c.time);
    if (!Number.isFinite(t)) return;

    // ✅ com o fix acima, _lastClosedTime não deve bloquear bucket atual
    if (this._lastClosedTime > 0 && t <= this._lastClosedTime) return;

    // ✅ FIX CRÍTICO (pane sync / timeScale):
    // Quando chega um candle_update de um NOVO bucket, o candle vivo anterior precisa
    // virar FECHADO e entrar em this.candles.
    // Caso contrário, o MainChart (que usa series.update) “continua”, mas panes que
    // fazem setData (anchor/indicadores) perdem o bar anterior e o timeScale regressa,
    // gerando exatamente o comportamento “volta e vai” / travado na mesma vela.
    const prevLive = this.liveCandle ? { ...this.liveCandle } : null;
    const prevT = prevLive ? Number(prevLive.time) : NaN;

    if (prevLive && Number.isFinite(prevT) && t > prevT) {
      this._pushClosed(prevLive);
      // se por algum motivo o _lastClosedTime avançou até >= t, não cria live
      if (this._lastClosedTime > 0 && t <= this._lastClosedTime) return;
    }

    this.liveCandle = { ...c };
    this._emitPrice(this.liveCandle.close);
    this._emit();
  }

  onCandleClose(candleLike) {
    const c = this._normalizeCandle(candleLike);
    if (!c) return;

    const t = Number(c.time);
    if (!Number.isFinite(t)) return;

    // ✅ Pode chegar depois que a nova live já nasceu.
    // Nesse caso, ainda precisamos corrigir/substituir o candle fechado soberano.
    if (this._lastClosedTime > 0 && t < Number(this._lastClosedTime)) return;

    this._pushClosed({ ...c });

    if (this.liveCandle && Number(this.liveCandle.time) <= t) {
      this.liveCandle = null;
    }

    if (this.liveCandle) this._emitPrice(this.liveCandle.close);
    else this._emitPrice(c.close);

    this._emit();
  }

  // TICK: não cria candle; só atualiza se live existir e for o mesmo bucket
  onTick(data) {
    if (!data) return;

    const bid = Number(data.bid ?? data.price ?? data.close ?? data.c);
    if (!Number.isFinite(bid)) return;

    const tickTime = this._parseTime(data.serverTime ?? data.time ?? data.t);
    const bucket = this._bucketTime(tickTime);
    if (!Number.isFinite(bucket)) {
      this._emitPrice(bid);
      return;
    }

    // preço instantâneo sempre
    this._emitPrice(bid);

    if (!this.liveCandle) return;

    const liveT = Number(this.liveCandle.time);
    if (!Number.isFinite(liveT)) return;

    if (bucket !== liveT) return;

    const prevClose = Number(this.liveCandle.close);
    const prevHigh = Number(this.liveCandle.high);
    const prevLow = Number(this.liveCandle.low);

    const nextHigh = Number.isFinite(prevHigh) ? Math.max(prevHigh, bid) : bid;
    const nextLow = Number.isFinite(prevLow) ? Math.min(prevLow, bid) : bid;

    this.liveCandle.high = nextHigh;
    this.liveCandle.low = nextLow;
    this.liveCandle.close = bid;
    this.liveCandle.volume = (Number(this.liveCandle.volume) || 0) + 1;

    if (bid !== prevClose || nextHigh !== prevHigh || nextLow !== prevLow) {
      this._emit();
    }
  }

  // opcional: se você quiser que destroy exista de fato
  destroy() {
    try {
      this.candleSubscribers?.clear?.();
      this.priceSubscribers?.clear?.();
    } catch {}
    this.candles = [];
    this.liveCandle = null;
    this._lastClosedTime = 0;
    this._lastEmittedTime = 0;
    this._lastPrice = null;
    this._closedEpoch = 0;
    this._closedSnapshotEpoch = -1;
    this._closedSnapshot = [];

    // ✅ performance: snapshot cache (evita copiar 3000 candles a cada tick)
    this._closedEpoch = 0;
    this._closedSnapshotEpoch = -1;
    this._closedSnapshot = [];
  }
}