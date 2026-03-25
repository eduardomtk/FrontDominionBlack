// src/components/trading/ActiveTradesPanel/ActiveTradesPanel.jsx
import React, { useEffect, useState } from "react";
import styles from "./ActiveTradesPanel.module.css";
import { useTrade } from "../../context/TradeContext";
import { useMarketStore } from "../../stores/market.store";
// ✅ i18n
import { useTranslation } from "react-i18next";

const ActiveTradesPanel = () => {
  // ✅ Hook i18n
  const { t } = useTranslation("activeTradesPanel");
  
  const { activeTrades } = useTrade();
  const getServerNowMs = useMarketStore((state) => state.getServerNowMs);

  const readNowMs = () => {
    try {
      const now = Number(getServerNowMs?.());
      if (Number.isFinite(now) && now > 0) return now;
    } catch {}
    return Date.now();
  };

  // ms atual (usado para calcular secondsLeft)
  const [nowMs, setNowMs] = useState(() => readNowMs());

  useEffect(() => {
    let timeoutId = null;
    let intervalId = null;

    const start = () => {
      // alinha no próximo "virar de segundo"
      const now = readNowMs();
      const msToNextSecond = 1000 - (now % 1000);

      timeoutId = setTimeout(() => {
        // bate exatamente na virada
        setNowMs(readNowMs());

        // e mantém alinhado
        intervalId = setInterval(() => {
          setNowMs(readNowMs());
        }, 1000);
      }, msToNextSecond);
    };

    start();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [getServerNowMs]);

  // ✅ Se não houver trades ativos, NÃO renderiza nada
  if (!activeTrades || activeTrades.length === 0) {
    return null;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>{t("header")}</div>

      <div className={styles.tradeList}>
        {activeTrades.map((trade) => {
          const expMs = Number(trade.expirationTime);

          // ✅ secondsLeft calculado com base no ms real, arredondando pra cima
          const secondsLeft = Number.isFinite(expMs)
            ? Math.max(0, Math.ceil((expMs - nowMs) / 1000))
            : 0;

          let timeLabel;

          if (secondsLeft >= 60) {
            const minutes = Math.floor(secondsLeft / 60);
            const seconds = secondsLeft % 60;
            // ✅ Formatação de tempo traduzida com interpolação
            timeLabel = t("time.minutes_seconds", { 
              minutes: String(minutes).padStart(2, "0"), 
              seconds: String(seconds).padStart(2, "0") 
            });
          } else {
            // ✅ Formatação de segundos traduzida com interpolação
            timeLabel = t("time.seconds", { count: secondsLeft });
          }

          return (
            <div
              key={trade.id}
              className={`${styles.tradeCard} ${styles[trade.direction.toLowerCase()]}`}
            >
              <div className={styles.left}>
                <span className={styles.direction}>{trade.direction}</span>
                <span className={styles.amount}>R$ {trade.amount.toFixed(2)}</span>
              </div>

              <div className={styles.center}>
                <span className={styles.expiration}>{trade.expirationLabel}</span>
              </div>

              <div className={styles.right}>
                <span className={styles.timer}>{timeLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ActiveTradesPanel;