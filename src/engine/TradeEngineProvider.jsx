import { createContext, useEffect, useRef } from "react";
import TradeEngine from "./TradeEngine";
import { usePairUI } from "../context/PairUIContext";
import { useTrade } from "../context/TradeContext";
import { useAccount } from "../context/AccountContext";
import { useCandleRegistry } from "../context/CandleContext";
import { useMarketStore } from "../stores/market.store";

const TradeEngineContext = createContext(null);

function normalizePair(pair) {
  return String(pair || "").replace("/", "").toUpperCase().trim();
}

function normalizeTf(tf) {
  const s = String(tf || "").toUpperCase().trim();
  if (s === "M1" || s === "M5" || s === "M15" || s === "M30" || s === "H1") return s;
  return "M1";
}

function pinPairSafe(pairKey) {
  try {
    const st = useMarketStore.getState?.();
    const [pair, timeframe] = String(pairKey || "").split("|");
    if (pair && timeframe) st?.pinPair?.({ pair, timeframe });
  } catch {}
}

function unpinPairSafe(pairKey) {
  try {
    const st = useMarketStore.getState?.();
    const [pair, timeframe] = String(pairKey || "").split("|");
    if (pair && timeframe) st?.unpinPair?.({ pair, timeframe });
  } catch {}
}

export function TradeEngineProvider({ children }) {
  // key -> { engine, unsubscribe, pairKey }
  const enginesRef = useRef(new Map());

  const { symbol, timeframe } = usePairUI();
  const { accountType } = useAccount();
  const { allActiveTrades, registerClosedTrade, bindEngine } = useTrade();
  const { getEngineByKey, ensureEngineByKey } = useCandleRegistry();

  const registerClosedTradeRef = useRef(registerClosedTrade);
  const bindEngineRef = useRef(bindEngine);

  useEffect(() => {
    registerClosedTradeRef.current = registerClosedTrade;
  }, [registerClosedTrade]);

  useEffect(() => {
    bindEngineRef.current = bindEngine;
  }, [bindEngine]);

  // ✅ Router: openTrade sempre usa engine do timeframe do TRADE (M1/M5/M15)
  useEffect(() => {
    const router = {
      openTrade: (trade) => {
        const acc = String(trade?.account || "").toUpperCase().trim();
        const s = normalizePair(trade?.symbol);
        const tf = normalizeTf(trade?.timeframe || trade?.expirationLabel);

        if (!acc || !s || !tf) return false;

        const key = `${acc}|${s}|${tf}`;
        const pairKey = `${s}|${tf}`;

        // ✅ mantém WS vivo para esse TF enquanto existir engine/trade
        pinPairSafe(pairKey);

        // ✅ garante candleEngine desse pairKey (cria sob demanda)
        const candleEngine = ensureEngineByKey(pairKey) || getEngineByKey(pairKey);
        if (!candleEngine) return false;

        if (!enginesRef.current.has(key)) {
          const engine = new TradeEngine({ symbol: s, timeframe: tf, candleEngine });

          const unsubscribe = engine.subscribe((closedTrade) => {
            registerClosedTradeRef.current?.(closedTrade);
          });

          enginesRef.current.set(key, { engine, unsubscribe, pairKey });
        }

        return enginesRef.current.get(key)?.engine?.openTrade?.(trade) === true;
      },
    };

    bindEngineRef.current?.(router);
  }, [ensureEngineByKey, getEngineByKey]);

  // ✅ mantém também o engine atual quente (chart)
  useEffect(() => {
    const s = normalizePair(symbol);
    const tf = normalizeTf(timeframe);
    if (!s || !tf) return;

    const key = `${accountType}|${s}|${tf}`;
    const pairKey = `${s}|${tf}`;

    pinPairSafe(pairKey);

    const candleEngine = ensureEngineByKey(pairKey) || getEngineByKey(pairKey);
    if (!candleEngine) return;

    if (!enginesRef.current.has(key)) {
      const engine = new TradeEngine({ symbol: s, timeframe: tf, candleEngine });

      const unsubscribe = engine.subscribe((closedTrade) => {
        registerClosedTradeRef.current?.(closedTrade);
      });

      enginesRef.current.set(key, { engine, unsubscribe, pairKey });
    }
  }, [accountType, symbol, timeframe, ensureEngineByKey, getEngineByKey]);

  // ✅ Garbage collector: destrói engines que não têm trades ativos
  useEffect(() => {
    const list = Array.isArray(allActiveTrades) ? allActiveTrades : [];

    const aliveKeys = new Set();
    for (const t of list) {
      const acc = String(t?.account || "").toUpperCase().trim();
      const s = normalizePair(t?.symbol);
      const tf = normalizeTf(t?.timeframe || t?.expirationLabel);
      if (!acc || !s || !tf) continue;
      aliveKeys.add(`${acc}|${s}|${tf}`);
    }

    for (const [key, rec] of enginesRef.current.entries()) {
      if (aliveKeys.has(key)) continue;

      const curS = normalizePair(symbol);
      const curTf = normalizeTf(timeframe);
      const curKey = `${accountType}|${curS}|${curTf}`;
      if (key === curKey) continue;

      try { rec.unsubscribe?.(); } catch {}
      try { rec.engine?.destroy?.(); } catch {}
      try { unpinPairSafe(rec.pairKey); } catch {}

      enginesRef.current.delete(key);
    }
  }, [allActiveTrades, symbol, timeframe, accountType]);

  useEffect(() => {
    return () => {
      for (const rec of enginesRef.current.values()) {
        try { rec.unsubscribe?.(); } catch {}
        try { rec.engine?.destroy?.(); } catch {}
        try { unpinPairSafe(rec.pairKey); } catch {}
      }
      enginesRef.current.clear();
    };
  }, []);

  return (
    <TradeEngineContext.Provider value={null}>
      {children}
    </TradeEngineContext.Provider>
  );
}
