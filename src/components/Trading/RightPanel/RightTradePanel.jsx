import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./RightTradePanel.module.css";

import { useTrade } from "../../../context/TradeContext";
import { useBalance } from "../../../context/BalanceContext";
import { useAccount } from "../../../context/AccountContext";
import { usePairUI } from "../../../context/PairUIContext";

import { useMarketStore } from "../../../stores/market.store";

import ActiveTradesPanel from "../../trades/ActiveTradesPanel";

import SoundManager from "@/sound/SoundManager.js";
import { useMarketConfigs } from "@/context/MarketConfigContext";
import { useMaintenance } from "@/context/MaintenanceContext";
import { useTranslation } from "react-i18next";

const EXPIRATION_SECONDS = {
  M1: 60,
  M5: 300,
  M15: 900,
};

const DEFAULT_AMOUNT = 20;
const MIN_AMOUNT = 5;
const MAX_AMOUNT = 5000;
const MIN_LEAD_SECONDS = 30;

function normalizePair(pair) {
  return String(pair || "").replace("/", "").toUpperCase().trim();
}

function normalizeTf(tf) {
  const s = String(tf || "").trim().toUpperCase();
  if (s === "M1" || s === "M5" || s === "M15" || s === "M30" || s === "H1") return s;
  return "M1";
}

function toMsMaybe(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n < 1e11 ? n * 1000 : n;
}

function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function calcAlignedExpiryMs(nowMs, tfMs, minLeadMs) {
  const t = Number(nowMs);
  const tf = Number(tfMs);
  const lead = Number(minLeadMs);

  if (!Number.isFinite(t) || !Number.isFinite(tf) || tf <= 0 || !Number.isFinite(lead) || lead < 0) {
    return Date.now() + 60_000;
  }

  const bucketStartMs = Math.floor(t / tf) * tf;
  let closeMs = bucketStartMs + tf;
  const remainingMs = closeMs - t;
  const remainingWholeSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const leadWholeSeconds = Math.max(0, Math.floor(lead / 1000));

  // ✅ Regra da corretora:
  // - enquanto o cronômetro ainda mostra 31, continua na vela atual
  // - no primeiro instante em que passa a mostrar 30.xxx, já vai para a próxima vela
  if (remainingWholeSeconds <= leadWholeSeconds) {
    closeMs += tf;
  }

  return closeMs;
}

function isMobilePortraitViewport() {
  if (typeof window === "undefined") return false;

  try {
    return window.matchMedia("(max-width: 768px) and (orientation: portrait)").matches;
  } catch {
    const w = Number(window.innerWidth || 0);
    const h = Number(window.innerHeight || 0);
    return w > 0 && h > 0 && w <= 768 && h >= w;
  }
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.clockIcon} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5v5l3.5 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CallIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.tradeBtnIcon} aria-hidden="true">
      <path
        d="M4 16.5l4.3-4.3 3.1 3.1 5.8-7.1 2.8 2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.8 7.9H20v3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PutIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.tradeBtnIcon} aria-hidden="true">
      <path
        d="M4 8.5l4.3 4.3 3.1-3.1 5.8 7.1 2.8-2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.8 16.1H20v-3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatShortDateTime(timestamp, tTradeHistory) {
  const ms = Number(timestamp);
  if (!Number.isFinite(ms) || ms <= 0) return { date: "---", time: "---" };

  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return { date: "---", time: "---" };

  const day = String(d.getDate()).padStart(2, "0");
  const monthKeys = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const monthKey = monthKeys[d.getMonth()];
  const mon = tTradeHistory(`months.${monthKey}`) || "---";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  return { date: `${day} ${mon}`, time: `${hh}:${mm}` };
}

function detectMarketLabel(tradeItem, tTradeHistory) {
  const raw = String(tradeItem?.asset || tradeItem?.symbol || "").toUpperCase().trim();
  if (raw.includes("/")) return tTradeHistory("market.forex");

  const pair = raw.replace("/", "").replace(/\s+/g, "");
  const base = pair.slice(0, 3);

  const CRYPTO_BASES = new Set([
    "BTC",
    "ETH",
    "XRP",
    "LTC",
    "BCH",
    "ADA",
    "SOL",
    "DOG",
    "BNB",
    "TRX",
    "AVA",
    "LIN",
    "DOT",
    "MAT",
    "TON",
    "SHI",
  ]);

  if (pair.length === 6 && CRYPTO_BASES.has(base)) return tTradeHistory("market.crypto");
  if (pair.length === 6) return tTradeHistory("market.forex");
  return tTradeHistory("market.crypto");
}

function detectMarketKind(tradeItem) {
  const raw = String(tradeItem?.asset || tradeItem?.symbol || "").toUpperCase().trim();
  if (raw.includes("/")) return "FOREX";

  const pair = raw.replace("/", "").replace(/\s+/g, "");
  const base = pair.slice(0, 3);

  const CRYPTO_BASES = new Set([
    "BTC",
    "ETH",
    "XRP",
    "LTC",
    "BCH",
    "ADA",
    "SOL",
    "DOG",
    "BNB",
    "TRX",
    "AVA",
    "LIN",
    "DOT",
    "MAT",
    "TON",
    "SHI",
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
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\//g, "")
    .replace(/[^a-z0-9]/g, "");
}

function getPairIconSrc(raw) {
  const key = getPairKey(raw);
  if (!key) return null;
  return `/assets/pairs/${key}.png`;
}

const RightTradePanel = ({ onHoverAction }) => {
  const { t } = useTranslation(["trade", "common"]);
  const { t: tTradeHistory } = useTranslation("tradeHistory");

  const [time, setTime] = useState("M1");
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [mobileTab, setMobileTab] = useState("operation");

  const { openTrade, activeTrades, maxTrades, trades } = useTrade();
  const { balance } = useBalance();
  const { accountType } = useAccount();

  const { symbol: uiSymbol, timeframe: chartTf } = usePairUI();
  const symbol = normalizePair(uiSymbol);
  const tf = normalizeTf(chartTf);

  const { getPayoutRate, getOpenState } = useMarketConfigs();
  const { tradingLocked, enabled: maintenanceEnabled, message: maintenanceMessage } = useMaintenance();

  const clickLockRef = useRef(false);

  const pairData = useMarketStore((state) => {
    const key = symbol && tf ? `${symbol}|${tf}` : "";
    return key ? state.pairs[key] : null;
  });

  const lastPrice = useMemo(() => {
    const tick = pairData?.lastTick?.bid;
    if (Number.isFinite(Number(tick))) return Number(tick);

    const live = pairData?.liveCandle?.close;
    if (Number.isFinite(Number(live))) return Number(live);

    const candles = pairData?.candles;
    if (Array.isArray(candles) && candles.length) {
      const last = candles[candles.length - 1];
      const close = last?.close;
      if (Number.isFinite(Number(close))) return Number(close);
    }

    return null;
  }, [pairData]);

  const payout = useMemo(() => {
    if (!symbol) return 0.7;
    return clamp(getPayoutRate(symbol, 0.92), 0, 1);
  }, [symbol, getPayoutRate]);

  const openState = useMemo(() => {
    if (!symbol) return { isOpen: true, reason: "default" };
    return getOpenState(symbol);
  }, [symbol, getOpenState]);

  const isMarketOpen = Boolean(openState?.isOpen);

  const amt = Number(amount);
  const amtFinite = Number.isFinite(amt) ? amt : 0;

  const isBelowMin = amtFinite > 0 && amtFinite < MIN_AMOUNT;
  const isAboveMax = amtFinite > MAX_AMOUNT;
  const isInvalidAmount = !Number.isFinite(amt) || amtFinite <= 0 || isBelowMin || isAboveMax;

  const amountMsg = useMemo(() => {
    if (!Number.isFinite(amt) || amtFinite <= 0) return t("trade:amount_invalid");
    if (isBelowMin) return t("trade:amount_min", { min: MIN_AMOUNT });
    if (isAboveMax) return t("trade:amount_max", { max: MAX_AMOUNT });
    return "";
  }, [amt, amtFinite, isBelowMin, isAboveMax, t]);

  const profit = amtFinite * payout;

  const getServerNowMs = useMarketStore((state) => state.getServerNowMs);

  function getNowMsSoberano() {
    try {
      const now = Number(getServerNowMs?.());
      if (Number.isFinite(now) && now > 0) return now;
    } catch {}

    const lt = pairData?.lastTick;
    const ms1 = toMsMaybe(lt?.serverTime);
    const ms2 = toMsMaybe(lt?.time ?? lt?.t);
    const fallback = Number.isFinite(ms1) ? ms1 : Number.isFinite(ms2) ? ms2 : null;
    if (Number.isFinite(fallback)) return fallback;

    return Date.now();
  }

  useEffect(() => {
    const tick = () => setCountdownNow(getNowMsSoberano());
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [time, getServerNowMs, pairData?.lastTick?.serverTime, pairData?.lastTick?.time, pairData?.lastTick?.t]);

  const countdownLabel = useMemo(() => {
    const tfSec = EXPIRATION_SECONDS[time] || 60;
    const tfMs = tfSec * 1000;
    const minLeadMs = MIN_LEAD_SECONDS * 1000;
    const expiryMs = calcAlignedExpiryMs(countdownNow, tfMs, minLeadMs);
    return formatCountdown(Math.max(0, expiryMs - countdownNow));
  }, [countdownNow, time]);

  const closedTrades = useMemo(() => {
    if (!Array.isArray(trades)) return [];
    return [...trades].reverse();
  }, [trades]);

  function playMobilePortraitTabClick() {
    if (!isMobilePortraitViewport()) return;
    SoundManager.uiClick?.();
  }

  function handleMobileTabChange(nextTab) {
    if (mobileTab !== nextTab) {
      playMobilePortraitTabClick();
    }
    setMobileTab(nextTab);
  }

  function handleTrade(direction) {
    if (tradingLocked) {
      console.warn("[MAINTENANCE] Trading locked:", maintenanceMessage);
      return;
    }

    if (!isMarketOpen) {
      console.warn("[MARKET] Closed:", { symbol, reason: openState?.reason });
      SoundManager.uiClick?.();
      return;
    }

    if (clickLockRef.current) return;

    SoundManager.tradeClick?.();

    clickLockRef.current = true;
    setTimeout(() => {
      clickLockRef.current = false;
    }, 220);

    if (!lastPrice) {
      console.warn("Preço atual indisponível");
      return;
    }

    if (activeTrades.length >= maxTrades) {
      console.warn("Número máximo de trades ativos atingido");
      return;
    }

    if (isInvalidAmount) {
      console.warn(amountMsg || "Valor inválido");
      return;
    }

    if (balance < amtFinite) {
      console.warn("Saldo insuficiente");
      return;
    }

    const nowMs = getNowMsSoberano();
    const tfSec = EXPIRATION_SECONDS[time] || 60;
    const tfMs = tfSec * 1000;
    const minLeadMs = MIN_LEAD_SECONDS * 1000;
    const expirationTime = calcAlignedExpiryMs(nowMs, tfMs, minLeadMs);

    openTrade({
      direction,
      amount: amtFinite,
      payout,
      expirationTime,
      expirationLabel: time,
      timeframe: time,
      openPrice: lastPrice,
      account: accountType,
      status: "OPEN",
      symbol,
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });
  }

  const buttonsDisabled =
    tradingLocked ||
    !isMarketOpen ||
    !lastPrice ||
    activeTrades.length >= maxTrades ||
    balance < amtFinite ||
    isInvalidAmount;

  return (
    <div className={styles.panel} style={{ position: "relative" }}>
      <div className={styles.mobileTabs}>
        <button
          type="button"
          className={`${styles.mobileTabBtn} ${mobileTab === "operation" ? styles.mobileTabBtnActive : ""}`}
          onClick={() => handleMobileTabChange("operation")}
        >
          Operação
        </button>

        <button
          type="button"
          className={`${styles.mobileTabBtn} ${mobileTab === "open" ? styles.mobileTabBtnActive : ""}`}
          onClick={() => handleMobileTabChange("open")}
        >
          Abertas {activeTrades.length > 0 ? `(${activeTrades.length})` : ""}
        </button>

        <button
          type="button"
          className={`${styles.mobileTabBtn} ${mobileTab === "closed" ? styles.mobileTabBtnActive : ""}`}
          onClick={() => handleMobileTabChange("closed")}
        >
          Fechadas
        </button>
      </div>

      <div className={styles.desktopTradeContent}>
        <div className={styles.topControls}>
          <div className={styles.controlGroup}>
            <label className={styles.label}>{t("trade:expiry_time")}</label>
            <div className={styles.timeButtons}>
              {["M1", "M5", "M15"].map((tKey) => (
                <button
                  key={tKey}
                  className={`${styles.timeBtn} ${time === tKey ? styles.active : ""}`}
                  onClick={() => {
                    if (time !== tKey) SoundManager.uiClick();
                    setTime(tKey);
                  }}
                  disabled={tradingLocked}
                  title={tradingLocked ? t("trade:maintenance_title") : ""}
                >
                  {tKey}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.label}>{t("trade:trade_amount")}</label>
            <div className={styles.inputWrapper}>
              <button
                className={styles.mathBtn}
                onClick={() => {
                  SoundManager.uiClick();
                  const next = Math.max(MIN_AMOUNT, amtFinite - 10);
                  setAmount(next);
                }}
                disabled={tradingLocked}
                title={tradingLocked ? t("trade:maintenance_title") : ""}
              >
                −
              </button>

              <input
                type="number"
                className={styles.valueInput}
                value={amount}
                min={MIN_AMOUNT}
                max={MAX_AMOUNT}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") {
                    setAmount("");
                    return;
                  }
                  setAmount(Number(v));
                }}
                disabled={tradingLocked}
                title={tradingLocked ? t("trade:maintenance_title") : ""}
              />

              <button
                className={styles.mathBtn}
                onClick={() => {
                  SoundManager.uiClick();
                  const next = (Number.isFinite(amt) ? amt : 0) + 10;
                  setAmount(next);
                }}
                disabled={tradingLocked}
                title={tradingLocked ? t("trade:maintenance_title") : ""}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className={styles.payoutSection}>
          <div className={styles.payoutNeon}>
            <div className={styles.glowBadge}>{t("trade:yield")}</div>
            <div className={styles.percentageText}>+{Math.round(payout * 100)}%</div>
          </div>
          <div className={styles.profitDisplay}>
            <span className={styles.currencySymbol}>R$</span>
            <span className={styles.profitAmount}>{profit.toFixed(2)}</span>
          </div>
        </div>

        <div className={styles.actionButtons}>
          <button
            className={styles.callButton}
            onMouseEnter={() => onHoverAction?.("CALL")}
            onMouseLeave={() => onHoverAction?.(null)}
            onClick={() => handleTrade("CALL")}
            disabled={buttonsDisabled}
            title={tradingLocked ? t("trade:maintenance_title") : ""}
          >
            Comprar ▲
          </button>

          <button
            className={styles.putButton}
            onMouseEnter={() => onHoverAction?.("PUT")}
            onMouseLeave={() => onHoverAction?.(null)}
            onClick={() => handleTrade("PUT")}
            disabled={buttonsDisabled}
            title={tradingLocked ? t("trade:maintenance_title") : ""}
          >
            Vender ▼
          </button>

          {maintenanceEnabled && tradingLocked ? (
            <div className={styles.validationMsg}>
              {maintenanceMessage || t("trade:maintenance_blocked")}
            </div>
          ) : !isMarketOpen ? (
            <div className={styles.validationMsg}>
              {t("trade:market_closed", { defaultValue: "Mercado fechado" })}
            </div>
          ) : amountMsg ? (
            <div className={styles.validationMsg}>{amountMsg}</div>
          ) : null}
        </div>

        <ActiveTradesPanel />
      </div>

      <div className={styles.mobileOnlyContent}>
        {mobileTab === "operation" && (
          <div className={styles.mobileOperationPane}>
            <div className={styles.mobileControlsRow}>
              <div className={styles.mobileControlBlock}>
                <div className={styles.mobileMiniLabel}>Tempo</div>
                <div className={styles.timeButtons}>
                  {["M1", "M5", "M15"].map((tKey) => (
                    <button
                      key={tKey}
                      className={`${styles.timeBtn} ${time === tKey ? styles.active : ""}`}
                      onClick={() => {
                        if (time !== tKey) SoundManager.uiClick();
                        setTime(tKey);
                      }}
                      disabled={tradingLocked}
                    >
                      {tKey}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.mobileControlBlock}>
                <div className={styles.mobileMiniLabel}>Valor</div>
                <div className={styles.inputWrapper}>
                  <button
                    className={styles.mathBtn}
                    onClick={() => {
                      SoundManager.uiClick();
                      const next = Math.max(MIN_AMOUNT, amtFinite - 10);
                      setAmount(next);
                    }}
                    disabled={tradingLocked}
                  >
                    −
                  </button>

                  <input
                    type="number"
                    className={styles.valueInput}
                    value={amount}
                    min={MIN_AMOUNT}
                    max={MAX_AMOUNT}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") {
                        setAmount("");
                        return;
                      }
                      setAmount(Number(v));
                    }}
                    disabled={tradingLocked}
                  />

                  <button
                    className={styles.mathBtn}
                    onClick={() => {
                      SoundManager.uiClick();
                      const next = (Number.isFinite(amt) ? amt : 0) + 10;
                      setAmount(next);
                    }}
                    disabled={tradingLocked}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.mobileSummaryBar}>
              <div className={styles.mobileSummaryCellLeft}>
                <div className={styles.mobileTimerChip}>
                  <ClockIcon />
                  <span className={styles.mobileTimerValue}>{countdownLabel}</span>
                </div>
              </div>

              <div className={styles.mobileSummaryCellCenter}>
                <span className={styles.mobileSummaryLabel}>Lucro</span>
                <span className={styles.mobileSummaryPercent}>+{Math.round(payout * 100)}%</span>
              </div>

              <div className={styles.mobileSummaryCellRight}>
                <span className={styles.mobileSummaryAmount}>R$ {profit.toFixed(2)}</span>
              </div>
            </div>

            <div className={styles.actionButtonsMobile}>
              <button
                className={styles.callButton}
                onMouseEnter={() => onHoverAction?.("CALL")}
                onMouseLeave={() => onHoverAction?.(null)}
                onClick={() => handleTrade("CALL")}
                disabled={buttonsDisabled}
              >
                <CallIcon />
                <span>Comprar</span>
              </button>

              <button
                className={styles.putButton}
                onMouseEnter={() => onHoverAction?.("PUT")}
                onMouseLeave={() => onHoverAction?.(null)}
                onClick={() => handleTrade("PUT")}
                disabled={buttonsDisabled}
              >
                <PutIcon />
                <span>Vender</span>
              </button>
            </div>

            {maintenanceEnabled && tradingLocked ? (
              <div className={styles.validationMsgMobile}>
                {maintenanceMessage || t("trade:maintenance_blocked")}
              </div>
            ) : !isMarketOpen ? (
              <div className={styles.validationMsgMobile}>
                {t("trade:market_closed", { defaultValue: "Mercado fechado" })}
              </div>
            ) : amountMsg ? (
              <div className={styles.validationMsgMobile}>{amountMsg}</div>
            ) : null}
          </div>
        )}

        {mobileTab === "open" && (
          <div className={styles.mobilePanelTabBody}>
            <ActiveTradesPanel />
            {activeTrades.length === 0 && <div className={styles.mobileEmptyState}>Nenhuma operação aberta</div>}
          </div>
        )}

        {mobileTab === "closed" && (
          <div className={styles.mobileHistoryPane}>
            {closedTrades.length === 0 ? (
              <div className={styles.mobileEmptyState}>{tTradeHistory("empty")}</div>
            ) : (
              <div className={styles.mobileHistoryList}>
                {closedTrades.map((tradeItem) => {
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
                    null;

                  const dateTime = formatShortDateTime(tsRaw, tTradeHistory);

                  const key = String(
                    tradeItem.id ?? tradeItem.tradeId ?? `${tsRaw}-${tradeItem.symbol || tradeItem.asset || "trade"}`
                  );

                  const rawAsset = tradeItem.asset || tradeItem.symbol || "---";
                  const assetLabel = formatAssetLabel(rawAsset);
                  const marketLabel = detectMarketLabel(tradeItem, tTradeHistory);
                  const marketKind = detectMarketKind(tradeItem);
                  const isForex = marketKind === "FOREX";
                  const iconSrc = getPairIconSrc(rawAsset);
                  const isCall = tradeItem.direction === "CALL";

                  const amountText = `${isWin ? "+" : "-"} R$ ${formatBRL(
                    Math.abs(isWin ? profitValue : tradeItem.amount)
                  )}`;

                  return (
                    <div key={key} className={styles.mobileHistoryItem}>
                      <div className={styles.mobileHistoryLeft}>
                        <div className={styles.mobileHistoryTime}>{dateTime.time}</div>
                        <div className={styles.mobileHistoryDate}>{dateTime.date}</div>
                      </div>

                      <div className={styles.mobileHistoryMid}>
                        <div
                          className={`${styles.mobileAssetIcon} ${
                            isForex ? styles.mobileAssetIconForex : styles.mobileAssetIconRound
                          }`}
                        >
                          {iconSrc ? (
                            <img
                              className={`${styles.mobileAssetIconImg} ${
                                isForex ? styles.mobileAssetIconImgForex : styles.mobileAssetIconImgRound
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

                        <div className={styles.mobileHistoryTexts}>
                          <div className={styles.mobileHistoryAsset}>{assetLabel}</div>
                          <div className={styles.mobileHistoryType}>{marketLabel}</div>
                        </div>
                      </div>

                      <div className={styles.mobileHistoryRight}>
                        <div className={`${styles.mobileHistoryAmount} ${isWin ? styles.mobileWin : styles.mobileLoss}`}>
                          {amountText}
                        </div>
                        <div className={styles.mobileHistoryMeta}>
                          <span className={styles.mobileHistoryArrow}>{isCall ? "▴" : "▾"}</span>
                          <span className={styles.mobileHistoryStake}>R$ {formatBRL(tradeItem.amount)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RightTradePanel;