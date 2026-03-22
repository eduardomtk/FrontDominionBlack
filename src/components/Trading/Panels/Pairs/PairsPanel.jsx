import { useTrade } from "../../../../context/TradeContext";
import styles from "./PairsPanel.module.css";

const PAIRS = ["EUR/USD", "GBP/USD", "BTC/USDT"];

export default function PairsPanel() {
  const { pair, setPair } = useTrade();

  return (
    <div className={styles.panel}>
      {PAIRS.map((p) => (
        <button
          key={p}
          type="button"
          className={`${styles.button} ${p === pair ? styles.active : ""}`}
          onClick={() => {
            console.log("Trocando par para:", p);
            setPair(p);
          }}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
