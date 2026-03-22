// MarketBridge.jsx
// Este componente está obsoleto e causando conflitos.
// Remova-o ou comente-o completamente.

// import { useEffect, useRef } from "react";
// import { useMarketStore } from "@/stores/market.store";
// import { getMarketWSManager } from "@/ws/market.ws.instance";
// import { marketStory } from "@/engine/MarketStory";

// export default function MarketBridge() {
//   const { symbol, timeframe } = usePair();
//   const initPair = useMarketStore((s) => s.initPair);
//   const removePair = useMarketStore((s) => s.removePair);

//   const wsRef = useRef(null);
//   const lastPairRef = useRef(null);

//   useEffect(() => {
//     wsRef.current = getMarketWSManager({
//       url: "wss://SEU_BACKEND_WS",
//       marketStory,
//     });

//     return () => {
//       wsRef.current?.disconnect();
//     };
//   }, []);

//   useEffect(() => {
//     if (!wsRef.current) return;

//     const pairKey = `${symbol}`;

//     if (lastPairRef.current) {
//       removePair(lastPairRef.current, wsRef.current);
//     }

//     initPair({
//       pair: pairKey,
//       timeframe,
//       wsManager: wsRef.current,
//     });

//     lastPairRef.current = pairKey;
//   }, [symbol, timeframe]);

//   return null; // bridge invisível
// }

// ⚠️ REMOVA ESTE COMPONENTE OU COMENTE-O COMPLETAMENTE