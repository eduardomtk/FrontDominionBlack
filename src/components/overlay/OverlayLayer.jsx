import { useTrade } from "../../context/TradeContext";
import ResultOverlay from "./ResultOverlay";

export default function OverlayLayer() {
  const { lastResult } = useTrade();

  // Overlay só existe quando há resultado
  if (!lastResult) return null;

  return <ResultOverlay key={lastResult.id} />;
}
