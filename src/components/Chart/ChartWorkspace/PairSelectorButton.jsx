import React from "react";
import { usePairUI } from "../../../context/PairUIContext";
import SoundManager from "@/sound/SoundManager.js";

const PairSelectorButton = () => {
  const { symbol, openPairPanelFromChart } = usePairUI();

  const formatSymbol = (sym) => {
    if (!sym) return "---";
    const s = sym.toUpperCase().replace("/", "");
    if (s.length === 6) return `${s.slice(0, 3)}/${s.slice(3, 6)}`;
    return s;
  };

  const getPairKey = (sym) => {
    if (!sym) return "";
    return sym.toLowerCase().replace("/", "").trim();
  };

  const getPairIconSrc = (sym) => {
    const key = getPairKey(sym);
    if (!key) return null;
    return `/assets/pairs/${key}.png`;
  };

  const getCategoryLabel = (sym) => {
    if (!sym) return "";
    const s = sym.toUpperCase().replace("/", "").trim();

    // Metais
    if (s.startsWith("XAU") || s.startsWith("XAG") || s.includes("XAU") || s.includes("XAG")) {
      return "Metais";
    }

    // Cripto
    const cryptos = [
      "BTC","ETH","BNB","SOL","XRP","ADA","DOGE","TRX","TON","AVAX","DOT","LINK","LTC","BCH",
      "MATIC","ATOM","FIL","UNI","APT","ARB","OP","NEAR","AAVE","SUI","PEPE","SHIB","FLOKI",
    ];

    const base3 = s.slice(0, 3);
    if (cryptos.includes(base3) || cryptos.some((c) => s.startsWith(c))) return "Cripto";

    return "Forex";
  };

  const handleClick = (e) => {
    e.stopPropagation();
    SoundManager.uiClick();
    openPairPanelFromChart();
  };

  const iconSrc = getPairIconSrc(symbol);
  const category = getCategoryLabel(symbol);

  return (
    <button className="pair-selector-button" onClick={handleClick}>
      {iconSrc ? (
        <img
          className="pair-icon"
          src={iconSrc}
          alt=""
          draggable={false}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : null}

      <span className="pair-text">
        <span className="current-pair">{formatSymbol(symbol)}</span>
        <span className="pair-category">{category}</span>
      </span>

      <span className="arrow">▼</span>

      <style>{`
        .pair-selector-button {
          position: absolute;
          top: 6px;
          left: 6px;
          z-index: 10;

          /* ✅ GHOST (sem cara de botão) */
          background: transparent;
          border: none;
          box-shadow: none;
          backdrop-filter: none;

          padding: 4px 6px;
          border-radius: 8px;

          display: flex;
          align-items: center;
          gap: 10px;

          cursor: pointer;
          color: rgba(255, 255, 255, 0.92);

          transition: background 0.18s ease, transform 0.15s ease;
        }

        /* hover mínimo, sem “botão” */
        .pair-selector-button:hover {
          background: rgba(255, 255, 255, 0.035);
          transform: translateY(-1px);
        }

        /* ✅ ÍCONE MUITO MAIOR (dominante) */
        .pair-icon {
          width: 34px;
          height: 30px;
          object-fit: contain;
          display: block;

          pointer-events: none;
          user-select: none;

          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35));
        }

        .pair-text {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          line-height: 1.05;
          pointer-events: none;
        }

        .current-pair {
          font-weight: 700;
          font-size: 14px;
          letter-spacing: 0.4px;
          text-shadow: 0 1px 2px rgba(0,0,0,0.35);
        }

        .pair-category {
          margin-top: 3px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.9px;
          color: rgba(255,255,255,0.45);

          /* ✅ AJUSTE: igual ao header (sem UPPERCASE forçado) */
          text-transform: none;
        }

        .arrow {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.45);
          transition: transform 0.2s ease, color 0.2s ease;
          pointer-events: none;
        }

        .pair-selector-button:hover .arrow {
          color: #00c176;
          transform: translateY(1px);
        }
      `}</style>
    </button>
  );
};

export default PairSelectorButton;