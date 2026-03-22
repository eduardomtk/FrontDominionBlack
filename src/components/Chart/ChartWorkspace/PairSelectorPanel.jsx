import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./PairSelectorPanel.module.css";
import PairCard from "./PairCard";
import { ASSET_TYPES } from "../../../engine/AssetRegistry";
import { usePairUI } from "../../../context/PairUIContext";
import SoundManager from "@/sound/SoundManager.js";

// ✅ motor central (horários + payout + realtime)
import { useMarketConfigs } from "@/context/MarketConfigContext";
// ✅ i18n
import { useTranslation } from "react-i18next";

const categories = [
  { id: "FAVORITES", labelKey: "favorites" },
  { id: ASSET_TYPES.FOREX, labelKey: "forex" },
  { id: "CRYPTO", labelKey: "crypto" },
  { id: "METALS", labelKey: "metals" },
];

// ✅ fallback (se configs ainda não carregaram)
const ALL_FOREX_PAIRS = [
  "eur/usd","gbp/usd","usd/jpy","usd/chf","aud/usd","nzd/usd","usd/cad",
  "eur/jpy","gbp/jpy","aud/jpy","cad/jpy","cad/chf","chf/jpy",
  "eur/aud","eur/gbp","eur/nzd","aud/cad","aud/chf","aud/nzd",
  "eur/cad","eur/chf","gbp/cad","gbp/chf","gbp/aud",
  "nzd/cad","nzd/chf",
];

const ALL_CRYPTO_PAIRS = [
  "btc/usd","eth/usd","ada/usd","sol/usd","xrp/usd","bnb/usd","ltc/usd",
];

// ✅ METALS (XAUUSD / XAGUSD)
const ALL_METALS_PAIRS = [
  "xau/usd",
  "xag/usd",
];

const FAVORITES_KEY = "tradepro_pair_favorites_v1";

function normalizePair(pairString) {
  return pairString.replace("/", "").toUpperCase();
}

function formatSymbolToPair(symbol) {
  const s = String(symbol || "").trim().toUpperCase().replace(/\s+/g, "");
  if (s.length === 6) {
    return `${s.slice(0, 3).toLowerCase()}/${s.slice(3).toLowerCase()}`;
  }
  return s.toLowerCase();
}

const CRYPTO_BASES = new Set([
  "BTC","ETH","ADA","SOL","XRP","BNB","LTC",
  "BCH","DOG","DOT","AVAX","MATIC","SHIB","TRX","LINK","UNI","ATOM","XLM","ETC","FIL"
]);

const METAL_BASES = new Set(["XAU", "XAG", "XPT", "XPD"]);

function inferCategoryFromSymbol(symbol) {
  const s = String(symbol || "").toUpperCase().trim();
  const base = s.slice(0, 3);
  if (METAL_BASES.has(base)) return "METALS";
  if (CRYPTO_BASES.has(base)) return "CRYPTO";
  return ASSET_TYPES.FOREX;
}

function isForexMarketOpen(now = new Date()) {
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();

  const OPEN_MIN = 21 * 60;
  const CLOSE_MIN = 17 * 60;

  if (day === 6) return false;
  if (day === 0) return minutes >= OPEN_MIN;
  if (day === 5) return minutes < CLOSE_MIN;

  return minutes < CLOSE_MIN || minutes >= OPEN_MIN;
}

function getOverlayRoot() {
  if (typeof document === "undefined") return null;

  const el = document.getElementById("overlay-root");
  if (el) return el;

  const el2 = document.getElementById("trading-overlay-host");
  if (el2) return el2;

  return document.body;
}

/* ============================================================
   ✅ ÍCONES OUTLINE (stroke)
   ============================================================ */

function IconBase({ children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      className={styles.navSvg}
    >
      {children}
    </svg>
  );
}

function StarOutlineIcon() {
  return (
    <IconBase>
      <path
        d="M12 3.2l2.8 5.76 6.36.92-4.6 4.48 1.08 6.33L12 17.9l-5.64 2.96 1.08-6.33-4.6-4.48 6.36-.92L12 3.2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </IconBase>
  );
}

function ForexProIcon() {
  return (
    <IconBase>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M3 12h18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M12 3c2.9 3 4.5 6.9 4.5 9s-1.6 6-4.5 9c-2.9-3-4.5-6.9-4.5-9s1.6-6 4.5-9z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M5.2 8.7c2.2 1.2 4.5 1.8 6.8 1.8s4.6-.6 6.8-1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M5.2 15.3c2.2-1.2 4.5-1.8 6.8-1.8s4.6.6 6.8 1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </IconBase>
  );
}

function BitcoinProIcon() {
  return (
    <IconBase>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M10.2 7.3h3.6a2.2 2.2 0 0 1 0 4.4h-3.6V7.3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M10.2 11.7h4a2.2 2.2 0 0 1 0 4.4h-4v-4.4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M9.2 6.8v10.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M14.2 6.8v10.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </IconBase>
  );
}

function MetalsProIcon() {
  return (
    <IconBase>
      <ellipse cx="12" cy="7.6" rx="6.8" ry="2.6" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M5.2 7.6v4.2c0 1.45 3.05 2.6 6.8 2.6s6.8-1.15 6.8-2.6V7.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <ellipse cx="12" cy="15.8" rx="6.8" ry="2.6" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M5.2 15.8v1.2c0 1.45 3.05 2.6 6.8 2.6s6.8-1.15 6.8-2.6v-1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </IconBase>
  );
}

function CategoryIcon({ id }) {
  switch (id) {
    case ASSET_TYPES.FOREX:
      return <ForexProIcon />;
    case "CRYPTO":
      return <BitcoinProIcon />;
    case "METALS":
      return <MetalsProIcon />;
    default:
      return null;
  }
}

function formatPayoutText(payoutPct, fallback = 92) {
  const v = payoutPct ?? fallback;

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return `${fallback}%`;
    if (s.includes("%")) return s.replace(/^\+/, "");
    const n = Number(s);
    if (Number.isFinite(n)) return `${Math.round(n)}%`;
    return `${fallback}%`;
  }

  if (typeof v === "number" && Number.isFinite(v)) return `${Math.round(v)}%`;

  return `${fallback}%`;
}

export default function PairSelectorPanel({ isOpen, onClose }) {
  const { t } = useTranslation("pairSelectorPanel");

  const [activeCategory, setActiveCategory] = useState(ASSET_TYPES.FOREX);

  const { setSymbol, addFloatingPairFromSelector, pairPanelSource } = usePairUI();
  const { configs, getConfig, getPayoutPct, getOpenState } = useMarketConfigs();
  const panelRef = useRef(null);

  const [favorites, setFavorites] = useState(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  });

  const [now, setNow] = useState(() => new Date());
  const [heartbeat, setHeartbeat] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(() => setHeartbeat((x) => (x + 1) % 1_000_000), 1000);
    return () => clearInterval(id);
  }, [isOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)));
    } catch {}
  }, [favorites]);

  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(id);
  }, [isOpen]);


  function handleSelect(pairString) {
    SoundManager.uiClick();
    const normalized = normalizePair(pairString);
    setSymbol(normalized);

    if (pairPanelSource === "header") {
      addFloatingPairFromSelector(normalized);
    }

    onClose?.();
  }

  function toggleFavorite(pairString) {
    SoundManager.uiClick();
    const normalized = normalizePair(pairString);

    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(normalized)) next.delete(normalized);
      else next.add(normalized);
      return next;
    });
  }

  const handleBackdropClick = (e) => {
    if (panelRef.current && !panelRef.current.contains(e.target)) {
      SoundManager.uiClick();
      onClose?.();
    }
  };

  // eslint-disable-next-line no-unused-vars
  const forexOpen = isForexMarketOpen(now);
  const favoritesCount = favorites.size;

  const listsByCategory = useMemo(() => {
    const hasConfigs = configs && typeof configs?.forEach === "function" && configs.size > 0;

    if (!hasConfigs) {
      return {
        [ASSET_TYPES.FOREX]: ALL_FOREX_PAIRS,
        CRYPTO: ALL_CRYPTO_PAIRS,
        METALS: ALL_METALS_PAIRS,
      };
    }

    const out = {
      [ASSET_TYPES.FOREX]: [],
      CRYPTO: [],
      METALS: [],
    };

    configs.forEach((cfg, symbol) => {
      if (cfg?.enabled === false) return;

      const cat = inferCategoryFromSymbol(symbol);
      const p = formatSymbolToPair(symbol);

      if (cat === "CRYPTO") out.CRYPTO.push(p);
      else if (cat === "METALS") out.METALS.push(p);
      else out[ASSET_TYPES.FOREX].push(p);
    });

    for (const fixedMetal of ALL_METALS_PAIRS) {
      if (!out.METALS.includes(fixedMetal)) out.METALS.push(fixedMetal);
    }

    out[ASSET_TYPES.FOREX].sort((a, b) => a.localeCompare(b));
    out.CRYPTO.sort((a, b) => a.localeCompare(b));
    out.METALS.sort((a, b) => a.localeCompare(b));

    return out;
  }, [configs]);

  const baseList = useMemo(() => {
    if (activeCategory === ASSET_TYPES.FOREX) return listsByCategory[ASSET_TYPES.FOREX] || [];
    if (activeCategory === "CRYPTO") return listsByCategory.CRYPTO || [];
    if (activeCategory === "METALS") return listsByCategory.METALS || [];

    if (activeCategory === "FAVORITES") {
      const allKnown = new Map();

      for (const p of listsByCategory[ASSET_TYPES.FOREX] || []) allKnown.set(normalizePair(p), p);
      for (const p of listsByCategory.CRYPTO || []) allKnown.set(normalizePair(p), p);
      for (const p of listsByCategory.METALS || []) allKnown.set(normalizePair(p), p);

      const favArr = Array.from(favorites).map((n) => allKnown.get(n)).filter(Boolean);

      const forex = favArr.filter((p) => (listsByCategory[ASSET_TYPES.FOREX] || []).includes(p));
      const crypto = favArr.filter((p) => (listsByCategory.CRYPTO || []).includes(p));
      const metals = favArr.filter((p) => (listsByCategory.METALS || []).includes(p));

      return [...forex, ...crypto, ...metals];
    }

    return [];
  }, [activeCategory, favorites, listsByCategory]);


  if (!isOpen) return null;

  const _hb = heartbeat;

  const portalTarget = getOverlayRoot();
  if (!portalTarget) return null;

  const headerTitle = t("header.asset", { defaultValue: "Ativo" });

  return createPortal(
    <div className={styles.backdrop} onClick={handleBackdropClick} style={{ zIndex: 30010 }}>
      <div className={styles.panel} ref={panelRef} data-origin={pairPanelSource}>
        <div className={styles.header}>
          <span className={styles.title}>{headerTitle}</span>

          <button
            className={styles.closeBtn}
            onClick={() => {
              SoundManager.uiClick();
              onClose?.();
            }}
            aria-label={t("actions.close")}
            title={t("actions.close")}
          >
            ✕
          </button>
        </div>

        <div className={styles.body}>
          <aside className={styles.sideNav}>
            <div className={styles.categoriesVertical}>
              {categories.map((cat) => {
                const isActive = activeCategory === cat.id;

                const label =
                  cat.id === "FAVORITES" ? "Favoritos" : t(`categories.${cat.labelKey}`);

                return (
                  <button
                    key={cat.id}
                    className={isActive ? styles.navBtnActive : styles.navBtn}
                    onClick={() => {
                      if (!isActive) SoundManager.uiClick();
                      setActiveCategory(cat.id);
                    }}
                    title={label}
                    aria-label={label}
                  >
                    <span className={styles.navIcon} aria-hidden="true">
                      {cat.id === "FAVORITES" ? <StarOutlineIcon /> : <CategoryIcon id={cat.id} />}
                    </span>

                    <span className={styles.navLabel}>{label}</span>

                    {cat.id === "FAVORITES" && favoritesCount > 0 && (
                      <span className={styles.favBadge}>{favoritesCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>

          <section className={styles.main}>
            <div className={styles.listContainer}>
              {activeCategory === "METALS" && (listsByCategory.METALS || []).length === 0 ? (
                <div className={styles.empty}>{t("empty.metals")}</div>
              ) : activeCategory === "FAVORITES" && favoritesCount === 0 ? (
                <div className={styles.empty}>
                  {t("empty.favorites").split("\n").map((line, i) => (
                    <React.Fragment key={i}>
                      {line}
                      {i < 1 && <br />}
                    </React.Fragment>
                  ))}
                </div>
              ) : baseList.length === 0 ? (
                <div className={styles.empty}>
                  {t("empty.no_results", { query: "" })}
                </div>
              ) : (
                <div className={styles.grid}>
                  {baseList.map((pair) => {
                    const normalized = normalizePair(pair);
                    const isFav = favorites.has(normalized);

                    const cfg = getConfig(normalized);
                    const enabled = cfg?.enabled ?? true;

                    const payoutPct = getPayoutPct(normalized, 92);
                    const payoutText = formatPayoutText(payoutPct, 92);

                    const openState = getOpenState(normalized);
                    const isOpenNow = openState ? Boolean(openState?.isOpen) : true;

                    const disabled = !enabled || !isOpenNow;

                    const disabledTitle = !enabled
                      ? t("disabled.admin_disabled")
                      : openState?.reason === "manual"
                      ? t("disabled.admin_manual")
                      : openState?.reason === "schedule"
                      ? t("disabled.schedule")
                      : t("disabled.default");

                    const displayName =
                      normalized === "XAUUSD" ? "GOLD" :
                      normalized === "XAGUSD" ? "SILVER" :
                      undefined;

                    return (
                      <div
                        key={pair}
                        className={`${styles.cardWrap} ${disabled ? styles.cardDisabled : ""}`}
                        title={disabled ? disabledTitle : ""}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (disabled) {
                            SoundManager.uiClick();
                            return;
                          }
                          handleSelect(pair);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            if (disabled) {
                              SoundManager.uiClick();
                              return;
                            }
                            handleSelect(pair);
                          }
                        }}
                      >
                        <div className={styles.cardInner}>
                          <span
                            className={`${styles.itemDot} ${!disabled ? styles.dotOpen : styles.dotClosed}`}
                            title={!disabled ? t("market.asset_open") : disabledTitle}
                          />

                          <span
                            className={`${styles.payoutRight} ${disabled ? styles.payoutDisabled : ""}`}
                            aria-label={t("footer.payout")}
                            title={t("footer.payout")}
                          >
                            {payoutText}
                          </span>

                          <button
                            className={`${styles.starBtn} ${isFav ? styles.starOn : styles.starOff}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleFavorite(pair);
                            }}
                            aria-label={isFav ? t("favorites.remove") : t("favorites.add")}
                            title={isFav ? t("favorites.remove") : t("favorites.add")}
                          >
                            {isFav ? "★" : "☆"}
                          </button>

                          <div className={styles.cardClickArea}>
                            <PairCard
                              symbol={normalized}
                              category={activeCategory}
                              hidePayout
                              onClick={() => {}}
                              displayName={displayName}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={styles.footer}>
              <span className={styles.footerLeft}>{t("footer.payout")}</span>

              {activeCategory === ASSET_TYPES.FOREX && (
                <span className={styles.footerRight}>
                  {t("footer.forex_schedule", { close: "17:00", open: "21:00" })}
                </span>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>,
    portalTarget
  );
}