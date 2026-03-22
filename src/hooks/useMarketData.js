import { useEffect, useMemo } from "react";
import { useMarketStore } from "@/stores/market.store";

/**
 * useMarketData
 * Retorna candles (histórico + liveCandle) para um par específico
 * @param {string} pair - Par de mercado ex: EURUSD
 */
export function useMarketData({ pair }) {
  // ✅ Normaliza o par para manter chave única e consistente com o Store/WS
  const symbol = useMemo(() => {
    const p = String(pair || "").toUpperCase().trim();
    return p || "";
  }, [pair]);

  const pairState = useMarketStore((s) => (symbol ? s.pairs[symbol] || {} : {}));
  const { candles = [], liveCandle = null, timeframe = "M1" } = pairState;

  const initPair = useMarketStore((s) => s.initPair);
  const removePair = useMarketStore((s) => s.removePair);

  // ✅ Inicializa o par quando o símbolo mudar (ou timeframe mudar)
  useEffect(() => {
    if (!symbol) return;

    initPair({ pair: symbol, timeframe });

    return () => {
      const current = useMarketStore.getState().pairs[symbol];
      if (current) {
        removePair(symbol);
      }
    };
  }, [symbol, timeframe]); // 🔁 quando símbolo/timeframe mudarem

  // Retorna histórico + vela viva
  const chartCandles = liveCandle ? [...candles, liveCandle] : candles;

  return {
    candles: chartCandles,
    loading: candles.length === 0,
    ready: candles.length > 0,
    error: null,
  };
}
