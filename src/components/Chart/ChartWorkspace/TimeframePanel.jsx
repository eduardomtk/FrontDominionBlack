// src/components/Chart/TimeframePanel/TimeframePanel.jsx
import React, { useEffect, useRef } from "react";
import styles from "./TimeframePanel.module.css";
import SoundManager from "@/sound/SoundManager.js";
// ✅ i18n
import { useTranslation } from "react-i18next";

const TIMEFRAMES = [
  { labelKey: "m1", value: "M1" },
  { labelKey: "m5", value: "M5" },
  { labelKey: "m15", value: "M15" },
  { labelKey: "m30", value: "M30" },
  { labelKey: "h1", value: "H1" },
];

function normalizeTf(tf) {
  const s = String(tf || "").trim().toUpperCase();
  if (s === "M1" || s === "M5" || s === "M15" || s === "M30" || s === "H1") return s;
  return "M1";
}

export default function TimeframePanel({ onSelect, onClose, currentTf }) {
  // ✅ Hook i18n
  const { t } = useTranslation("timeframePanel");

  const current = normalizeTf(currentTf);

  // ✅ Click-outside support (mínima alteração)
  const panelRef = useRef(null);

  // ✅ Click outside -> close (capturing) | ignora cliques dentro do painel
  useEffect(() => {
    function handlePointerDownCapture(e) {
      const el = panelRef.current;
      if (!el) return;

      // Clique dentro do painel => ignora
      if (el.contains(e.target)) return;

      // ✅ Clique fora => fecha SEM SOM (para evitar "double click sound")
      onClose?.();
    }

    document.addEventListener("pointerdown", handlePointerDownCapture, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDownCapture, true);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className={styles.panel}
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
    >
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

      <div className={styles.grid}>
        {TIMEFRAMES.map((tf) => {
          const isActive = current === tf.value;
          return (
            <button
              key={tf.value}
              className={`${styles.tfBtn} ${isActive ? styles.active : ""}`}
              onClick={() => {
                const next = normalizeTf(tf.value);
                if (next !== current) SoundManager.uiClick();
                onSelect?.(next);
              }}
              aria-pressed={isActive}
            >
              {t(`timeframes.${tf.labelKey}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}