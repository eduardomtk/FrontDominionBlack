import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import styles from "./Header.module.css";
import { FaUserCircle, FaPlus } from "react-icons/fa";
import { FaWallet, FaRedoAlt, FaEye, FaEyeSlash } from "react-icons/fa";
import { useNavigate } from "react-router-dom";

import { useUILoading } from "../../../context/UILoadingContext";
import SoundManager from "@/sound/SoundManager.js";

import { useAccount } from "../../../context/AccountContext";
import { useBalance } from "../../../context/BalanceContext";
import { usePairUI } from "../../../context/PairUIContext";
import { useMarketStore } from "@/stores/market.store";

import ProfilePanel from "@/components/Chart/ChartWorkspace/ProfilePanel/ProfilePanel";
import ProfileModal from "@/components/WalletModal/ProfileModal";
import { useTradingAuth } from "@/context/TradingAuthContext";

// ✅ i18n
import { useTranslation } from "react-i18next";

// ✅ Brand logo (nova)
import BrandLogo from "@/components/BrandLogo/BrandLogo";

// ✅ NOVO: ícones das contas
import IC_Real from "@/assets/account-icons/IC_Real.png";
import IC_Demo from "@/assets/account-icons/IC_Demo.png";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutExpo(t) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function premiumEase(t) {
  const cut = 0.82;
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  if (t < cut) {
    const p = t / cut;
    return easeOutCubic(p) * cut;
  } else {
    const p = (t - cut) / (1 - cut);
    return cut + easeOutExpo(p) * (1 - cut);
  }
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

const LS_HIDE_BAL = "tp_balance_hidden_v1";
const MAX_FLOATING_PAIRS = 5;

/* =========================================================
   ✅ Helpers VISUAIS (tabs do header) — mínimo e seguro
   ========================================================= */
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

const CRYPTO_BASES = new Set([
  "BTC", "ETH", "ADA", "SOL", "XRP", "BNB", "LTC",
  "BCH", "DOG", "DOT", "AVAX", "MATIC", "SHIB", "TRX", "LINK", "UNI", "ATOM", "XLM", "ETC", "FIL"
]);

const METAL_BASES = new Set(["XAU", "XAG", "XPT", "XPD"]);

function inferCategoryMeta(pair) {
  const s = String(pair || "").trim().toUpperCase().replace(/\//g, "");
  const base = s.slice(0, 3);

  if (METAL_BASES.has(base)) return { id: "METALS", label: "Metais" };
  if (CRYPTO_BASES.has(base)) return { id: "CRYPTO", label: "Cripto" };
  return { id: "FOREX", label: "Forex" };
}
/* ========================================================= */

const Header = ({ pairPanelRef, onOpenWallet }) => {
  const { t } = useTranslation(["header", "common"]);

  const navigate = useNavigate();

  const { signOut, user: authUser, profile, avatarUrl } = useTradingAuth();

  const { accountType, accountReady, switchAccount } = useAccount();

  const balanceCtx = useBalance();
  const { balance, readyByType, balances } = balanceCtx || {};
  const { resetDemoBalance } = balanceCtx || {};

  const { setIsGlobalLoading } = useUILoading();

  const {
    togglePairPanelFromHeader,
    isPairPanelOpen,
    closePairPanel,
    pairPanelSource,
    activeFloatingPairs,
    removeFloatingPair,
    symbol,
    timeframe,
    setPair,
  } = usePairUI();

  const [showDropdown, setShowDropdown] = useState(false);
  const balanceRef = useRef(null);
  const addBtnRef = useRef(null);
  const prewarmSeenRef = useRef(new Map());

  // ✅ NOVO: chave de persistência por usuário (evita “vazar” preferências entre sessões)
  const userKey = useMemo(() => {
    const id = authUser?.id ? String(authUser.id) : "";
    const email = authUser?.email ? String(authUser.email) : "";
    return (id || email || "guest").trim().toLowerCase();
  }, [authUser?.id, authUser?.email]);

  const LS_HIDE_BAL_KEY = useMemo(() => `${LS_HIDE_BAL}:${userKey}`, [userKey]);

  const [isBalanceHidden, setIsBalanceHidden] = useState(() => {
    try {
      const k = `${LS_HIDE_BAL}:guest`;
      return localStorage.getItem(k) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      const v = localStorage.getItem(LS_HIDE_BAL_KEY);
      setIsBalanceHidden(v === "1");
    } catch {}
  }, [LS_HIDE_BAL_KEY]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_HIDE_BAL_KEY, isBalanceHidden ? "1" : "0");
    } catch {}
  }, [isBalanceHidden, LS_HIDE_BAL_KEY]);

  const balanceDropdownRef = useRef(null);
  const [balanceDropdownPos, setBalanceDropdownPos] = useState({
    top: 0,
    left: 0,
    ready: false,
  });

  const overlayRoot = useMemo(() => {
    if (typeof document === "undefined") return null;
    return document.getElementById("overlay-root");
  }, []);

  function prewarmPair() {}

  const updateBalanceDropdownPos = () => {
    const el = balanceRef.current;
    if (!el) return;

    const r = el.getBoundingClientRect();
    const width = 185;

    const top = Math.round(r.bottom + 10);
    const left = Math.round(r.left + r.width / 2 - width / 2);

    setBalanceDropdownPos({
      top,
      left,
      width,
      ready: true,
    });
  };

  const [profileOpen, setProfileOpen] = useState(false);
  const avatarBtnRef = useRef(null);

  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalTab, setProfileModalTab] = useState("perfil");

  useEffect(() => {
    const handler = (e) => {
      const tab = e?.detail?.tab || "perfil";
      setProfileOpen(false);
      setProfileModalTab(tab === "dados" ? "dados" : tab);
      setProfileModalOpen(true);
    };
    window.addEventListener("tp:openProfileModal", handler);
    return () => window.removeEventListener("tp:openProfileModal", handler);
  }, []);

  // ============================
  // ✅ Trigger externo do efeito "saldo subindo" (UX tipo F5)
  // ============================
  useEffect(() => {
    const onBalancePulse = () => {
      if (!accountReady) return;

      const confirmedReal = getConfirmedRealBalance();
      const confirmedDemo = getConfirmedDemoBalance();

      let target = null;

      if (accountType === "REAL") {
        target = Number.isFinite(Number(confirmedReal)) ? Number(confirmedReal) : null;
      } else {
        target = Number.isFinite(Number(confirmedDemo)) ? Number(confirmedDemo) : null;
      }

      if (!Number.isFinite(Number(target))) {
        const fb = Number.isFinite(Number(balance)) ? Number(balance) : null;
        target = Number.isFinite(Number(fb)) ? Number(fb) : 0;
      }

      target = Number.isFinite(Number(target)) ? Number(target) : 0;
      const tt = round2(target);

      stopAnim();
      lastTargetRef.current = null;

      if (tt <= 0) {
        setDisplayBalance(0);
        return;
      }

      const start = calcSmartStart(tt);
      animateBetween(start, tt, 1100, { cause: "startup" });
    };

    window.addEventListener("tradepro:balance-pulse", onBalancePulse);
    return () => window.removeEventListener("tradepro:balance-pulse", onBalancePulse);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountReady, accountType, balance]);

  const requestCloseWalletModal = () => {
    try {
      window.dispatchEvent(new CustomEvent("tp:closeWalletModal"));
    } catch {}
  };

  // ============================
  // ✅ Animação do saldo (header)
  // ============================
  const rafRef = useRef(null);
  const isFirstPaintRef = useRef(true);
  const lastTargetRef = useRef(null);

  const mountTsRef = useRef(typeof performance !== "undefined" ? performance.now() : Date.now());
  const seenConfirmedRef = useRef({ REAL: false, DEMO: false });

  const [displayBalance, setDisplayBalance] = useState(() => {
    const initial = Number.isFinite(Number(balance)) ? Number(balance) : 0;
    return round2(initial);
  });

  const [pulseDir, setPulseDir] = useState("none");
  const pulseTimerRef = useRef(null);

  const [flashStage, setFlashStage] = useState("none");
  const flashTimerRef = useRef(null);

  const formatBRL = useMemo(() => {
    return (value) =>
      value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, []);

  const stopAnim = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const triggerPulse = (dir) => {
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    setPulseDir(dir);
    pulseTimerRef.current = setTimeout(() => setPulseDir("none"), 220);
  };

  const flash = (stage) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashStage(stage);
    flashTimerRef.current = setTimeout(() => setFlashStage("none"), stage === "start" ? 180 : 260);
  };

  const animateBetween = (fromRaw, targetRaw, durationMs, meta = { cause: "trade" }) => {
    const target = round2(Number(targetRaw) || 0);

    if (lastTargetRef.current === target) return;
    lastTargetRef.current = target;

    stopAnim();

    const from = round2(Number(fromRaw) || 0);
    const delta = target - from;

    if (Math.abs(delta) < 0.01) {
      setDisplayBalance(target);
      return;
    }

    triggerPulse(delta > 0 ? "up" : "down");

    if (meta?.cause === "trade") flash("start");

    const start = performance.now();
    const duration = clamp(Number(durationMs) || 0, 250, 5000);

    const tick = (t) => {
      const p = clamp((t - start) / duration, 0, 1);
      const e = premiumEase(p);
      const next = round2(from + delta * e);

      setDisplayBalance(next);

      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        setDisplayBalance(target);

        if (meta?.cause === "trade") {
          flash("end");
          SoundManager.tickSoft();
        }
      }
    };

    setDisplayBalance(from);
    rafRef.current = requestAnimationFrame(tick);
  };

  // ============================
  // ✅ Troca de conta + loading GLOBAL
  // ============================
  const [isSwitching, setIsSwitching] = useState(false);

  const switchTokenRef = useRef(0);
  const forceTimerRef = useRef(null);
  const finishTimeoutRef = useRef(null);
  const finishedTokenRef = useRef(0);

  const MIN_SWITCH_LOADING_MS = 2600;
  const DURATION_SWITCH_MS = 650;
  const DURATION_TRADE_MS = 2400;

  const switchStartTsRef = useRef(0);
  const switchTargetTypeRef = useRef(null);

  const calcSmartStart = (target) => {
    const t0 = Math.max(0, round2(target));
    const gap = clamp(t0 * 0.15, 80, 1800);
    if (t0 <= 300) return 0;
    return round2(Math.max(0, t0 - gap));
  };

  const getBalanceByType = (type) => {
    const tt = String(type || "").toUpperCase() === "REAL" ? "REAL" : "DEMO";
    const v = balances?.[tt];
    if (Number.isFinite(Number(v))) return Number(v);
    return null;
  };

  const finishSwitch = (token, target) => {
    if (finishedTokenRef.current === token) return;
    finishedTokenRef.current = token;

    if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current);

    const elapsed = performance.now() - (switchStartTsRef.current || 0);
    const wait = Math.max(0, MIN_SWITCH_LOADING_MS - elapsed);

    finishTimeoutRef.current = window.setTimeout(() => {
      setIsSwitching(false);
      setIsGlobalLoading(false);

      requestAnimationFrame(() => {
        stopAnim();
        lastTargetRef.current = null;
        const start = calcSmartStart(target);
        animateBetween(start, target, DURATION_SWITCH_MS, { cause: "switch" });
      });
    }, wait);
  };

  const beginAccountSwitchUX = (nextType) => {
    switchTokenRef.current += 1;
    const token = switchTokenRef.current;

    finishedTokenRef.current = 0;

    switchTargetTypeRef.current = String(nextType || "").toUpperCase() === "REAL" ? "REAL" : "DEMO";

    setIsGlobalLoading(true);
    setIsSwitching(true);
    switchStartTsRef.current = performance.now();

    stopAnim();
    lastTargetRef.current = null;

    setDisplayBalance(0);

    if (forceTimerRef.current) clearTimeout(forceTimerRef.current);

    forceTimerRef.current = setTimeout(() => {
      const tt = switchTargetTypeRef.current;
      const confirmed = tt ? getBalanceByType(tt) : null;
      const isReady = tt ? Boolean(readyByType?.[tt]) : false;

      if (tt && isReady && Number.isFinite(Number(confirmed))) {
        finishSwitch(token, Number(confirmed));
      }
    }, 60);

    return token;
  };

  const getConfirmedRealBalance = () => {
    const v = balanceCtx?.realBalance ?? balanceCtx?.balances?.real ?? balanceCtx?.balances?.REAL ?? null;
    if (Number.isFinite(Number(v))) return Number(v);
    return null;
  };

  const getConfirmedDemoBalance = () => {
    const v = balanceCtx?.demoBalance ?? balanceCtx?.balances?.demo ?? balanceCtx?.balances?.DEMO ?? null;
    if (Number.isFinite(Number(v))) return Number(v);
    return null;
  };

  useEffect(() => {
    setShowDropdown(false);
    setProfileOpen(false);
    setProfileModalOpen(false);

    stopAnim();
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    if (forceTimerRef.current) clearTimeout(forceTimerRef.current);
    if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);

    rafRef.current = null;
    pulseTimerRef.current = null;
    forceTimerRef.current = null;
    finishTimeoutRef.current = null;
    flashTimerRef.current = null;

    isFirstPaintRef.current = true;
    lastTargetRef.current = null;
    seenConfirmedRef.current = { REAL: false, DEMO: false };
    mountTsRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();

    setIsSwitching(false);
    switchTokenRef.current = 0;
    finishedTokenRef.current = 0;
    switchTargetTypeRef.current = null;
    switchStartTsRef.current = 0;

    setPulseDir("none");
    setFlashStage("none");
    setDisplayBalance(0);

    setIsGlobalLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey]);

  useEffect(() => {
    if (!accountReady) return;

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const justMounted = now - (mountTsRef.current || 0) < 5000;

    const confirmedReal = getConfirmedRealBalance();
    const confirmedDemo = getConfirmedDemoBalance();

    let target = null;

    if (accountType === "REAL") {
      target = Number.isFinite(Number(confirmedReal)) ? Number(confirmedReal) : null;
    } else {
      target = Number.isFinite(Number(confirmedDemo)) ? Number(confirmedDemo) : null;
    }

    if (!Number.isFinite(Number(target))) {
      const fb = Number.isFinite(Number(balance)) ? Number(balance) : null;
      target = Number.isFinite(Number(fb)) ? Number(fb) : 0;
    }

    target = Number.isFinite(Number(target)) ? Number(target) : 0;

    const hasConfirmedForType =
      accountType === "REAL"
        ? Number.isFinite(Number(confirmedReal))
        : Number.isFinite(Number(confirmedDemo));

    if (hasConfirmedForType && !seenConfirmedRef.current[accountType]) {
      seenConfirmedRef.current[accountType] = true;

      stopAnim();
      lastTargetRef.current = null;

      const tt = round2(target);
      if (tt <= 0) {
        setDisplayBalance(0);
        return;
      }

      const start = calcSmartStart(tt);
      animateBetween(start, tt, 1100, { cause: "startup" });
      return;
    }

    if (isFirstPaintRef.current) {
      isFirstPaintRef.current = false;

      const tt = round2(target);
      if (tt <= 0) {
        setDisplayBalance(0);
        return;
      }

      lastTargetRef.current = null;
      const start = calcSmartStart(tt);
      animateBetween(start, tt, 1100, { cause: "startup" });
      return;
    }

    if (isSwitching) {
      const token = switchTokenRef.current;
      const tt = switchTargetTypeRef.current;

      if (!tt) return;

      const isReady = Boolean(readyByType?.[tt]);
      const confirmed = getBalanceByType(tt);

      if (isReady && Number.isFinite(Number(confirmed))) {
        if (forceTimerRef.current) clearTimeout(forceTimerRef.current);
        forceTimerRef.current = null;
        finishSwitch(token, Number(confirmed));
      }

      return;
    }

    if (justMounted && displayBalance > target && displayBalance > Math.max(200, target * 1.35)) {
      stopAnim();
      lastTargetRef.current = null;

      const tt = round2(target);
      if (tt <= 0) {
        setDisplayBalance(0);
        return;
      }

      const start = calcSmartStart(tt);
      animateBetween(start, tt, 900, { cause: "startup" });
      return;
    }

    lastTargetRef.current = null;
    animateBetween(displayBalance, target, DURATION_TRADE_MS, { cause: "trade" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balance, isSwitching, accountType, accountReady, readyByType?.REAL, readyByType?.DEMO, balances?.REAL, balances?.DEMO]);

  useEffect(() => {
    return () => {
      stopAnim();
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      if (forceTimerRef.current) clearTimeout(forceTimerRef.current);
      if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!showDropdown) return;
    updateBalanceDropdownPos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDropdown]);

  useEffect(() => {
    if (!showDropdown) return;

    const onScroll = () => updateBalanceDropdownPos();
    const onResize = () => updateBalanceDropdownPos();

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDropdown]);

  useEffect(() => {
    const handleMouseDown = (event) => {
      const clickedInsideBalance = balanceRef.current && balanceRef.current.contains(event.target);
      const clickedInsideDropdown =
        balanceDropdownRef.current && balanceDropdownRef.current.contains(event.target);

      if (showDropdown && !clickedInsideBalance && !clickedInsideDropdown) {
        setShowDropdown(false);
      }

      if (
        isPairPanelOpen &&
        pairPanelRef?.current &&
        !pairPanelRef.current.contains(event.target) &&
        addBtnRef.current &&
        !addBtnRef.current.contains(event.target)
      ) {
        closePairPanel();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (showDropdown) setShowDropdown(false);
        if (profileOpen) setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPairPanelOpen, closePairPanel, pairPanelRef, showDropdown, profileOpen]);

  const handleSwitch = (type) => {
    if (type === accountType) {
      setShowDropdown(false);
      return;
    }

    beginAccountSwitchUX(type);
    switchAccount(type);
    setShowDropdown(false);
  };

  const handleOpenWalletFromDropdown = () => {
    SoundManager.uiClick();
    setProfileModalOpen(false);
    setShowDropdown(false);
    onOpenWallet?.("deposit");
  };

  const handleResetDemo = async () => {
    SoundManager.uiClick();

    try {
      if (typeof resetDemoBalance === "function") {
        await resetDemoBalance();
        return;
      }

      if (typeof window !== "undefined" && typeof window.__TP_RESET_DEMO_BALANCE__ === "function") {
        await window.__TP_RESET_DEMO_BALANCE__();
        return;
      }
    } catch (err) {
      console.error("[Header] reset demo failed:", err);
    }
  };

  const getRealBalance = () => {
    const v = balanceCtx?.realBalance ?? balanceCtx?.balances?.real ?? balanceCtx?.balances?.REAL ?? null;
    if (Number.isFinite(Number(v))) return Number(v);
    if (accountType === "REAL" && Number.isFinite(Number(balance))) return Number(balance);
    return null;
  };

  const getDemoBalance = () => {
    const v = balanceCtx?.demoBalance ?? balanceCtx?.balances?.demo ?? balanceCtx?.balances?.DEMO ?? null;
    if (Number.isFinite(Number(v))) return Number(v);
    if (accountType === "DEMO" && Number.isFinite(Number(balance))) return Number(balance);
    return null;
  };

  const realBal = getRealBalance();
  const demoBal = getDemoBalance();

  const fmtOrDash = (v) => {
    if (isBalanceHidden) return t("header:money_hidden", { defaultValue: "R$ *****" });
    if (!Number.isFinite(Number(v))) return t("header:money_dash", { defaultValue: "R$ —" });

    const prefix = t("header:money_prefix", { defaultValue: "R$" });
    return `${prefix} ${formatBRL(round2(Number(v)))}`;
  };

  const balanceClass = accountType === "DEMO" ? styles.balanceDemo : styles.balanceValue;

  const pulseClass =
    pulseDir === "up" ? styles.balancePulseUp : pulseDir === "down" ? styles.balancePulseDown : "";

  const flashClass =
    flashStage === "start"
      ? styles.balanceFlashStart
      : flashStage === "end"
      ? styles.balanceFlashEnd
      : "";

  const headerBalanceText = isBalanceHidden
    ? t("header:money_hidden", { defaultValue: "R$ *****" })
    : `${t("header:money_prefix", { defaultValue: "R$" })} ${formatBRL(displayBalance)}`;

  const openProfileModal = (initial = "perfil") => {
    setProfileOpen(false);
    setProfileModalTab(initial);
    setProfileModalOpen(true);
  };

  const handleProfileAction = async (key) => {
    setProfileOpen(false);

    if (key === "trade") {
      setProfileModalOpen(false);
      setShowDropdown(false);
      closePairPanel();
      navigate("/trade", { replace: false });
      return;
    }

    if (key === "deposit") {
      setProfileModalOpen(false);
      onOpenWallet?.("deposit");
      return;
    }

    if (key === "withdraw") {
      setProfileModalOpen(false);
      onOpenWallet?.("withdraw");
      return;
    }

    if (key === "profile") {
      requestCloseWalletModal();
      openProfileModal("perfil");
      return;
    }

    if (key === "logout") {
      setProfileModalOpen(false);
      setShowDropdown(false);

      const { error } = await signOut();
      if (error) {
        alert(error.message || t("header:logout_error"));
        return;
      }

      navigate("/login", { replace: true });
      return;
    }
  };

  const panelDisplayName =
    (profile?.nickname && String(profile.nickname).trim()) ||
    (profile?.first_name && String(profile.first_name).trim()) ||
    (authUser?.email ? String(authUser.email) : t("header:my_account"));

  const avatarBust = useMemo(() => {
    const base = avatarUrl || "";
    if (!base) return "";
    const v = profile?.updated_at || profile?.avatar_updated_at || Date.now();
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}v=${encodeURIComponent(v)}`;
  }, [avatarUrl, profile?.updated_at, profile?.avatar_updated_at]);

  const panelUser = {
    name: panelDisplayName,
    email: authUser?.email || "",
    id: authUser?.id || "",
    avatarUrl: avatarBust || "",
  };

  const balanceDropdownPortal =
    showDropdown && overlayRoot && balanceDropdownPos.ready
      ? createPortal(
          <div
            ref={balanceDropdownRef}
            style={{
              position: "fixed",
              top: `${balanceDropdownPos.top}px`,
              left: `${balanceDropdownPos.left}px`,
              width: `${balanceDropdownPos.width}px`,
              zIndex: 999999,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.obDropdown}>
              <button
                type="button"
                className={`${styles.obAccountBtn} ${styles.obReal} ${
                  accountType === "REAL" ? styles.obActive : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (accountType !== "REAL") SoundManager.uiClick();
                  handleSwitch("REAL");
                }}
              >
                <span className={styles.obBadge}>
                  <img
                    src={IC_Real}
                    alt=""
                    draggable={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      display: "block",
                      borderRadius: "inherit",
                      pointerEvents: "none",
                      userSelect: "none",
                    }}
                  />
                </span>

                <span className={styles.obTexts}>
                  <span className={styles.obLabel}>{t("header:real_account")}</span>
                  <span className={styles.obValue}>{fmtOrDash(realBal)}</span>
                </span>

                <span
                  className={styles.obIconBtn}
                  title={t("header:wallet")}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenWalletFromDropdown();
                  }}
                >
                  <FaWallet />
                </span>
              </button>

              <button
                type="button"
                className={`${styles.obAccountBtn} ${styles.obDemo} ${
                  accountType === "DEMO" ? styles.obActive : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (accountType !== "DEMO") SoundManager.uiClick();
                  handleSwitch("DEMO");
                }}
              >
                <span className={styles.obBadge}>
                  <img
                    src={IC_Demo}
                    alt=""
                    draggable={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      display: "block",
                      borderRadius: "inherit",
                      pointerEvents: "none",
                      userSelect: "none",
                    }}
                  />
                </span>

                <span className={styles.obTexts}>
                  <span className={styles.obLabel}>{t("header:demo_account")}</span>
                  <span className={styles.obValue}>{fmtOrDash(demoBal)}</span>
                </span>

                <span
                  className={styles.obIconBtn}
                  title={t("header:reset_demo_10k")}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResetDemo();
                  }}
                >
                  <FaRedoAlt />
                </span>
              </button>

              <div className={styles.obDivider} />

              <button
                type="button"
                className={styles.obEyeBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  SoundManager.uiClick();
                  setIsBalanceHidden((v) => !v);
                }}
              >
                <span className={styles.obEyeLeft}>
                  <span className={styles.obEyeIcon}>
                    {isBalanceHidden ? <FaEye /> : <FaEyeSlash />}
                  </span>
                  <span className={styles.obEyeText}>
                    {isBalanceHidden ? t("header:show_balance") : t("header:hide_balance")}
                  </span>
                </span>
              </button>
            </div>
          </div>,
          overlayRoot
        )
      : null;

  return (
    <>
      <header className={styles.header}>
        <div className={styles.leftGroup}>
          <div className={styles.logo}>
            <BrandLogo />
          </div>

          <div className={styles.floatingPairsContainer}>
            {activeFloatingPairs.map((pair) => {
              const pairKey = normalizeToPairsFileName(pair);
              const imgSrc = `/assets/pairs/${pairKey}.png`;
              const displaySymbol = formatSymbolWithSlash(pair);
              const cat = inferCategoryMeta(pair);

              return (
                <div
                  key={pair}
                  data-cat={cat.id}
                  className={`${styles.pairCard} ${symbol === pair ? styles.active : ""}`}
                  onClick={() => {
                    if (symbol !== pair) SoundManager.uiClick();
                    setPair(pair, timeframe);
                  }}
                >
                  <div className={styles.pairMain}>
                    <span className={styles.pairIcon} aria-hidden="true">
                      <img
                        className={styles.pairIconImg}
                        src={imgSrc}
                        alt=""
                        draggable={false}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </span>

                    <span className={styles.pairTexts}>
                      <span className={styles.pairSymbol}>{displaySymbol}</span>
                      <span className={styles.pairCategory}>{cat.label}</span>
                    </span>
                  </div>

                  <button
                    className={styles.closeBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      SoundManager.uiClick();
                      removeFloatingPair(pair);
                    }}
                    aria-label="Fechar"
                    title="Fechar"
                  >
                    ✕
                  </button>
                </div>
              );
            })}

            {activeFloatingPairs.length < MAX_FLOATING_PAIRS && (
              <button
                ref={addBtnRef}
                className={`${styles.addPairBtn} ${
                  isPairPanelOpen && pairPanelSource === "header" ? styles.activeBtn : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  SoundManager.uiClick();
                  togglePairPanelFromHeader(e);
                }}
                title={t("header:add_pair")}
                aria-label={t("header:add_pair")}
              >
                <FaPlus />
              </button>
            )}
          </div>
        </div>

        <div className={styles.rightGroup}>
          <div
            ref={balanceRef}
            className={`${styles.balanceContainer} ${
              accountType === "DEMO" ? styles.balanceDemoMode : styles.balanceRealMode
            }`}
            data-account-type={String(accountType || "").toLowerCase()}
            onClick={() => {
              SoundManager.uiClick();
              const next = !showDropdown;
              setShowDropdown(next);
              if (next) requestAnimationFrame(() => updateBalanceDropdownPos());
            }}
            title={t("header:balance")}
            aria-label={t("header:balance")}
          >
            <span className={accountType === "DEMO" ? styles.badgeDemo : styles.badgeReal}>
              {accountType === "REAL" ? t("header:real_account") : t("header:demo_account")}
            </span>

            <span className={`${balanceClass} ${pulseClass} ${flashClass}`}>{headerBalanceText}</span>
          </div>

          <div className={styles.actionButtons}>
            <button
              type="button"
              className={styles.btnDeposit}
              onClick={() => {
                SoundManager.uiClick();
                setProfileModalOpen(false);
                onOpenWallet?.("deposit");
              }}
            >
              {t("header:deposit")}
            </button>

            <button
              type="button"
              className={styles.btnWithdraw}
              onClick={() => {
                SoundManager.uiClick();
                setProfileModalOpen(false);
                onOpenWallet?.("withdraw");
              }}
            >
              {t("header:withdraw")}
            </button>
          </div>

          <div className={styles.profileSection}>
            <div
              ref={avatarBtnRef}
              className={styles.avatarWrapper}
              onClick={(e) => {
                e.stopPropagation();
                SoundManager.uiClick();
                setProfileOpen((v) => !v);
              }}
              aria-label={t("header:open_profile_menu")}
              title={t("header:my_account")}
            >
              {avatarBust ? (
                <img className={styles.headerAvatarImg} src={avatarBust} alt="" />
              ) : (
                <FaUserCircle />
              )}
            </div>
          </div>
        </div>
      </header>

      {balanceDropdownPortal}

      <ProfilePanel
        open={profileOpen}
        anchorRef={avatarBtnRef}
        onClose={() => setProfileOpen(false)}
        onAction={(key) => {
          handleProfileAction(key);
        }}
        user={panelUser}
      />

      <ProfileModal
        isOpen={profileModalOpen}
        initialTab={profileModalTab}
        onClose={() => setProfileModalOpen(false)}
        onComplete={() => {}}
      />
    </>
  );
};

export default Header;