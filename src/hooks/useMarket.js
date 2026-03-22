// src/hooks/useMarket.js
import { usePairUI } from "@/context/PairUIContext";

/**
 * useMarket
 * Retorna o par e timeframe selecionados pelo usuário
 * Hook somente de UI, não carrega dados do backend
 */
export function useMarket() {
  const context = usePairUI();
  const { symbol, timeframe } = context;

  return { symbol, timeframe };
}
