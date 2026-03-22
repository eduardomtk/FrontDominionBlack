import React, { useEffect, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import styles from "./CopyTradePanel.module.css";
import SoundManager from "@/sound/SoundManager.js";

import CopyTradePage from "@/pages/CopyTradePage";

function clamp(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

export default function CopyTradePanel({ isOpen, onClose }) {
  const [vars, setVars] = useState({
    "--ctp-top": "0px",
    "--ctp-left": "0px",
    "--ctp-right": "0px",
    "--ctp-bottom": "0px",
  });

  const computeBounds = useCallback(() => {
    if (typeof document === "undefined") return;

    const headerEl = document.getElementById("trading-header");
    const leftEl = document.getElementById("trading-left");
    const footerEl = document.getElementById("trading-footer-fixed");

    const headerRect = headerEl?.getBoundingClientRect?.();
    const leftRect = leftEl?.getBoundingClientRect?.();
    const footerRect = footerEl?.getBoundingClientRect?.();

    // ✅ recorte EXATO: abaixo do header e depois da sidebar
    const top = clamp(headerRect?.bottom || 0);
    const left = clamp(leftRect?.right || 0);

    // ✅ respeita footer fixo (se existir)
    const bottom = footerRect ? clamp(window.innerHeight - footerRect.top) : 0;

    // ✅ cobre toda a área até a direita (passa por cima do painel direito)
    const right = 0;

    setVars({
      "--ctp-top": `${top}px`,
      "--ctp-left": `${left}px`,
      "--ctp-right": `${right}px`,
      "--ctp-bottom": `${bottom}px`,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    computeBounds();

    const onResize = () => computeBounds();
    window.addEventListener("resize", onResize);

    // micro-ajuste pra layout que “assenta” após render
    const t = setTimeout(() => computeBounds(), 0);

    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, [isOpen, computeBounds]);

  // ✅ Se você quiser "só fecha no X" mesmo, NÃO colocamos ESC.
  // (mantive removido conforme teu pedido atual)

  const portalTarget = useMemo(() => {
    if (typeof document === "undefined") return null;
    return document.body;
  }, []);

  if (!isOpen) return null;
  if (!portalTarget) return null;

  return createPortal(
    <div className={styles.overlayArea} style={vars} role="dialog" aria-modal="false" aria-label="Copy Trade">
      <div className={styles.panel}>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={() => {
            SoundManager.uiClick();
            onClose?.();
          }}
          aria-label="Fechar"
          title="Fechar"
        >
          ✕
        </button>

        <div className={styles.body}>
          <CopyTradePage />
        </div>
      </div>
    </div>,
    portalTarget
  );
}
