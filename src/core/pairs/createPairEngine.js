import PriceEngineLocal from "../../services/priceEngine/PriceEngineLocal";

export function createPairEngine() {
  const engine = new PriceEngineLocal();

  return {
    init(symbol, onCandle) {
      engine.init(symbol, onCandle);
    },
    stop() {
      engine.stop();
    }
  };
}
