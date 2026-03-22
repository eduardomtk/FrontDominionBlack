import React, { useEffect, useState } from "react";
import styles from "./LeftSidebar.module.css";
import {
  FiBarChart2,
  FiClock,
  FiCopy,
  FiTrendingUp,
  FiHeadphones,
} from "react-icons/fi";
import { FaTelegramPlane } from "react-icons/fa";

import SoundManager from "@/sound/SoundManager.js";

// ✅ i18n
import { useTranslation } from "react-i18next";

// ✅ eventos globais usados pelos overlays
const OVERLAY_OPEN_EVENT = "tradepro:overlay-open";
const OVERLAY_CLOSE_EVENT = "tradepro:overlay-close";

// ✅ FEATURE FLAG: ocultar Booster sem remover do código
// Para reativar depois: troque para true
const SHOW_BOOSTER_BUTTON = false;

const MaintenanceOverlay = ({ label }) => (
  <div className={styles.maintenanceOverlay}>{label}</div>
);

// ✅ ÍCONE BOOSTER: raio estilo FLASH (bem fino), preenchido, vermelho, glow só no raio
const BoosterBoltIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    aria-hidden="true"
    style={{ display: "block" }}
  >
    {/* glow só no raio */}
    <g
      style={{
        filter:
          "drop-shadow(0 0 3px rgba(255,43,43,0.95)) drop-shadow(0 0 9px rgba(255,43,43,0.55))",
      }}
    >
      {/* raio FINO (tipo Flash) - preenchido */}
      <polygon
        fill="#ff2b2b"
        points="
          13.6,2.2
          8.6,13.1
          11.7,13.1
          10.6,21.8
          15.7,10.2
          12.6,10.2
        "
      />
    </g>
  </svg>
);

const LeftSidebar = ({ activePanel, setActivePanel }) => {
  const { t } = useTranslation(["sidebar", "common"]);

  // ✅ fonte “real” de qual overlay está aberto
  const [overlayActiveId, setOverlayActiveId] = useState(null);

  // ✅ helpers: abrir/fechar overlays via evento global
  const emitOverlayOpen = (id) => {
    try {
      window.dispatchEvent(new CustomEvent(OVERLAY_OPEN_EVENT, { detail: { id } }));
    } catch {
      // noop: fallback silencioso
    }
  };

  const emitOverlayClose = (id) => {
    try {
      window.dispatchEvent(new CustomEvent(OVERLAY_CLOSE_EVENT, { detail: { id } }));
    } catch {
      // noop
    }
  };

  useEffect(() => {
    const onOverlayOpen = (e) => {
      const id = e?.detail?.id;
      if (!id) return;
      setOverlayActiveId(id);
    };

    const onOverlayClose = (e) => {
      const id = e?.detail?.id;

      // Se vier sem id, limpa geral (fallback seguro)
      if (!id) {
        setOverlayActiveId(null);
        return;
      }

      // Se fechou o overlay que estava ativo, limpa
      setOverlayActiveId((current) => (current === id ? null : current));
    };

    window.addEventListener(OVERLAY_OPEN_EVENT, onOverlayOpen);
    window.addEventListener(OVERLAY_CLOSE_EVENT, onOverlayClose);

    return () => {
      window.removeEventListener(OVERLAY_OPEN_EVENT, onOverlayOpen);
      window.removeEventListener(OVERLAY_CLOSE_EVENT, onOverlayClose);
    };
  }, []);

  const disabledClick = () => {
    SoundManager.uiClick();
  };

  // ✅ regra profissional:
  // - se existe overlayActiveId => ele manda no "active"
  // - se não existe overlayActiveId => usa activePanel (fluxo normal)
  const isChartActive = overlayActiveId ? false : activePanel === null;
  const isHistoryActive = overlayActiveId
    ? overlayActiveId === "history"
    : activePanel === "history";

  const isSupportActive = overlayActiveId === "support";

  return (
    <aside className={styles.sidebar}>
      <div className={styles.iconGroup}>
        <button
          className={`${styles.iconBtn} ${isChartActive ? styles.active : ""}`}
          title={t("sidebar:chart")}
          onClick={() => {
            SoundManager.uiClick?.();
            setOverlayActiveId(null);
            setActivePanel(null);
            // ✅ se tiver overlay aberto, dá um close genérico (opcional e seguro)
            emitOverlayClose(null);
          }}
        >
          <FiBarChart2 />
        </button>

        <button
          className={`${styles.iconBtn} ${isHistoryActive ? styles.active : ""}`}
          title={t("sidebar:history")}
          onClick={() => {
            SoundManager.uiClick?.();
            setOverlayActiveId("history"); // feedback instantâneo
            setActivePanel("history");
            // ✅ se o seu sistema usa overlay pra history, você pode abrir também:
            emitOverlayOpen("history");
          }}
        >
          <FiClock />
        </button>
      </div>

      <div className={styles.iconGroup}>
        {/* ✅ BOOSTER (oculto via flag, sem remover do código) */}
        {SHOW_BOOSTER_BUTTON && (
          <button
            className={styles.iconBtn}
            title={t("sidebar:booster") || "Booster"}
            onClick={() => {
              SoundManager.uiClick?.();
              // Sem lógica extra por enquanto (você não pediu)
            }}
          >
            <BoosterBoltIcon />
          </button>
        )}

        <button
          className={`${styles.iconBtn} ${styles.disabled}`}
          title={t("sidebar:tournament_maintenance")}
          onClick={disabledClick}
        >
          <FiTrendingUp />
          <MaintenanceOverlay label={t("sidebar:maintenance")} />
        </button>

        <button
          className={`${styles.iconBtn} ${styles.disabled}`}
          title={t("sidebar:copytrade_maintenance")}
          onClick={disabledClick}
        >
          <FiCopy />
          <MaintenanceOverlay label={t("sidebar:maintenance")} />
        </button>
      </div>

      <div className={styles.bottomGroup}>
        {/* ✅ SUPORTE: agora dispara overlay "support" */}
        <button
          className={`${styles.iconBtn} ${isSupportActive ? styles.active : ""}`}
          title={t("sidebar:support")}
          onClick={() => {
            SoundManager.uiClick?.();
            setOverlayActiveId("support");     // feedback instantâneo
            emitOverlayOpen("support");        // ✅ abre overlay global
          }}
        >
          <FiHeadphones />
        </button>

        <button
          className={styles.iconBtn}
          title={t("sidebar:telegram")}
          onClick={() => {
            SoundManager.uiClick?.();
            // Se você quiser abrir um overlay/externo depois, você me diz o link.
          }}
        >
          <FaTelegramPlane />
        </button>
      </div>
    </aside>
  );
};

export default LeftSidebar;