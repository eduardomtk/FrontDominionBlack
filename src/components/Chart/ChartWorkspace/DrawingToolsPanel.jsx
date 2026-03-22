// src/components/Chart/ChartWorkspace/DrawingToolsPanel.jsx
import React, { useEffect, useRef } from "react";
import styles from "./DrawingToolsPanel.module.css";
import SoundManager from "@/sound/SoundManager.js";
// ✅ i18n
import { useTranslation } from "react-i18next";

const TOOLS = [
  { id: "line", labelKey: "line", icon: "╱" },
  { id: "trend", labelKey: "trend", icon: "↗" },
  { id: "horizontal", labelKey: "horizontal", icon: "―" },
  { id: "vertical", labelKey: "vertical", icon: "｜" },
  { id: "fibonacci", labelKey: "fibonacci", icon: "≡" },
  { id: "rectangle", labelKey: "rectangle", icon: "▭" },
];

export default function DrawingToolsPanel({ onSelect, onClose, activeTool, onClearAll }) {
  // ✅ Hook i18n
  const { t } = useTranslation("drawingToolsPanel");

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

      <div className={styles.grid}>
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            className={`${styles.toolBtn} ${activeTool === tool.id ? styles.active : ""}`}
            onClick={() => {
              if (activeTool !== tool.id) SoundManager.uiClick();
              onSelect?.(tool.id);
            }}
            aria-label={t(`tools.${tool.labelKey}`)}
            title={t(`tools.${tool.labelKey}`)}
          >
            <span className={styles.icon}>{tool.icon}</span>
            <span className={styles.label}>{t(`tools.${tool.labelKey}`)}</span>
          </button>
        ))}
      </div>

      <div className={styles.footer}>
        <button
          className={styles.clearAllBtn}
          onClick={() => {
            SoundManager.uiClick();
            onClearAll?.();
          }}
          aria-label={t("actions.clear_all")}
          title={t("actions.clear_all")}
        >
          {t("actions.clear_all")}
        </button>
      </div>
    </div>
  );
}