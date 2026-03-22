import React from "react";
import styles from "./FloatingToolbar.module.css";

function tfToLabel(tf) {
  const s = String(tf || "").toUpperCase().trim();
  if (s === "M1") return "1m";
  if (s === "M5") return "5m";
  if (s === "M15") return "15m";
  if (s === "M30") return "30m";
  if (s === "H1") return "1h";
  return "1m";
}

export default function FloatingToolbar({ onAction, activeAction, timeframe }) {
  return (
    <div className={styles.toolbarWrapper}>
      {/* Botão de Timeframe */}
      <button
        className={`${styles.iconBtn} ${activeAction === "timeframe" ? styles.active : ""}`}
        onClick={() => onAction("timeframe")}
      >
        <span className={styles.timeText}>{tfToLabel(timeframe)}</span>
      </button>

      {/* Botão de Tipo de Gráfico */}
      <button
        className={`${styles.iconBtn} ${activeAction === "chartType" ? styles.active : ""}`}
        onClick={() => onAction("chartType")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M3 3v18h18" />
          <path d="m19 9-5 5-4-4-3 3" />
        </svg>
      </button>

      {/* Botão de Indicadores */}
      <button
        className={`${styles.iconBtn} ${activeAction === "indicators" ? styles.active : ""}`}
        onClick={() => onAction("indicators")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="20" x2="12" y2="10" />
          <line x1="18" y1="20" x2="18" y2="4" />
          <line x1="6" y1="20" x2="6" y2="16" />
        </svg>
      </button>

      {/* Botão de Ferramentas de Desenho */}
      <button
        className={`${styles.iconBtn} ${activeAction === "draw" ? styles.active : ""}`}
        onClick={() => onAction("draw")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </button>
    </div>
  );
}
