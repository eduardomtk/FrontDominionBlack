// src/components/Chart/TimeframePanel/TimeframePanelContainer.jsx
import React, { useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import TimeframePanel from "./TimeframePanel";
import { usePairUI } from "@/context/PairUIContext";

function normalizeTf(tf) {
  const s = String(tf || "").trim().toUpperCase();
  if (s === "M1" || s === "M5" || s === "M15" || s === "M30" || s === "H1") return s;
  return "M1";
}

/**
 * Container oficial do painel de timeframe:
 * - Fonte única: PairUIContext
 * - Troca timeframe real do gráfico
 * - ✅ Clique fora fecha (padrão TradeHistory - FUNCIONA 100%)
 * - ✅ Portal no overlay-host ou body
 * - ✅ ESC fecha
 */
export default function TimeframePanelContainer({ onClose }) {
  const { timeframe, setTimeframe } = usePairUI();

  // ✅ Target do portal (mesmo padrão do TradeHistory)
  const portalTarget = useMemo(() => {
    if (typeof document === "undefined") return null;
    return (
      document.getElementById("overlay-root") ||
      document.getElementById("trading-overlay-host") ||
      document.body
    );
  }, []);

  const handleSelect = useCallback(
    (tf) => {
      const next = normalizeTf(tf);
      setTimeframe(next);
      if (typeof onClose === "function") onClose();
    },
    [setTimeframe, onClose]
  );

  // ✅ ESC fecha
  useEffect(() => {
    if (!onClose) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [onClose]);

  // ✅ Clique fora fecha - BACKDROP DEDICADO (padrão TradeHistory que funciona)
  const handleBackdropClick = useCallback(
    (e) => {
      // Só fecha se clicou EXATAMENTE no backdrop (não em filhos)
      if (e.target === e.currentTarget) {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    },
    [onClose]
  );

  // ✅ Impede que cliques dentro do painel fechem
  const handlePanelClick = useCallback((e) => {
    e.stopPropagation();
  }, []);

  const content = (
    // ✅ BACKDROP: cobre tela inteira, pointer-events: auto, fecha ao clicar
    <div
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 25000,
        pointerEvents: "auto", // ✅ CRÍTICO: captura cliques
        background: "transparent", // invisível, mas clicável
      }}
    >
      {/* ✅ PAINEL: mantém posição do seu CSS original + não propaga cliques */}
      <div
        onClick={handlePanelClick}
        style={{
          position: "absolute",
          left: "65px",   // ✅ SUA POSIÇÃO ORIGINAL DO CSS
          bottom: "115px", // ✅ SUA POSIÇÃO ORIGINAL DO CSS
          pointerEvents: "auto", // ✅ permite interagir com botões
          zIndex: 1, // ✅ acima do backdrop
        }}
      >
        <TimeframePanel
          currentTf={timeframe}
          onSelect={handleSelect}
          onClose={onClose}
        />
      </div>
    </div>
  );

  if (!portalTarget) return content;
  return createPortal(content, portalTarget);
}