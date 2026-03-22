import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTrade } from "../../../context/TradeContext";
import styles from "./TradeHistory.module.css";
import SoundManager from "@/sound/SoundManager.js";
// ✅ i18n
import { useTranslation } from "react-i18next";

// ✅ eventos globais
const OVERLAY_OPEN_EVENT = "tradepro:overlay-open";
const OVERLAY_CLOSE_EVENT = "tradepro:overlay-close";

// ✅ reserva de altura da bottom bar (hora atual / som / fullscreen)
const BOTTOM_BAR_PX = 26;

export default function TradeHistory({ onClose, onOpenSummary }) {
  const { t } = useTranslation("tradeHistory");
  const { trades } = useTrade();

  const portalTarget = useMemo(() => {
    if (typeof document === "undefined") return null;
    return (
      document.getElementById("trading-overlay-host") ||
      document.getElementById("overlay-root") ||
      document.body
    );
  }, []);

  const isInTradingHost = useMemo(() => {
    return Boolean(portalTarget && portalTarget.id === "trading-overlay-host");
  }, [portalTarget]);

  const formatShortDateTime = (timestamp) => {
    const ms = Number(timestamp);
    if (!Number.isFinite(ms) || ms <= 0) return { date: "---", time: "---" };

    const d = new Date(ms);
    if (isNaN(d.getTime())) return { date: "---", time: "---" };

    const day = String(d.getDate()).padStart(2, "0");

    const monthKeys = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monthKey = monthKeys[d.getMonth()];
    const mon = t(`months.${monthKey}`) || "---";

    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");

    return { date: `${day} ${mon}`, time: `${hh}:${mm}` };
  };

  function detectMarketLabel(tradeItem, translateFn) {
    const raw = String(tradeItem?.asset || tradeItem?.symbol || "").toUpperCase().trim();
    if (raw.includes("/")) return translateFn("market.forex");

    const pair = raw.replace("/", "").replace(/\s+/g, "");
    const base = pair.slice(0, 3);

    const CRYPTO_BASES = new Set([
      "BTC", "ETH", "XRP", "LTC", "BCH", "ADA", "SOL", "DOG", "BNB", "TRX",
      "AVA", "LIN", "DOT", "MAT", "TON", "SHI",
    ]);

    if (pair.length === 6 && CRYPTO_BASES.has(base)) return translateFn("market.crypto");
    if (pair.length === 6) return translateFn("market.forex");
    return translateFn("market.crypto");
  }

  function detectMarketKind(tradeItem) {
    const raw = String(tradeItem?.asset || tradeItem?.symbol || "").toUpperCase().trim();
    if (raw.includes("/")) return "FOREX";

    const pair = raw.replace("/", "").replace(/\s+/g, "");
    const base = pair.slice(0, 3);

    const CRYPTO_BASES = new Set([
      "BTC", "ETH", "XRP", "LTC", "BCH", "ADA", "SOL", "DOG", "BNB", "TRX",
      "AVA", "LIN", "DOT", "MAT", "TON", "SHI",
    ]);

    if (pair.length === 6) return CRYPTO_BASES.has(base) ? "CRYPTO" : "FOREX";
    return "CRYPTO";
  }

  function formatAssetLabel(raw) {
    const s = String(raw || "---").toUpperCase().trim().replace(/\s+/g, "");
    if (s.includes("/")) return s;
    if (s.length === 6) return `${s.slice(0, 3)}/${s.slice(3, 6)}`;
    return s;
  }

  function formatBRL(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "---";
    return n.toFixed(2);
  }

  function getPairKey(raw) {
    const s = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/\//g, "")
      .replace(/[^a-z0-9]/g, "");
    return s;
  }

  function getPairIconSrc(raw) {
    const key = getPairKey(raw);
    if (!key) return null;
    return `/assets/pairs/${key}.png`;
  }

  const handleClose = () => {
    SoundManager.uiClick?.();

    window.dispatchEvent(new CustomEvent(OVERLAY_CLOSE_EVENT, { detail: { id: "history" } }));

    onClose?.();
  };

  const handleOpenSummary = () => {
    SoundManager.uiClick?.();
    onOpenSummary?.();
  };

  useEffect(() => {
    const myId = "history";

    const onOtherOpen = (e) => {
      const otherId = e?.detail?.id;
      if (!otherId) return;
      if (otherId !== myId) handleClose();
    };

    window.addEventListener(OVERLAY_OPEN_EVENT, onOtherOpen);
    window.dispatchEvent(new CustomEvent(OVERLAY_OPEN_EVENT, { detail: { id: myId } }));

    return () => window.removeEventListener(OVERLAY_OPEN_EVENT, onOtherOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bottomCut = isInTradingHost ? 0 : BOTTOM_BAR_PX;

  const content = (
    <div
      style={{
        position: isInTradingHost ? "absolute" : "fixed",
        inset: 0,
        zIndex: 30000,
        pointerEvents: "none",
      }}
    >
      <div
        className={styles.backdrop}
        onClick={handleClose}
        style={{
          position: isInTradingHost ? "absolute" : "fixed",
          top: 0,
          right: 0,
          bottom: bottomCut,
          left: isInTradingHost ? 0 : 64,
          width: isInTradingHost ? "100%" : "calc(100% - 64px)",
          padding: 0,
          margin: 0,
          display: "flex",
          alignItems: "stretch",
          justifyContent: "flex-start",
          pointerEvents: "auto",
        }}
      >
        <aside
          className={styles.panel}
          onClick={(e) => e.stopPropagation()}
          style={{
            left: 0,
            top: 0,
            bottom: 0,
            height: "100%",
            marginLeft: 0,
            transform: "none",
          }}
        >
          <header className={styles.header}>
            <div className={styles.title}>{t("title")}</div>

            <div className={styles.headerActions}>
              <button
                type="button"
                className={`${styles.hdrBtn} ${styles.hdrBtnDoc}`}
                onClick={handleOpenSummary}
                title={t("actions.report")}
                aria-label={t("actions.report")}
              >
                <svg viewBox="0 0 24 24" className={styles.hdrIcon} aria-hidden="true">
                  <path
                    d="M7 3h7l3 3v15H7V3z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M14 3v4h4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 14h6M9 17h6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              <button
                type="button"
                className={`${styles.hdrBtn} ${styles.hdrBtnClose}`}
                onClick={handleClose}
                title={t("actions.close")}
                aria-label={t("actions.close")}
              >
                <svg viewBox="0 0 24 24" className={styles.hdrIcon} aria-hidden="true">
                  <path
                    d="M7 7l10 10M17 7L7 17"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </header>

          <div className={styles.list}>
            {trades.length === 0 ? (
              <div className={styles.empty}>{t("empty")}</div>
            ) : (
              trades.map((tradeItem) => {
                const isWin = tradeItem.result === "WIN";

                const profitValue =
                  tradeItem.profit !== undefined && tradeItem.profit !== null
                    ? tradeItem.profit
                    : tradeItem.amount * (tradeItem.payout || 0);

                const tsRaw =
                  tradeItem.timestamp ??
                  tradeItem.closedAt ??
                  tradeItem.expiresAt ??
                  tradeItem.expirationTime ??
                  tradeItem.expirationTime ??
                  null;

                const dateTime = formatShortDateTime(tsRaw);

                const key = String(
                  tradeItem.id ?? tradeItem.tradeId ?? `${tsRaw}-${tradeItem.symbol || tradeItem.asset || "trade"}`
                );

                const rawAsset = tradeItem.asset || tradeItem.symbol || "---";
                const assetLabel = formatAssetLabel(rawAsset);

                const marketLabel = detectMarketLabel(tradeItem, t);

                const marketKind = detectMarketKind(tradeItem);
                const isForex = marketKind === "FOREX";

                const iconSrc = getPairIconSrc(rawAsset);

                const isCall = tradeItem.direction === "CALL";
                const directionLabel = isCall ? t("direction.call") : t("direction.put");

                const amountText = `${isWin ? "+" : "-"} R$ ${formatBRL(
                  Math.abs(isWin ? profitValue : tradeItem.amount)
                )}`;
                const stakeText = `R$ ${formatBRL(tradeItem.amount)}`;

                return (
                  <div key={key} className={styles.item}>
                    <div className={styles.leftCol}>
                      <div className={styles.time}>{dateTime.time}</div>
                      <div className={styles.date}>{dateTime.date}</div>
                    </div>

                    <div className={styles.midCol}>
                      <div className={styles.assetRow}>
                        <div
                          className={`${styles.assetIcon} ${isForex ? styles.assetIconForex : styles.assetIconRound}`}
                          aria-hidden="true"
                        >
                          {iconSrc ? (
                            <img
                              className={`${styles.assetIconImg} ${
                                isForex ? styles.assetIconImgForex : styles.assetIconImgRound
                              }`}
                              src={iconSrc}
                              alt=""
                              draggable={false}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : null}
                        </div>

                        <div className={styles.assetTexts}>
                          <div className={styles.assetName}>{assetLabel}</div>
                          <div className={styles.assetType}>{marketLabel}</div>
                        </div>
                      </div>
                    </div>

                    <div className={styles.rightCol}>
                      <div className={styles.amountTop}>
                        <span className={`${styles.amount} ${isWin ? styles.amountWin : styles.amountLoss}`}>
                          {amountText}
                        </span>
                      </div>

                      <div className={styles.metaBottom}>
                        <span className={styles.grayArrow} aria-label={directionLabel}>
                          {isCall ? "▴" : "▾"}
                        </span>
                        <span className={styles.stake}>{stakeText}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  );

  if (!portalTarget) return content;
  return createPortal(content, portalTarget);
}