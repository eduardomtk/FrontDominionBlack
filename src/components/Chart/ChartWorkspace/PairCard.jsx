import React, { useMemo, useState } from "react";
import styles from "./PairCard.module.css";

function normalizeToPairsFileName(symbol) {
  return String(symbol || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\//g, "")
    .replace(/[^a-z0-9]/g, "");
}

function formatSymbolWithSlash(symbol) {
  const raw = String(symbol || "").trim().toUpperCase().replace(/\s+/g, "");
  const s = raw.replace(/\//g, "");
  if (s.length === 6) return `${s.slice(0, 3)}/${s.slice(3, 6)}`;
  return raw;
}

export default function PairCard({
  symbol,
  category,
  payout,
  active = false,
  onClick,
  hidePayout = false,
  displayName,
}) {
  const selectorMode = Boolean(hidePayout && !payout);

  const pairKey = useMemo(() => normalizeToPairsFileName(symbol), [symbol]);
  const imgSrc = useMemo(() => `/assets/pairs/${pairKey}.png`, [pairKey]);

  const displaySymbol = useMemo(() => {
    if (displayName && String(displayName).trim()) return String(displayName).trim();
    return formatSymbolWithSlash(symbol);
  }, [symbol, displayName]);

  const [iconOk, setIconOk] = useState(true);

  const isCrypto = String(category || "").toUpperCase() === "CRYPTO";
  const isBTC = pairKey === "btcusd";
  const cryptoUpright = Boolean(isCrypto && !isBTC);

  return (
    <div
      className={`${styles.card} ${active ? styles.active : ""} ${
        selectorMode ? styles.selectorMode : ""
      } ${cryptoUpright ? styles.cryptoUpright : ""}`}
      onClick={onClick}
    >
      <div className={`${styles.topRow} ${selectorMode ? styles.topRowSelector : ""}`}>
        <div className={styles.symbolWrap}>
          {iconOk ? (
            <span className={styles.pairIcon} aria-hidden="true">
              <img
                className={styles.pairIconImg}
                src={imgSrc}
                alt=""
                loading="lazy"
                draggable={false}
                onError={() => setIconOk(false)}
              />
            </span>
          ) : (
            <span className={`${styles.pairIcon} ${styles.pairIconFallback}`} aria-hidden="true" />
          )}

          <span className={styles.symbol}>{displaySymbol}</span>
        </div>

        {!selectorMode && category ? <span className={styles.category}>{category}</span> : null}
      </div>

      <div className={`${styles.bottomRow} ${selectorMode ? styles.bottomRowSelector : ""}`}>
        <span className={`${styles.payout} ${hidePayout ? styles.payoutHidden : ""}`}>
          +{payout}%
        </span>
      </div>
    </div>
  );
}