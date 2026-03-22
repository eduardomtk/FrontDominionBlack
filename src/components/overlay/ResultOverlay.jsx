import { useEffect, useState } from "react";
import { useTrade } from "../../context/TradeContext";
import styles from "./ResultOverlay.module.css";

export default function ResultOverlay() {
  const { lastResult, clearLastResult } = useTrade();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!lastResult) return;

    // entra
    setVisible(true);

    // sai em 3s
    const hideTimer = setTimeout(() => {
      setVisible(false);
    }, 3000);

    // desmonta logo após animação
    const killTimer = setTimeout(() => {
      clearLastResult();
    }, 3400);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(killTimer);
    };
  }, [lastResult, clearLastResult]);

  if (!lastResult) return null;

  const isWin = lastResult.result === "WIN";

  return (
    <div
      className={`${styles.overlay} ${
        visible ? styles.show : styles.hide
      } ${isWin ? styles.win : styles.loss}`}
    >
      <div className={styles.card}>
        <span className={styles.title}>
          {isWin ? "RESULTADO POSITIVO" : "OPERAÇÃO PERDIDA"}
        </span>

        <span className={styles.amount}>
          {isWin ? "+" : "-"}R$
          {Math.abs(lastResult.profit).toFixed(2)}
        </span>

        <span className={styles.type}>{lastResult.direction}</span>

        <div className={styles.progress} />
      </div>
    </div>
  );
}
