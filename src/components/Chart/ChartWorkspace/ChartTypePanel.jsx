// src/components/Chart/ChartWorkspace/ChartTypePanel.jsx
import React, { useEffect, useRef } from "react";
import styles from "./ChartTypePanel.module.css";
import { useChartView } from "@/context/ChartViewContext";
import SoundManager from "@/sound/SoundManager.js";
// ✅ i18n
import { useTranslation } from "react-i18next";

export default function ChartTypePanel({ onClose }) {
  // ✅ Hook i18n
  const { t } = useTranslation("chartTypePanel");

  const { chartType, setChartType } = useChartView();

  // ✅ Click-outside support (mínima alteração)
  const panelRef = useRef(null);

  // ✅ Click outside -> close (capturing) | ignora cliques dentro do painel
  useEffect(() => {
    function handlePointerDownCapture(e) {
      const el = panelRef.current;
      if (!el) return;

      // Clique dentro do painel => ignora
      if (el.contains(e.target)) return;

      // ✅ Clique fora => fecha SEM SOM (evita "double click sound")
      onClose?.();
    }

    document.addEventListener("pointerdown", handlePointerDownCapture, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDownCapture, true);
    };
  }, [onClose]);

  function handleSelect(type) {
    // ✅ só toca e altera se realmente mudou
    if (type !== chartType) {
      SoundManager.uiClick();
      setChartType(type);
    }
    onClose?.();
  }

  const CHART_TYPES = [
    { id: "candles", labelKey: "candles", icon: "🕯️" },
    { id: "line", labelKey: "line", icon: "📈" },
    { id: "bars", labelKey: "bars", icon: "📊" },
    { id: "heikin", labelKey: "heikin", icon: "💡" },
  ];

  return (
    <div className={styles.panel} ref={panelRef}>
      <div className={styles.header}>
        <span>{t("title")}</span>
        <button
          className={styles.closeBtn}
          onClick={() => {
            SoundManager.uiClick();
            onClose?.();
          }}
          aria-label={t("actions.close")}
          title={t("actions.close")}
        >
          ×
        </button>
      </div>

      <div className={styles.list}>
        {CHART_TYPES.map((item) => (
          <button
            key={item.id}
            className={`${styles.typeBtn} ${chartType === item.id ? styles.active : ""}`}
            onClick={() => handleSelect(item.id)}
            aria-label={t(`types.${item.labelKey}`)}
            title={t(`types.${item.labelKey}`)}
          >
            <span className={styles.icon}>{item.icon}</span>
            {t(`types.${item.labelKey}`)}
          </button>
        ))}
      </div>
    </div>
  );
}