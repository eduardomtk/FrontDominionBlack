import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import styles from "./WalletModal.module.css";
import SoundManager from "@/sound/SoundManager.js";
import { useAccount } from "@/context/AccountContext";
import { useBalance } from "@/context/BalanceContext";
import { useTradingAuth } from "@/context/TradingAuthContext";
import { supabase } from "@/services/supabaseClient";
import pixLogo from "@/assets/Pix/logo_pix.png";
import { formatCurrency, formatCurrencyValue, getCurrencySymbol, normalizeCurrency } from "@/utils/currency";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

// ✅ igual CopyTrade: clamp simples pra garantir >= 0
function clampNonNeg(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

function toNumberSafe(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatBRL(n) {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

// ==========================
// ✅ CPF VÁLIDO (fallback p/ depósito sem perfil)
// ==========================
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isAllSameDigits(arr) {
  return arr.every((x) => x === arr[0]);
}

function calcCpfDigit(digs, factorStart) {
  let sum = 0;
  for (let i = 0; i < digs.length; i++) sum += digs[i] * (factorStart - i);
  const mod = sum % 11;
  const dv = 11 - mod;
  return dv >= 10 ? 0 : dv;
}

function generateValidCpf() {
  while (true) {
    const base = Array.from({ length: 9 }, () => randomInt(0, 9));
    if (isAllSameDigits(base)) continue;
    const d1 = calcCpfDigit(base, 10);
    const d2 = calcCpfDigit([...base, d1], 11);
    const cpf = [...base, d1, d2].join("");
    if (cpf === "00000000000") continue;
    return cpf;
  }
}

// taxa padrão (igual referência)
const WITHDRAW_FEE_PCT = 0.03;

// ✅ mínimos (regra comercial)
const MIN_DEPOSIT_BRL = 60;
const MIN_WITHDRAW_BRL = 100;

// ✅ polling leve para refletir status quando admin muda (mesmo padrão do ProfileModal)
const KYC_POLL_MS = 5000;

// ✅ depósito: expira QR após 5 min
const DEPOSIT_EXPIRE_SEC = 5 * 60;

// ✅ filtros de histórico
const HISTORY_RANGE = {
  LAST_7_DAYS: "LAST_7_DAYS",
  LAST_30_DAYS: "LAST_30_DAYS",
  THIS_MONTH: "THIS_MONTH",
  LAST_MONTH: "LAST_MONTH",
  CUSTOM: "CUSTOM",
};

// ✅ barramento global de overlays (mesmo padrão já usado no App/Sidebar)
const OVERLAY_OPEN_EVENT = "tradepro:overlay-open";

// ==========================
// ✅ BÔNUS (TABELAS)
// ==========================
const TBL_BONUS_CODES = "bonus_codes";
const TBL_BONUS_USAGES = "bonus_usages";

// ✅ OPERAÇÕES (fonte canônica do Front, igual Admin)
const TBL_TRADE_HISTORY = "trade_history";

// helpers
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfMonth(d) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfMonth(d) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + 1, 1);
  x.setHours(0, 0, 0, 0);
  x.setMilliseconds(-1);
  return x;
}

function safeUpper(v) {
  return String(v || "").toUpperCase().trim();
}

function fmtDateBR(d) {
  try {
    return new Date(d).toLocaleDateString("pt-BR");
  } catch {
    return "-";
  }
}

function fmtDateTimeBR(d) {
  try {
    return new Date(d).toLocaleString("pt-BR");
  } catch {
    return "-";
  }
}

function monthKeyFromTs(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function monthLabelFromKey(key) {
  const [y, m] = String(key).split("-");
  const dt = new Date(Number(y), Number(m) - 1, 1);
  return dt.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/**
 * ✅ Compatibilidade de schema:
 * - versão antiga: rollover_required / rollover_completed
 * - versão atual (pelo seu SQL): rollover_target / rollover_progress
 */
function getRolloverTarget(row) {
  const a = toNumberSafe(row?.rollover_target);
  if (a !== null) return Math.max(0, a);
  const b = toNumberSafe(row?.rollover_required);
  if (b !== null) return Math.max(0, b);
  return 0;
}

function getRolloverProgress(row) {
  const a = toNumberSafe(row?.rollover_progress);
  if (a !== null) return Math.max(0, a);
  const b = toNumberSafe(row?.rollover_completed);
  if (b !== null) return Math.max(0, b);
  return 0;
}

/**
 * ✅ Normaliza resultado de operação (compatível com múltiplos schemas)
 * - retorna: "WIN" | "LOSS" | "TIE" | "OPEN" | "CANCELED" | ""
 */
function normalizeTradeResult(row) {
  const raw = safeUpper(row?.result || row?.status || row?.outcome || row?.state || "");
  if (!raw) return "";
  if (raw === "WIN" || raw === "WON" || raw === "SUCCESS" || raw === "PROFIT") return "WIN";
  if (raw === "LOSS" || raw === "LOST" || raw === "FAIL" || raw === "FAILED") return "LOSS";
  if (raw === "TIE" || raw === "DRAW" || raw === "REFUND" || raw === "PUSH") return "TIE";
  if (raw === "OPEN" || raw === "RUNNING" || raw === "PENDING") return "OPEN";
  if (raw === "CANCELED" || raw === "CANCELLED" || raw === "CANCELED_BY_USER") return "CANCELED";
  return raw;
}

/**
 * ✅ Cálculo canônico do NET do trader (igual Admin)
 * LOSS -> -amount
 * TIE  -> 0
 * WIN  -> profit (se existir e != 0) senão (payout - amount) senão 0
 */
function calcTradeNet(row) {
  const amount =
    toNumberSafe(row?.amount) ??
    toNumberSafe(row?.stake) ??
    toNumberSafe(row?.value) ??
    toNumberSafe(row?.entry_amount) ??
    0;
  const payout =
    toNumberSafe(row?.payout) ??
    toNumberSafe(row?.payout_amount) ??
    toNumberSafe(row?.return_amount) ??
    toNumberSafe(row?.gross_payout) ??
    null;
  const profit =
    toNumberSafe(row?.profit) ??
    toNumberSafe(row?.pnl) ??
    toNumberSafe(row?.net_profit) ??
    toNumberSafe(row?.result_amount) ??
    null;
  const res = normalizeTradeResult(row);
  if (res === "LOSS") return -Math.abs(Number(amount) || 0);
  if (res === "TIE") return 0;
  if (res === "WIN") {
    if (profit !== null && profit !== 0) return Number(profit) || 0;
    if (payout !== null) return (Number(payout) || 0) - (Number(amount) || 0);
    return 0;
  }
  // OPEN/CANCELED/desconhecido: não entra no net do período
  return 0;
}

function tradeStatusLabelPT(row, t) {
  const res = normalizeTradeResult(row);
  if (res === "WIN") return t("wallet:status.ops.win");
  if (res === "LOSS") return t("wallet:status.ops.loss");
  if (res === "TIE") return t("wallet:status.ops.tie");
  if (res === "OPEN") return t("wallet:status.ops.open");
  if (res === "CANCELED") return t("wallet:status.ops.canceled");
  return res || "—";
}

export default function WalletModal({
  isOpen,
  initialTab = "deposit",
  initialHistoryKind = "deposit",
  onClose,
  onGoProfile,
  profileComplete = false,
  /**
   * ✅ Mantido (sem mudar API):
   * - usePortal=true renderiza via createPortal (igual CopyTrade)
   * - usePortal=false permite renderizar inline (se algum lugar do projeto usar)
   */
  usePortal = true,
  /**
   * ✅ Mantido:
   * Container opcional do portal. Se não vier, cai no document.body.
   */
  portalContainer = null,
}) {
  const { accountType } = useAccount();
  const { balances, credit, debit } = useBalance();
  
  // ✅ i18n - IMPLEMENTADO
  const { t, i18n } = useTranslation(["wallet", "common"]);
  
  // ✅ FIX micro-bug: usar profileReady para não "avaliar" regra com profile ainda hidratando
  const { profile, user, profileReady } = useTradingAuth();
  const accountCurrency = normalizeCurrency(profile?.currency, "BRL");
  const accountLocale = profile?.locale || i18n?.resolvedLanguage || undefined;
  const accountCurrencySymbol = getCurrencySymbol(accountCurrency);
  const moneyText = useCallback((value, currency = accountCurrency) => formatCurrency(value, currency, currency === accountCurrency ? accountLocale : undefined), [accountCurrency, accountLocale]);
  const moneyValue = useCallback((value, currency = accountCurrency) => formatCurrencyValue(value, currency, currency === accountCurrency ? accountLocale : undefined), [accountCurrency, accountLocale]);
  const [tab, setTab] = useState(initialTab);
  
  // ✅ (mantido) vars usadas só fora do trading-host, se você quiser recorte "manual"
  const [overlayVars, setOverlayVars] = useState({
    "--wm-top": "0px",
    "--wm-left": "0px",
    "--wm-right": "0px",
    "--wm-bottom": "0px",
  });

  const computeBounds = useCallback(() => {
    if (typeof document === "undefined") return;
    const headerEl = document.getElementById("trading-header");
    const leftEl = document.getElementById("trading-left");
    const footerEl = document.getElementById("trading-footer-fixed");
    const headerRect = headerEl?.getBoundingClientRect?.();
    const leftRect = leftEl?.getBoundingClientRect?.();
    const footerRect = footerEl?.getBoundingClientRect?.();
    const top = clampNonNeg(Math.round(headerRect?.bottom || 0));
    const left = clampNonNeg(Math.round(leftRect?.right || 0));
    const bottom = footerRect ? clampNonNeg(Math.round(window.innerHeight - footerRect.top)) : 0;
    const right = 0;
    setOverlayVars({
      "--wm-top": `${top}px`,
      "--wm-left": `${left}px`,
      "--wm-right": `${right}px`,
      "--wm-bottom": `${bottom}px`,
    });
  }, []);

  // Portal target
  const portalTarget = useMemo(() => {
    if (!usePortal) return null;
    if (typeof document === "undefined") return null;
    // ✅ prioriza o host oficial do TradingLayout
    const host = document.getElementById("trading-overlay-host");
    return portalContainer || host || document.body;
  }, [usePortal, portalContainer]);

  const isTradingHost = useMemo(() => {
    return Boolean(usePortal && portalTarget && portalTarget.id === "trading-overlay-host");
  }, [usePortal, portalTarget]);

  useEffect(() => {
    if (!isOpen) return;
    if (!usePortal) return;
    // ✅ Só recalcula bounds quando NÃO estiver no trading-host
    // No host, o recorte é "natural": absolute inset:0 dentro dele (via CSS)
    if (isTradingHost) return;
    computeBounds();
    const onResize = () => computeBounds();
    window.addEventListener("resize", onResize);
    const t0 = setTimeout(() => computeBounds(), 0);
    const t1 = setTimeout(() => computeBounds(), 50);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      window.removeEventListener("resize", onResize);
    };
  }, [isOpen, usePortal, isTradingHost, computeBounds]);

  // Depósito (stepper)
  const [depositStep, setDepositStep] = useState(1);
  const [depositValue, setDepositValue] = useState("60");
  const [depositMethod] = useState("PIX");
  
  // ✅ Estado do depósito real (Mercado Pago)
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositError, setDepositError] = useState("");
  const [depositInfo, setDepositInfo] = useState(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const depositRtRef = useRef(null);
  
  // ✅ countdown do PIX (step 2)
  const [depositExpiresSec, setDepositExpiresSec] = useState(0);
  const depositTimerRef = useRef(null);
  const depositPollRef = useRef(null);
  
  // cupom / bônus
  const [hasPromo, setHasPromo] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  
  // ✅ bônus real
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [promoMeta, setPromoMeta] = useState(null);
  // ✅ mini modal "Condições do bônus" (referência OnBroker)
  const [bonusTermsOpen, setBonusTermsOpen] = useState(false);
  
  // Saque
  const [withdrawValue, setWithdrawValue] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawOk, setWithdrawOk] = useState(false);
  
  // ✅ BONUS USAGE (rollover do bônus ativo)
  const [bonusUsage, setBonusUsage] = useState(null);
  const [bonusUsageBusy, setBonusUsageBusy] = useState(false);
  const [bonusUsageError, setBonusUsageError] = useState("");
  const bonusRtRef = useRef(null);

  // ✅ Limites de saque (cash sacável vs bloqueado por bônus)
  const [withdrawLimits, setWithdrawLimits] = useState(null);
  const [withdrawLimitsBusy, setWithdrawLimitsBusy] = useState(false);
  const [withdrawLimitsError, setWithdrawLimitsError] = useState("");
  
  // ✅ FIX (micro-bugs do saque): só renderiza saque após hidratar KYC + bônus
  const [withdrawHydrating, setWithdrawHydrating] = useState(false);
  const withdrawHydrateSeqRef = useRef(0);
  
  // Histórico (AGORA REAL)
  const [historyKind, setHistoryKind] = useState("deposit");
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyDropRef = useRef(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyRows, setHistoryRows] = useState([]);
  const historyRtRef = useRef(null);
  
  // ✅ filtros (barra superior do histórico)
  const [historyRange, setHistoryRange] = useState(HISTORY_RANGE.LAST_7_DAYS);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  
  // ✅ debounce do reload do histórico
  const historyReloadTimerRef = useRef(null);
  const scheduleHistoryReload = () => {
    if (historyReloadTimerRef.current) clearTimeout(historyReloadTimerRef.current);
    historyReloadTimerRef.current = setTimeout(() => {
      historyReloadTimerRef.current = null;
      void loadHistory();
    }, 250);
  };

  const clearDepositTimer = () => {
    if (depositTimerRef.current) {
      clearInterval(depositTimerRef.current);
      depositTimerRef.current = null;
    }
  };

  const cleanupDepositRealtime = () => {
    if (depositRtRef.current) {
      supabase.removeChannel(depositRtRef.current);
      depositRtRef.current = null;
    }
  };

  const clearDepositPoll = () => {
    if (depositPollRef.current) {
      clearInterval(depositPollRef.current);
      depositPollRef.current = null;
    }
  };

  const cleanupBonusRealtime = () => {
    if (bonusRtRef.current) {
      supabase.removeChannel(bonusRtRef.current);
      bonusRtRef.current = null;
    }
  };

  const resetDepositToStep1 = (msg) => {
    clearDepositTimer();
    clearDepositPoll();
    cleanupDepositRealtime();
    setDepositExpiresSec(0);
    setDepositInfo(null);
    if (msg) setDepositError(msg);
    setDepositStep(1);
  };

  const isDepositConfirmedRow = (row) => {
    if (!row) return false;
    const st = String(row.status || "").toUpperCase();
    const credited = Boolean(row.credited);
    return credited || st === "CONFIRMED" || st === "RECEIVED" || st === "PAID" || st === "SUCCESS";
  };

  // ✅ FIX DO MICRO-FRAME: resetar ANTES do paint na transição FECHADO -> ABERTO
  const prevOpenRef = useRef(false);

  // abrir no tab certo sempre que abrir
  useLayoutEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = Boolean(isOpen);
    if (!isOpen || wasOpen) return;
    setTab(initialTab);
    setDepositStep(1);
    setHistoryOpen(false);
    if (initialTab === "history") {
      setHistoryKind(initialHistoryKind);
    }
    // reseta cupom ao abrir
    setHasPromo(false);
    setPromoCode("");
    setPromoApplied(false);
    setPromoBusy(false);
    setPromoError("");
    setPromoMeta(null);
    // reseta saque ao abrir
    setWithdrawValue("");
    setAcceptTerms(false);
    setWithdrawBusy(false);
    setWithdrawError("");
    setWithdrawOk(false);
    // ✅ reseta estado do rollover
    setBonusUsage(null);
    setBonusUsageBusy(false);
    setBonusUsageError("");
    cleanupBonusRealtime();
    // ✅ reseta hidratação do saque
    // 🔥 FIX: se abrir direto no "withdraw", começa SEMPRE com "Carregando..." (evita 1 frame)
    setWithdrawHydrating(initialTab === "withdraw");
    withdrawHydrateSeqRef.current = 0;
    // ✅ reseta depósito gateway
    setDepositBusy(false);
    setDepositError("");
    setDepositInfo(null);
    setCopiedPix(false);
    // ✅ reseta countdown
    setDepositExpiresSec(0);
    clearDepositTimer();
    setHistoryLoading(false);
    setHistoryError("");
    setHistoryRows([]);
    // ✅ filtros: default 7 dias
    setHistoryRange(HISTORY_RANGE.LAST_7_DAYS);
    setHistoryFrom("");
    setHistoryTo("");
    cleanupDepositRealtime();
    if (historyRtRef.current) {
      supabase.removeChannel(historyRtRef.current);
      historyRtRef.current = null;
    }
    if (historyReloadTimerRef.current) {
      clearTimeout(historyReloadTimerRef.current);
      historyReloadTimerRef.current = null;
    }
  }, [isOpen, initialTab, initialHistoryKind]);

  // ESC fecha
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        SoundManager.uiClick();
        // ✅ prioridade: se o mini painel de condições estiver aberto, fecha ele primeiro
        if (bonusTermsOpen) {
          setBonusTermsOpen(false);
          return;
        }
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose, bonusTermsOpen]);

  // ✅ trava scroll do body enquanto modal estiver aberto (somente quando estiver no body)
  useEffect(() => {
    if (!isOpen) return;
    if (!usePortal) return;
    if (isTradingHost) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen, usePortal, isTradingHost]);

  // click fora fecha dropdown do histórico
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e) => {
      if (!historyOpen) return;
      if (!historyDropRef.current) return;
      if (historyDropRef.current.contains(e.target)) return;
      setHistoryOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isOpen, historyOpen]);

  const depositNumber = useMemo(() => {
    const n = toNumberSafe(String(depositValue).replace(",", "."));
    return n === null ? 0 : clamp(n, 0, 999999999);
  }, [depositValue]);

  const quickValues = useMemo(() => {
    if (accountCurrency === "USD") return [10, 20, 50, 100, 200, 500, 1000];
    if (accountCurrency === "EUR") return [10, 20, 50, 100, 200, 500, 1000];
    return [60, 100, 200, 500, 1000, 5000, 10000, 15000];
  }, [accountCurrency]);
  const canDeposit = accountCurrency === "BRL" ? depositNumber >= MIN_DEPOSIT_BRL : depositNumber > 0;

  // ==========================
  // ✅ BÔNUS APLICADO (valor recebido = depósito + bônus)
  // ==========================
  const appliedBonusAmount = useMemo(() => {
    if (!promoApplied || !promoMeta) return 0;
    const pct = Number(promoMeta?.bonus_percent) || 0;
    if (pct <= 0) return 0;
    return (depositNumber * pct) / 100;
  }, [promoApplied, promoMeta, depositNumber]);

  const receiveTotal = useMemo(() => {
    return depositNumber + appliedBonusAmount;
  }, [depositNumber, appliedBonusAmount]);

  // se usuário mudar valor do depósito e cair abaixo do mínimo do bônus, des-aplica automaticamente
  useEffect(() => {
    if (!promoApplied || !promoMeta) return;
    const minDep = Number(promoMeta?.min_deposit) || 0;
    if (minDep > 0 && depositNumber > 0 && depositNumber < minDep) {
      setPromoApplied(false);
      setPromoMeta(null);
      setPromoError(`Depósito mínimo para este bônus é ${moneyText(minDep)}.`);
    }
  }, [promoApplied, promoMeta, depositNumber]);

  // ==========================
  // ✅ FILTRO DE PERÍODO (HISTÓRICO)
  // ==========================
  const resolvedRange = useMemo(() => {
    const now = new Date();
    if (historyRange === HISTORY_RANGE.LAST_7_DAYS) {
      const from = startOfDay(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      const to = endOfDay(now);
      return { from, to };
    }
    if (historyRange === HISTORY_RANGE.LAST_30_DAYS) {
      const from = startOfDay(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
      const to = endOfDay(now);
      return { from, to };
    }
    if (historyRange === HISTORY_RANGE.THIS_MONTH) {
      const from = startOfMonth(now);
      const to = endOfMonth(now);
      return { from, to };
    }
    if (historyRange === HISTORY_RANGE.LAST_MONTH) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      const from = startOfMonth(d);
      const to = endOfMonth(d);
      return { from, to };
    }
    // CUSTOM
    if (historyRange === HISTORY_RANGE.CUSTOM) {
      const f = historyFrom ? startOfDay(new Date(historyFrom)) : null;
      const t = historyTo ? endOfDay(new Date(historyTo)) : null;
      return { from: f, to: t };
    }
    return { from: null, to: null };
  }, [historyRange, historyFrom, historyTo]);

  // ==========================
  // ✅ DEPÓSITO (MERCADO PAGO)
  // ==========================
  const fullNameForPayment = useMemo(() => {
    const p = profile || {};
    const n =
      (p.name && String(p.name).trim()) ||
      `${String(p.first_name || "").trim()} ${String(p.last_name || "").trim()}`.trim() ||
      "";
    return n || "";
  }, [profile]);

  const cpfCnpjForPayment = useMemo(() => {
    const cpf = profile?.cpf ? String(profile.cpf).trim() : "";
    return cpf;
  }, [profile?.cpf]);

  const emailForPayment = useMemo(() => {
    const e = user?.email ? String(user.email).trim() : "";
    const pe = profile?.email ? String(profile.email).trim() : "";
    return e || pe || "";
  }, [user?.email, profile?.email]);

  const phoneForPayment = useMemo(() => {
    const p = profile?.phone ? String(profile.phone).trim() : "";
    return p || "";
  }, [profile?.phone]);

  // ==========================
  // ✅ BÔNUS: validação real (bonus_codes + bonus_usages)
  // ==========================
  const validateBonusCode = async ({ codeRaw, amount }) => {
    const uid = user?.id || null;
    const code = safeUpper(codeRaw);
    if (!code) throw new Error("Digite um código promocional.");
    if (!uid) throw new Error("Você precisa estar logado para aplicar bônus.");
    const { data: row, error } = await supabase.from(TBL_BONUS_CODES).select("*").eq("code", code).maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Código inválido.");
    if (!row.is_active) throw new Error("Este bônus está inativo.");
    const now = Date.now();
    if (row.starts_at) {
      const t = new Date(row.starts_at).getTime();
      if (Number.isFinite(t) && now < t) throw new Error("Este bônus ainda não está disponível.");
    }
    if (row.expires_at) {
      const t = new Date(row.expires_at).getTime();
      if (Number.isFinite(t) && now >= t) throw new Error("Este bônus está expirado.");
    }
    const minDep = Number(row.min_deposit) || 0;
    if (minDep > 0 && Number(amount) < minDep) {
      throw new Error(`Depósito mínimo para este bônus é ${moneyText(minDep)}.`);
    }
    if (row.usage_limit_total !== null && row.usage_limit_total !== undefined) {
      const limitTotal = Number(row.usage_limit_total);
      if (Number.isFinite(limitTotal) && limitTotal >= 0) {
        const { count, error: cErr } = await supabase
          .from(TBL_BONUS_USAGES)
          .select("id", { count: "exact", head: true })
          .eq("bonus_code_id", row.id);
        if (cErr) throw cErr;
        const used = Number(count) || 0;
        if (used >= limitTotal) throw new Error("Este bônus atingiu o limite total de utilizações.");
      }
    }
    if (row.usage_limit_per_user !== null && row.usage_limit_per_user !== undefined) {
      const limitUser = Number(row.usage_limit_per_user);
      if (Number.isFinite(limitUser) && limitUser >= 0) {
        const { count, error: cErr } = await supabase
          .from(TBL_BONUS_USAGES)
          .select("id", { count: "exact", head: true })
          .eq("bonus_code_id", row.id)
          .eq("user_id", uid);
        if (cErr) throw cErr;
        const used = Number(count) || 0;
        if (used >= limitUser) throw new Error("Você já atingiu o limite de uso deste bônus.");
      }
    }
    return {
      id: row.id,
      code: safeUpper(row.code),
      bonus_percent: Number(row.bonus_percent) || 0,
      rollover_x: Number(row.rollover_x) || 0,
      min_deposit: Number(row.min_deposit) || 0,
      // ✅ opcional (se existir no schema). fallback no render.
      max_deposit: Number(row.max_deposit) || 0,
      starts_at: row.starts_at || null,
      expires_at: row.expires_at || null,
    };
  };

  const startDeposit = async () => {
    if (!canDeposit) return;
    // ✅ FIX micro-bug: evitar gerar PIX com profile ainda "não pronto"
    // (isso impedia/bugava CPF/email em alguns instantes de abertura)
    if (!profileReady) {
      setDepositError(t("wallet:deposit.profile_loading_try_again"));
      return;
    }
    if (!user?.id) {
      setDepositError(t("wallet:deposit.must_be_logged_pix"));
      return;
    }
    const customerName = fullNameForPayment || t("wallet:deposit.default_customer_name");
    const customerCpf = cpfCnpjForPayment || generateValidCpf();
    const customerEmail = emailForPayment || `${user.id}@tradepro.local`;
    const customerPhone = phoneForPayment || undefined;
    try {
      SoundManager.uiClick();
      setDepositBusy(true);
      setDepositError("");
      setDepositInfo(null);
      setCopiedPix(false);
      clearDepositTimer();
      cleanupDepositRealtime();
      let bonusToAttach = null;
      if (promoApplied && promoMeta && hasPromo) {
        if (bonusUsage) {
          setPromoApplied(false);
          setPromoMeta(null);
          setPromoError("Você já possui um bônus ativo. Conclua ou cancele para aplicar outro.");
        } else {
        try {
          const fresh = await validateBonusCode({ codeRaw: promoMeta.code || promoCode, amount: depositNumber });
          bonusToAttach = fresh;
          setPromoMeta(fresh);
        } catch (e) {
          setPromoApplied(false);
          setPromoMeta(null);
          setPromoError(String(e?.message || "Bônus inválido."));
          bonusToAttach = null;
        }
        }
      }
      const { data, error } = await supabase.functions.invoke("mercadopago-create-pix-deposit", {
        body: {
          amount: depositNumber,
          currency: accountCurrency,
          customer: {
            name: customerName,
            cpfCnpj: customerCpf,
            email: customerEmail,
            phone: customerPhone,
          },
          description: t("wallet:deposit.description_pix"),
          bonus: bonusToAttach
            ? {
                bonus_code_id: bonusToAttach.id,
                bonus_code: bonusToAttach.code,
                bonus_percent_snapshot: bonusToAttach.bonus_percent,
                rollover_x_snapshot: bonusToAttach.rollover_x,
              }
            : null,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || t("wallet:deposit.gateway_failed"));
      const depositId = data?.deposit?.id || null;
      const providerPaymentId =
        data?.mercadopago?.paymentId || data?.deposit?.provider_payment_id || null;
      const payload = data?.mercadopago?.qr?.payload || null;
      const encodedImage = data?.mercadopago?.qr?.encodedImage || null;
      if (!depositId || !providerPaymentId) {
        throw new Error(t("wallet:deposit.invalid_gateway_response"));
      }
      setDepositInfo({
        depositId,
        provider_payment_id: providerPaymentId,
        payload,
        encodedImage,
        quote: data?.quote || null,
      });
      // Mercado Pago: snapshot do bônus já é persistido no backend na criação do depósito.
      setDepositStep(2);
      setDepositExpiresSec(DEPOSIT_EXPIRE_SEC);
      const channel = supabase
        .channel(`deposits:rt:${user.id}:${depositId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "deposits",
            filter: `id=eq.${depositId}`,
          },
          (payload) => {
            const row = payload?.new || null;
            if (isDepositConfirmedRow(row)) {
              clearDepositTimer();
              clearDepositPoll();
              setDepositStep(3);
              if (user?.id) {
                void Promise.allSettled([
                  fetchWithdrawLimits(),
                  fetchActiveBonusUsage(user.id),
                ]);
              }
            }
          }
        )
        .subscribe();
      depositRtRef.current = channel;
    } catch (e) {
      const msg = String(e?.message || e);
      setDepositError(msg);
    } finally {
      setDepositBusy(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (tab !== "deposit" || depositStep !== 2) {
      clearDepositTimer();
      return;
    }
    if (!depositInfo?.depositId) {
      clearDepositTimer();
      return;
    }
    clearDepositTimer();
    depositTimerRef.current = setInterval(() => {
      setDepositExpiresSec((s) => {
        const next = Number.isFinite(s) ? s - 1 : 0;
        if (next <= 0) {
          resetDepositToStep1(t("wallet:deposit.pix_expired"));
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearDepositTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tab, depositStep, depositInfo?.depositId]);

  useEffect(() => {
    if (!isOpen) return;
    if (tab !== "deposit") return;
    if (depositStep === 3) {
      clearDepositTimer();
      setDepositExpiresSec(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tab, depositStep]);

  useEffect(() => {
    if (!isOpen) {
      clearDepositPoll();
      return;
    }
    if (tab !== "deposit") {
      clearDepositPoll();
      return;
    }
    if (![2, 3].includes(depositStep)) {
      clearDepositPoll();
      return;
    }
    const depositId = String(depositInfo?.depositId || '').trim();
    if (!depositId || !user?.id) {
      clearDepositPoll();
      return;
    }

    clearDepositPoll();
    depositPollRef.current = setInterval(() => {
      void syncPendingDepositStatus(depositId);
    }, 4000);

    void syncPendingDepositStatus(depositId);

    return () => clearDepositPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tab, depositStep, depositInfo?.depositId, user?.id]);

  const copyPix = async () => {
    const payload = depositInfo?.payload ? String(depositInfo.payload) : "";
    if (!payload) return;
    SoundManager.uiClick();
    const ok = await copyToClipboard(payload);
    setCopiedPix(ok);
    if (ok) setTimeout(() => setCopiedPix(false), 2000);
  };

  const formatMMSS = (sec) => {
    const s = Math.max(0, Number(sec) || 0);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(Math.floor(s % 60)).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  // ==========================
  // ✅ SAQUE (TAXA RETIRADA DO VALOR, NÃO SOMADA)
  // ==========================
  const WITHDRAW_ACCOUNT_TYPE = "REAL";
  const available = useMemo(() => {
    const real = balances?.REAL ?? null;
    const b = toNumberSafe(real);
    if (b === null) return 0;
    return Math.max(0, b);
  }, [balances]);

  const withdrawableCash = useMemo(() => {
    const v = toNumberSafe(withdrawLimits?.withdrawable_cash);
    // ✅ Segurança: sem limites carregados => NÃO assume balances.REAL (evita sacar depósito do bônus)
    if (v === null) return 0;
    return Math.max(0, v);
  }, [withdrawLimits?.withdrawable_cash]);

  const lockedCash = useMemo(() => {
    const v = toNumberSafe(withdrawLimits?.locked_cash);
    return v === null ? 0 : Math.max(0, v);
  }, [withdrawLimits?.locked_cash]);

  // ✅ Rollover (prioriza RPC get_withdrawable_real; fallback leve em bonusUsage se existir)
  const rolloverTargetLive = useMemo(() => {
    const v = toNumberSafe(withdrawLimits?.rollover_target);
    if (v !== null) return Math.max(0, v);
    return getRolloverTarget(bonusUsage);
  }, [withdrawLimits?.rollover_target, bonusUsage]);

  const rolloverProgressLive = useMemo(() => {
    const v = toNumberSafe(withdrawLimits?.rollover_progress);
    if (v !== null) return Math.max(0, v);
    return getRolloverProgress(bonusUsage);
  }, [withdrawLimits?.rollover_progress, bonusUsage]);

  const rolloverPctLive = useMemo(() => {
    if (rolloverTargetLive <= 0) return 0;
    return clamp(rolloverProgressLive / rolloverTargetLive, 0, 1);
  }, [rolloverProgressLive, rolloverTargetLive]);




  const cpfPixKey = useMemo(() => {
    const cpf = profile?.cpf ? String(profile.cpf).trim() : "";
    return cpf;
  }, [profile?.cpf]);

  const fullName = useMemo(() => {
    const p = profile || {};
    const n =
      (p.name && String(p.name).trim()) ||
      `${String(p.first_name || "").trim()} ${String(p.last_name || "").trim()}`.trim() ||
      "";
    return n || "—";
  }, [profile]);

  const emailConfirmed = Boolean(profile?.email_verified);
  const hasFilledPersonalData = useMemo(() => {
    const p = profile || {};
    const okName = (p.first_name && String(p.first_name).trim()) || (p.name && String(p.name).trim());
    const okPhone = p.phone && String(p.phone).trim();
    const okCountry = p.country && String(p.country).trim();
    const okCity = p.city && String(p.city).trim();
    const okSex = p.sex && String(p.sex).trim();
    const okCpf = p.cpf && String(p.cpf).trim();
    const okBirth = Boolean(p.birth_date);
    return Boolean(okName && okPhone && okCountry && okCity && okSex && okCpf && okBirth);
  }, [profile]);

  const [kycStatus, setKycStatus] = useState(null);
  const kycPollRef = useRef(null);
  const fetchLatestKyc = async (uid) => {
    if (!uid) return null;
    try {
      const { data, error } = await supabase
        .from("kyc_requests")
        .select("id,status,admin_note,reviewed_at,submitted_at,created_at")
        .eq("user_id", uid)
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = Array.isArray(data) && data.length ? data[0] : null;
      setKycStatus(row?.status || null);
      return row || null;
    } catch (e) {
      console.warn("[WalletModal] fetch kyc_requests error:", e?.message || e);
      setKycStatus(null);
      return null;
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const uid = user?.id;
    if (!uid) return;
    fetchLatestKyc(uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const uid = user?.id;
    if (!uid) return;
    if (kycPollRef.current) {
      clearInterval(kycPollRef.current);
      kycPollRef.current = null;
    }
    if (kycStatus !== "pending") return;
    kycPollRef.current = setInterval(() => {
      fetchLatestKyc(uid);
    }, KYC_POLL_MS);
    return () => {
      if (kycPollRef.current) {
        clearInterval(kycPollRef.current);
        kycPollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.id, kycStatus]);

  const identityLegacyVerified = Boolean(profile?.kyc_verified || profile?.identity_verified || false);
  const identityVerified = Boolean(kycStatus === "approved" || identityLegacyVerified);

  // ✅ FIX micro-bug: só decide gate quando profileReady === true
  const canUseWithdrawScreen = useMemo(() => {
    if (!profileReady) return false;
    return Boolean(profileComplete || (emailConfirmed && hasFilledPersonalData && identityVerified));
  }, [profileReady, profileComplete, emailConfirmed, hasFilledPersonalData, identityVerified]);

  const withdrawNumber = useMemo(() => {
    const n = toNumberSafe(String(withdrawValue || "").replace(",", "."));
    return n === null ? 0 : clamp(n, 0, 999999999);
  }, [withdrawValue]);

  const feeValue = useMemo(() => {
    return withdrawNumber > 0 ? withdrawNumber * WITHDRAW_FEE_PCT : 0;
  }, [withdrawNumber]);

  const netReceive = useMemo(() => {
    return withdrawNumber > 0 ? Math.max(0, withdrawNumber - feeValue) : 0;
  }, [withdrawNumber, feeValue]);

  const totalDebit = useMemo(() => {
    return withdrawNumber;
  }, [withdrawNumber]);

  // ==========================
  // ✅ BÔNUS ATIVO / ROLLOVER (Bloqueio no front)
  // ==========================
  const fetchWithdrawLimits = async () => {
    setWithdrawLimitsBusy(true);
    setWithdrawLimitsError("");
    try {
      const { data, error } = await supabase.rpc("get_withdrawable_real");
      if (error) throw error;
      // data é jsonb { ok, cash, bonus, locked_cash, withdrawable_cash }
      if (data && data.ok === false) throw new Error(data.error || "Falha ao carregar limites.");
      setWithdrawLimits(data || null);
      return data || null;
    } catch (e) {
      console.warn("[WalletModal] fetchWithdrawLimits error:", e?.message || e);
      setWithdrawLimits(null);
      setWithdrawLimitsError(String(e?.message || "Falha ao carregar limites."));
      return null;
    } finally {
      setWithdrawLimitsBusy(false);
    }
  };


  async function syncPendingDepositStatus(depositId, { moveToProcessing = false } = {}) {
    const id = String(depositId || depositInfo?.depositId || '').trim();
    if (!id || !user?.id) return null;

    try {
      const { data, error } = await supabase.functions.invoke("mercadopago-sync-pending-deposits", {
        body: { deposit_id: id },
      });

      if (error) throw error;
      if (!data) return null;

      const status = String(data?.status || '').toUpperCase().trim();
      const credited = Boolean(data?.credited);

      if (status === 'CONFIRMED' && credited) {
        clearDepositTimer();
        clearDepositPoll();
        setDepositError('');
        setDepositStep(3);
        await Promise.allSettled([
          fetchWithdrawLimits(),
          fetchActiveBonusUsage(user.id),
        ]);
        return data;
      }

      if (status === 'EXPIRED' || status === 'CANCELED' || status === 'CANCELLED') {
        resetDepositToStep1(
          status === 'EXPIRED'
            ? t('wallet:deposit.pix_expired')
            : t('wallet:deposit.gateway_failed')
        );
        return data;
      }

      if (moveToProcessing) {
        setDepositStep(3);
      }

      return data;
    } catch (e) {
      const msg = String(e?.message || e || 'Falha ao verificar pagamento.');
      if (moveToProcessing) {
        setDepositStep(3);
      }
      setDepositError(msg);
      return null;
    }
  }

  const fetchActiveBonusUsage = async (uid) => {
    if (!uid) return null;
    setBonusUsageBusy(true);
    setBonusUsageError("");
    try {
      const { data, error } = await supabase
        .from(TBL_BONUS_USAGES)
        .select("*")
        .eq("user_id", uid)
        .in("status", ["active", "ACTIVE"])
        .order("applied_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = Array.isArray(data) && data.length ? data[0] : null;
      setBonusUsage(row || null);
      return row || null;
    } catch (e) {
      console.warn("[WalletModal] fetchActiveBonusUsage error:", e?.message || e);
      setBonusUsage(null);
      setBonusUsageError(t("wallet:withdraw.bonus_rollover_load_failed"));
      return null;
    } finally {
      setBonusUsageBusy(false);
    }
  };

  // ✅ garantir estado do bônus ativo também no DEPÓSITO (para impedir 2 bônus simultâneos)
  useEffect(() => {
    if (!isOpen) return;
    const uid = user?.id || null;
    if (!uid) return;
    void fetchActiveBonusUsage(uid);
    // também carrega limites para refletir saque parcial
    void fetchWithdrawLimits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.id]);

  // ✅ Realtime prático do "Disponível / Bloqueado / Rollover"
  // - wallets realtime atualiza balances.REAL, mas o "withdrawable_cash" vem de RPC derivado
  // - então fazemos um polling leve SOMENTE enquanto o tab de saque estiver aberto
  useEffect(() => {
    if (!isOpen) return;
    if (tab !== "withdraw") return;
    const uid = user?.id || null;
    if (!uid) return;

    // carrega já
    void fetchWithdrawLimits();

    const t = setInterval(() => {
      void fetchWithdrawLimits();
    }, 3000);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tab, user?.id]);

  // ✅ quando o saldo REAL mudar (realtime do wallets), revalida limites (sem esperar o intervalo)
  useEffect(() => {
    if (!isOpen) return;
    if (tab !== "withdraw") return;
    const uid = user?.id || null;
    if (!uid) return;
    void fetchWithdrawLimits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tab, user?.id, balances?.REAL]);




  // ✅ FIX principal: ao entrar em "withdraw", hidrata KYC + bônus ANTES de renderizar gate/painel
  useEffect(() => {
    if (!isOpen) return;
    if (tab !== "withdraw") return;
    const uid = user?.id || null;
    withdrawHydrateSeqRef.current += 1;
    const seq = withdrawHydrateSeqRef.current;
    setWithdrawHydrating(true);
    if (!uid) {
      // sem user: não fica travado em "carregando"
      setWithdrawHydrating(false);
      return;
    }
    (async () => {
      try {
        // garante que os dois estados chegam juntos (sem flicker)
        await Promise.all([fetchLatestKyc(uid), fetchActiveBonusUsage(uid), fetchWithdrawLimits()]);
      } finally {
        if (withdrawHydrateSeqRef.current === seq) {
          setWithdrawHydrating(false);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tab, user?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const uid = user?.id;
    if (!uid) return;
    if (tab !== "withdraw") return;
    // (mantém realtime e refresh após a hidratação inicial)
    cleanupBonusRealtime();
    const ch = supabase
      .channel(`bonus_usages:rt:${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: TBL_BONUS_USAGES, filter: `user_id=eq.${uid}` }, () => {
        void fetchActiveBonusUsage(uid);
      })
      .subscribe();
    bonusRtRef.current = ch;
    return () => cleanupBonusRealtime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.id, tab]);

  const rolloverRequired = rolloverTargetLive;

  const rolloverCompleted = rolloverProgressLive;

  const rolloverProgressPct = rolloverPctLive;

const hasActiveBonusLock = useMemo(() => {
    if (!bonusUsage) return false;
    if (rolloverRequired <= 0) return true;
    return rolloverCompleted + 0.0001 < rolloverRequired;
  }, [bonusUsage, rolloverRequired, rolloverCompleted]);

  const bonusAmountCard = useMemo(() => {
    const v = toNumberSafe(bonusUsage?.bonus_amount);
    if (v === null) return 0;
    return Math.max(0, v);
  }, [bonusUsage?.bonus_amount]);

  const liveBonusBucket = useMemo(() => {
    const v = toNumberSafe(withdrawLimits?.bonus);
    if (v !== null) return Math.max(0, v);
    const initial = toNumberSafe(bonusUsage?.bonus_amount);
    return initial === null ? 0 : Math.max(0, initial);
  }, [withdrawLimits?.bonus, bonusUsage?.bonus_amount]);


  const canWithdrawSubmit = Boolean(
    canUseWithdrawScreen &&
      withdrawNumber >= MIN_WITHDRAW_BRL &&
      totalDebit <= withdrawableCash + 1e-6 &&
      acceptTerms &&
      cpfPixKey &&
      !withdrawBusy
  );

  // ==========================
  // ✅ HISTÓRICO REAL (deposits + withdrawals + ops + wallet_ledger(admin))
  // ==========================
  // ✅ helpers mínimos p/ detectar e exibir bônus no histórico (somente depósitos)
  const getDepositBonusPercent = (r) => {
    const pct =
      toNumberSafe(r?.bonus_percent_snapshot) ??
      toNumberSafe(r?.bonus_percent) ??
      toNumberSafe(r?.bonusPct) ??
      toNumberSafe(r?.bonus_percentage) ??
      null;
    const v = pct === null ? 0 : Number(pct) || 0;
    return Number.isFinite(v) ? Math.max(0, v) : 0;
  };

  const mapDepositRow = (r) => {
    const dt = r?.created_at
      ? new Date(r.created_at)
      : r?.paid_at
      ? new Date(r.paid_at)
      : r?.confirmed_at
      ? new Date(r.confirmed_at)
      : null;
    const ts = dt ? dt.getTime() : 0;
    const date = dt ? dt.toLocaleString("pt-BR") : "-";
    const amount = toNumberSafe(r?.credited_amount) ?? toNumberSafe(r?.account_amount) ?? toNumberSafe(r?.amount) ?? toNumberSafe(r?.amount_gross) ?? toNumberSafe(r?.value) ?? toNumberSafe(r?.total) ?? 0;
    const currency = normalizeCurrency(r?.credited_currency || r?.account_currency || r?.currency || "BRL", accountCurrency);
    const method = String(r?.method || r?.payment_method || r?.pay_method || "PIX");
    const st = String(r?.status || "").toUpperCase();
    const creditedFlag = Boolean(r?.credited);
    let statusLabel = st || "-";
    let statusKind = "default"; // ✅ success | pending | expired | canceled | default
    if (st === "PENDING") {
      statusLabel = t("wallet:status.deposit.pending");
      statusKind = "pending";
    }
    if (st === "CONFIRMED" || st === "RECEIVED") {
      statusLabel = t("wallet:status.deposit.success");
      statusKind = "success";
    }
    if (st === "PAID" || st === "SUCCESS") {
      statusLabel = t("wallet:status.deposit.success");
      statusKind = "success";
    }
    if (creditedFlag) {
      statusLabel = t("wallet:status.deposit.success");
      statusKind = "success";
    }
    if (st === "EXPIRED") {
      statusLabel = t("wallet:status.deposit.expired");
      statusKind = "expired";
    }
    if (st === "CANCELED" || st === "CANCELLED") {
      statusLabel = t("wallet:status.deposit.canceled");
      statusKind = "canceled";
    }
    // ✅ bônus (somente para exibição no histórico)
    const bonusPct = getDepositBonusPercent(r);
    const hasBonus = bonusPct > 0 && (Boolean(r?.bonus_code_id) || Boolean(r?.bonus_code) || bonusPct > 0);
    const bonusAmount = hasBonus ? (Number(amount) || 0) * (bonusPct / 100) : 0;
    return { type: "deposit", ts, date, method, amount, currency, status: statusLabel, statusKind, hasBonus, bonusPct, bonusAmount };
  };

  const mapWithdrawRow = (r) => {
    const dt = r?.created_at ? new Date(r.created_at) : r?.requested_at ? new Date(r.requested_at) : r?.paid_at ? new Date(r.paid_at) : null;
    const ts = dt ? dt.getTime() : 0;
    const date = dt ? dt.toLocaleString("pt-BR") : "-";
    const amount = toNumberSafe(r?.amount_gross) ?? toNumberSafe(r?.amount) ?? toNumberSafe(r?.value) ?? 0;
    const currency = normalizeCurrency(r?.currency || accountCurrency, accountCurrency);
    const method = String(r?.method || r?.payment_method || r?.pay_method || "PIX");
    const st = String(r?.status || "").toUpperCase();
    let statusLabel = st || "-";
    let statusKind = "default"; // ✅ success | pending | expired | canceled | default
    if (st === "PENDING") {
      statusLabel = t("wallet:status.withdraw.pending");
      statusKind = "pending";
    }
    if (
      st === "REVIEWER" ||
      st === "REVIEW" ||
      st === "REVIEWING" ||
      st === "UNDER_REVIEW" ||
      st === "IN_REVIEW" ||
      st === "ANALYSIS" ||
      st === "IN_ANALYSIS"
    ) {
      statusLabel = t("wallet:status.withdraw.review");
      statusKind = "pending"; // ✅ âmbar
    }
    if (st === "PAID" || st === "APPROVED" || st === "COMPLETED" || st === "SUCCESS") {
      statusLabel = t("wallet:status.withdraw.paid");
      statusKind = "success";
    }
    if (st === "REJECTED" || st === "CANCELED" || st === "CANCELLED" || st === "FAILED") {
      statusLabel = t("wallet:status.withdraw.rejected");
      statusKind = "canceled";
    }
    return { type: "withdraw", ts, date, method, amount, currency, status: statusLabel, statusKind };
  };

  const mapAdminLedgerRow = (r) => {
    const dt = r?.created_at ? new Date(r.created_at) : null;
    const ts = dt ? dt.getTime() : 0;
    const date = dt ? dt.toLocaleString("pt-BR") : "-";
    const kind = String(r?.kind || "").toUpperCase();
    const delta = toNumberSafe(r?.delta) ?? 0;
    const method = "PIX";
    if (kind === "ADMIN_CREDIT") {
      return { type: "deposit", ts, date, method, amount: Math.abs(delta), currency: normalizeCurrency(r?.currency_snapshot || accountCurrency, accountCurrency), status: t("wallet:status.deposit.success"), statusKind: "success" };
    }
    if (kind === "ADMIN_DEBIT") {
      return { type: "withdraw", ts, date, method, amount: Math.abs(delta), currency: normalizeCurrency(r?.currency_snapshot || accountCurrency, accountCurrency), status: t("wallet:status.withdraw.paid"), statusKind: "success" };
    }
    return null;
  };

  /**
   * ✅ Fonte canônica das operações do front:
   * - Tabela: trade_history
   * - Filtro obrigatório REAL/DEMO: account_type = accountType
   * - Range obrigatório no timestamp correto: created_at (aplicado na query)
   */
  const fetchOpsFromTradeHistory = async (uid, range, accType) => {
    const type = String(accType || "DEMO").toUpperCase() === "REAL" ? "REAL" : "DEMO";
    let q = supabase
      .from(TBL_TRADE_HISTORY)
      .select("*")
      .eq("user_id", uid)
      .eq("account_type", type)
      .order("created_at", { ascending: false })
      .limit(500);
    const from = range?.from ? range.from.toISOString() : null;
    const to = range?.to ? range.to.toISOString() : null;
    // ✅ aplica range na query (created_at)
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    const res = await q;
    if (res.error) throw res.error;
    return { table: TBL_TRADE_HISTORY, data: res.data || [] };
  };

  const mapOpRow = (r) => {
    // ✅ para bater com Admin: created_at é o timestamp canônico do range
    const dt = r?.created_at ? new Date(r.created_at) : null;
    const ts = dt ? dt.getTime() : 0;
    const date = dt ? dt.toLocaleString("pt-BR") : "-";
    const asset = String(r?.asset || r?.symbol || r?.pair || r?.market || "—");
    const side = String(r?.side || r?.direction || r?.type || "").toUpperCase();
    const method = side ? `${asset} • ${side}` : asset;
    const amount = toNumberSafe(r?.amount) ?? toNumberSafe(r?.stake) ?? toNumberSafe(r?.value) ?? toNumberSafe(r?.entry_amount) ?? 0;
    const payout =
      toNumberSafe(r?.payout) ??
      toNumberSafe(r?.payout_amount) ??
      toNumberSafe(r?.return_amount) ??
      toNumberSafe(r?.gross_payout) ??
      null;
    const profit =
      toNumberSafe(r?.profit) ??
      toNumberSafe(r?.pnl) ??
      toNumberSafe(r?.net_profit) ??
      toNumberSafe(r?.result_amount) ??
      null;
    const statusLabel = tradeStatusLabelPT(r, t);
    const resultNorm = normalizeTradeResult(r);
    // ✅ mantém campos necessários para cálculo canônico
    return {
      type: "ops",
      ts,
      date,
      method,
      status: statusLabel,
      amount,
      payout,
      profit,
      result: resultNorm,
      account_type: r?.account_type ?? null,
      created_at: r?.created_at ?? null,
      currency: normalizeCurrency(r?.currency || accountCurrency, accountCurrency),
    };
  };

  const loadHistory = useCallback(async () => {
    const uid = user?.id;
    if (!uid) return;
    try {
      setHistoryLoading(true);
      setHistoryError("");
      const range = resolvedRange || { from: null, to: null };
      const [depRes, wRes, opsRes, ledgerRes] = await Promise.all([
        supabase.from("deposits").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(500),
        supabase.from("withdrawals").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(500),
        // ✅ operações: trade_history canônico + filtro REAL/DEMO + range created_at aplicado na query
        fetchOpsFromTradeHistory(uid, range, accountType),
        supabase
          .from("wallet_ledger")
          .select("id,user_id,account_type,delta,kind,created_at,request_id,show_in_history,meta,currency_snapshot")
          .eq("user_id", uid)
          .eq("show_in_history", true)
          .in("kind", ["ADMIN_CREDIT", "ADMIN_DEBIT"])
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      if (depRes.error) throw depRes.error;
      if (wRes.error) throw wRes.error;
      if (ledgerRes.error) throw ledgerRes.error;
      const deps = (depRes.data || []).map(mapDepositRow);
      const wds = (wRes.data || []).map(mapWithdrawRow);
      const ops = (opsRes?.data || []).map(mapOpRow);
      const adminLedger = (ledgerRes.data || []).map(mapAdminLedgerRow).filter(Boolean);
      setHistoryRows([...deps, ...wds, ...ops, ...adminLedger]);
    } catch (e) {
      console.warn("[WalletModal] loadHistory error:", e?.message || e);
      setHistoryError(t("wallet:history.load_failed"));
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [user?.id, accountType, resolvedRange, t]);

  useEffect(() => {
    if (!isOpen) return;
    const uid = user?.id;
    if (!uid) return;
    if (tab !== "history") {
      if (historyRtRef.current) {
        supabase.removeChannel(historyRtRef.current);
        historyRtRef.current = null;
      }
      return;
    }
    if (historyRtRef.current) {
      supabase.removeChannel(historyRtRef.current);
      historyRtRef.current = null;
    }
    void loadHistory();
    const ch = supabase
      .channel(`wallet:history:rt:${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deposits", filter: `user_id=eq.${uid}` }, () => {
        scheduleHistoryReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawals", filter: `user_id=eq.${uid}` }, () => {
        scheduleHistoryReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_ledger", filter: `user_id=eq.${uid}` }, () => {
        scheduleHistoryReload();
      })
      // ✅ inclui operações (trade_history) no realtime
      .on("postgres_changes", { event: "*", schema: "public", table: TBL_TRADE_HISTORY, filter: `user_id=eq.${uid}` }, () => {
        scheduleHistoryReload();
      })
      .subscribe();
    historyRtRef.current = ch;
    return () => {
      if (historyRtRef.current) {
        supabase.removeChannel(historyRtRef.current);
        historyRtRef.current = null;
      }
      if (historyReloadTimerRef.current) {
        clearTimeout(historyReloadTimerRef.current);
        historyReloadTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.id, tab, loadHistory]);

  const historyKindKey = useMemo(() => {
    const k = String(historyKind || "deposit");
    if (k === "withdraw") return "withdraw";
    if (k === "ops") return "ops";
    return "deposit";
  }, [historyKind]);

  const historyLabel = historyKindKey === "deposit" ? t("wallet:history.kind.deposit") : historyKindKey === "withdraw" ? t("wallet:history.kind.withdraw") : t("wallet:history.kind.ops");

  const historyFiltered = useMemo(() => {
    const { from, to } = resolvedRange;
    const list = (historyRows || []).filter((x) => {
      if (!x) return false;
      if (historyKindKey === "deposit" && x.type !== "deposit") return false;
      if (historyKindKey === "withdraw" && x.type !== "withdraw") return false;
      if (historyKindKey === "ops" && x.type !== "ops") return false;
      const ts = Number(x.ts) || 0;
      if (from && ts < from.getTime()) return false;
      if (to && ts > to.getTime()) return false;
      return true;
    });
    list.sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));
    return list;
  }, [historyRows, historyKindKey, resolvedRange]);

  /**
   * ✅ Resumo de operações (igual Admin):
   * - net por trade usando calcTradeNet(row)
   * - wins = soma dos nets > 0
   * - losses = soma do abs(nets < 0)
   * - net = soma total
   */
  const opsSummary = useMemo(() => {
    if (historyKindKey !== "ops") return null;
    let wins = 0;
    let losses = 0;
    let net = 0;
    for (const h of historyFiltered || []) {
      if (!h || h.type !== "ops") continue;
      const n = calcTradeNet(h);
      net += n;
      if (n > 0) wins += n;
      else if (n < 0) losses += Math.abs(n);
    }
    return { wins, losses, net };
  }, [historyKindKey, historyFiltered]);

  const formatSignedMoney = (n, currency = accountCurrency) => {
    const num = Number.isFinite(Number(n)) ? Number(n) : 0;
    const sign = num > 0 ? "+" : num < 0 ? "-" : "";
    return `${sign}${moneyText(Math.abs(num), currency)}`;
  };

  // ==========================
  // ✅ EXPORTAÇÃO (PDF PROFISSIONAL via print)
  // ==========================
  const buildPdfHtml = (opts) => {
    const { title, subtitle, rows, kindKey, userLabel, cpfLabel, rangeLabel, generatedAt } = opts;
    const byMonth = new Map();
    for (const r of rows) {
      const ts = Number(r.ts) || 0;
      const mk = monthKeyFromTs(ts || Date.now());
      if (!byMonth.has(mk)) byMonth.set(mk, []);
      byMonth.get(mk).push(r);
    }
    const monthKeys = Array.from(byMonth.keys()).sort();
    const calcMonthTotals = (list) => {
      if (kindKey === "deposit") {
        const total = list.reduce((acc, r) => (String(r.status) === t("wallet:status.deposit.success") ? acc + (Number(r.amount) || 0) : acc), 0);
        return { total, label: "Total aprovado no mês" };
      }
      if (kindKey === "withdraw") {
        const total = list.reduce((acc, r) => (String(r.status) === t("wallet:status.withdraw.paid") ? acc + (Number(r.amount) || 0) : acc), 0);
        return { total, label: "Total efetuado no mês" };
      }
      // ✅ operações: total mensal usa NET canônico (igual Admin)
      const totalNet = list.reduce((acc, r) => acc + calcTradeNet(r), 0);
      return { total: totalNet, label: "Resultado líquido do mês" };
    };
    const esc = (s) =>
      String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    const money = (n, currency = accountCurrency) => moneyText(n, currency);
    const headerCols = kindKey === "ops" ? [t("wallet:table.date"), t("wallet:table.method"), t("wallet:table.amount"), t("wallet:table.status")] : [t("wallet:table.date"), t("wallet:table.method"), t("wallet:table.amount"), t("wallet:table.status")];
    const renderRow = (r) => {
      const dt = esc(r.date || "-");
      const method = esc(r.method || "-");
      const val = money(Number(r.amount) || 0, r?.currency || accountCurrency);
      const st = esc(r.status || "-");
      return `
<tr>
<td>${dt}</td>
<td>${method}</td>
<td class="num">${esc(val)}</td>
<td>${st}</td>
</tr>
`;
    };
    const monthSections = monthKeys
      .map((mk) => {
        const list = (byMonth.get(mk) || []).slice().sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
        const totals = calcMonthTotals(list);
        return `
<section class="section">
<div class="sectionTitle">${esc(monthLabelFromKey(mk))}</div>
<table class="tbl">
<thead>
<tr>
${headerCols.map((c) => `<th>${esc(c)}</th>`).join("")}
</tr>
</thead>
<tbody>
${list.map(renderRow).join("") || `<tr><td colspan="4" class="muted">Sem registros</td></tr>`}
</tbody>
<tfoot>
<tr>
<td colspan="2" class="tfootLabel">${esc(totals.label)}</td>
<td class="num tfootVal">${esc(kindKey === "ops" ? formatBRL(totals.total) : money(totals.total))}</td>
<td></td>
</tr>
</tfoot>
</table>
</section>
`;
      })
      .join("");
    return `
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(title)}</title>
<style>
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
body {
font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
color: #0f172a;
margin: 0;
background: #fff;
}
.wrap { width: 100%; }
.top {
display: flex;
justify-content: space-between;
align-items: flex-start;
gap: 16px;
border-bottom: 1px solid #e2e8f0;
padding-bottom: 10px;
margin-bottom: 12px;
}
.brand {
font-weight: 900;
font-size: 16px;
letter-spacing: 0.2px;
}
.title {
font-size: 18px;
font-weight: 800;
margin: 6px 0 0;
}
.sub {
margin: 4px 0 0;
font-size: 12px;
color: #334155;
}
.meta {
text-align: right;
font-size: 12px;
color: #334155;
line-height: 1.35;
white-space: nowrap;
}
.section { margin: 14px 0 18px; page-break-inside: avoid; }
.sectionTitle {
font-size: 13px;
font-weight: 800;
color: #0b1220;
margin: 0 0 8px;
text-transform: capitalize;
}
.tbl {
width: 100%;
border-collapse: collapse;
border: 1px solid #e2e8f0;
border-radius: 10px;
overflow: hidden;
}
th, td {
border-bottom: 1px solid #e2e8f0;
padding: 9px 10px;
font-size: 11px;
vertical-align: top;
}
th {
background: #f8fafc;
text-align: left;
font-weight: 800;
color: #0f172a;
}
tr:last-child td { border-bottom: none; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.muted { color: #64748b; }
tfoot td {
background: #f8fafc;
border-top: 1px solid #e2e8f0;
font-weight: 800;
}
.tfootLabel { color: #0f172a; }
.tfootVal { color: #0f172a; }
.footNote {
margin-top: 10px;
font-size: 10px;
color: #64748b;
border-top: 1px dashed #e2e8f0;
padding-top: 10px;
}
</style>
</head>
<body>
<div class="wrap">
<div class="top">
<div>
<div class="brand">TradePro</div>
<div class="title">${esc(title)}</div>
<div class="sub">${esc(subtitle)}</div>
<div class="sub">${esc(rangeLabel)}</div>
</div>
<div class="meta">
<div><b>Usuário:</b> ${esc(userLabel)}</div>
${cpfLabel ? `<div><b>CPF:</b> ${esc(cpfLabel)}</div>` : ""}
<div><b>Gerado em:</b> ${esc(generatedAt)}</div>
</div>
</div>
${monthSections}
<div class="footNote">
Este relatório foi gerado automaticamente. Para fins de declaração e conferência, utilize os totais mensais apresentados.
</div>
</div>
<script>
setTimeout(() => {
try { window.focus(); window.print(); } catch (e) {}
}, 300);
</script>
</body>
</html>
`.trim();
  };

  const exportHistoryPdf = () => {
    SoundManager.uiClick();
    const rows = historyFiltered.slice();
    const now = new Date();
    const userLabel = profile?.email || user?.email || (user?.id ? `ID ${String(user.id).slice(0, 8)}…` : "—");
    const cpfLabel = profile?.cpf ? String(profile.cpf) : "";
    let rangeLabel = "Período: —";
    if (resolvedRange?.from && resolvedRange?.to) {
      rangeLabel = `Período: ${fmtDateBR(resolvedRange.from)} ${t("wallet:common.until")} ${fmtDateBR(resolvedRange.to)}`;
    } else if (resolvedRange?.from && !resolvedRange?.to) {
      rangeLabel = `Período: ${t("wallet:common.until")} ${fmtDateBR(resolvedRange.from)}`;
    } else if (!resolvedRange?.from && resolvedRange?.to) {
      rangeLabel = `Período: ${t("wallet:common.until")} ${fmtDateBR(resolvedRange.to)}`;
    }
    const title =
      historyKindKey === "deposit"
        ? t("wallet:history.kind.deposit")
        : historyKindKey === "withdraw"
        ? t("wallet:history.kind.withdraw")
        : t("wallet:history.kind.ops");
    const subtitle =
      historyKindKey === "deposit"
        ? t("wallet:history.kind.deposit")
        : historyKindKey === "withdraw"
        ? t("wallet:history.kind.withdraw")
        : t("wallet:history.kind.ops");
    const html = buildPdfHtml({
      title,
      subtitle,
      rows,
      kindKey: historyKindKey,
      userLabel,
      cpfLabel,
      rangeLabel,
      generatedAt: fmtDateTimeBR(now),
    });
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      downloadText(`relatorio_${historyKindKey}_${now.toISOString().slice(0, 10)}.html`, html);
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const exportHistoryCsv = () => {
    SoundManager.uiClick();
    const rows = historyFiltered.map((h) => ({
      Data: h.date || "",
      Metodo: h.method || "",
      Valor: h.amount != null ? moneyText(h.amount, h?.currency || accountCurrency) : "",
      Status: h.status || "",
    }));
    const header = [t("wallet:table.date"), t("wallet:table.method"), t("wallet:table.amount"), t("wallet:table.status")];
    const csv =
      header.join(";") +
      "\n" +
      rows.map((r) => header.map((k) => String(r[k] ?? "").replaceAll(";", ",")).join(";")).join("\n");
    downloadText(`historico_${historyKindKey}_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const goTab = (tKey) => {
    SoundManager.uiClick();
    // 🔥 FIX: se entrar em withdraw por qualquer caminho, já liga "Carregando..." antes do paint
    if (tKey === "withdraw") {
      setWithdrawHydrating(true);
    }
    setTab(tKey);
    setHistoryOpen(false);
    if (tKey === "deposit") setDepositStep(1);
    if (tKey === "withdraw") {
      setWithdrawError("");
      setWithdrawOk(false);
    }
    if (tKey === "history") {
      void loadHistory();
    }
  };

  const applyPromo = async () => {
    const code = String(promoCode || "").trim();
    if (!code) return;
    SoundManager.uiClick();
    setPromoBusy(true);
    setPromoError("");
    try {
      if (bonusUsage) {
        throw new Error("Você já possui um bônus ativo. Conclua ou cancele para aplicar outro.");
      }
      const meta = await validateBonusCode({ codeRaw: code, amount: depositNumber });
      if (!meta?.bonus_percent || meta.bonus_percent <= 0) {
        throw new Error("Este bônus está configurado com percentual inválido.");
      }
      setPromoMeta(meta);
      setPromoApplied(true);
    } catch (e) {
      setPromoMeta(null);
      setPromoApplied(false);
      setPromoError(String(e?.message || "Falha ao aplicar bônus."));
    } finally {
      setPromoBusy(false);
    }
  };

  const openBonusTerms = () => {
    SoundManager.uiClick();
    setBonusTermsOpen(true);
  };

  const closeBonusTerms = useCallback(() => {
    SoundManager.uiClick();
    setBonusTermsOpen(false);
  }, []);

  // ✅ Termos e condições (dinâmico pelo bônus aplicado)
  const promoTermsModel = useMemo(() => {
    if (!promoApplied || !promoMeta) return null;
    const minDep = clampNonNeg(toNumberSafe(promoMeta?.min_deposit) ?? 0) || 100;
    const maxDep = clampNonNeg(toNumberSafe(promoMeta?.max_deposit) ?? 0) || 5000;
    const pct = clampNonNeg(toNumberSafe(promoMeta?.bonus_percent) ?? 0);
    const rolloverX = clampNonNeg(toNumberSafe(promoMeta?.rollover_x) ?? 0) || 20;
    const depositAmt = clampNonNeg(depositNumber);
    const bonusAmt = depositAmt * (pct / 100);
    const computedTarget = bonusAmt * rolloverX;
    const fixedTarget = clampNonNeg(toNumberSafe(promoMeta?.rollover_target) ?? 0);
    const target = fixedTarget > 0 ? fixedTarget : computedTarget;
    return {
      minDep,
      maxDep,
      pct,
      rolloverX,
      target,
    };
  }, [promoApplied, promoMeta, depositNumber]);

  // ==========================
  // ✅ SOLICITAR SAQUE REAL (RPC)
  // ==========================
  const withdrawRequest = async () => {
    SoundManager.uiClick();
    if (!canWithdrawSubmit) return;
    setWithdrawError("");
    setWithdrawOk(false);
    try {
      setWithdrawBusy(true);
      // ✅ Segurança: não permite sacar enquanto limites não estiverem carregados
      if (withdrawLimitsBusy) throw new Error("Carregando limites de saque...");
      if (!withdrawLimits) throw new Error(withdrawLimitsError || "Carregando limites de saque...");
      if (!user?.id) throw new Error(t("wallet:withdraw.must_be_logged"));
      if (!cpfPixKey) throw new Error(t("wallet:withdraw.invalid_pix_key"));
      if (withdrawNumber > withdrawableCash + 1e-6) {
        throw new Error(t("wallet:withdraw.insufficient_balance"));
      }
      const requestId = `wd_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      // ✅ preferir RPC nova (libera saque parcial do cash sacável)
      let data = null;
      let error = null;
      try {
        const r = await supabase.rpc("request_withdrawal_real", {
          p_amount: withdrawNumber,
          p_pix_key: cpfPixKey,
          p_name: fullName,
        });
        data = r.data;
        error = r.error;
      } catch (e) {
        error = e;
      }

      // fallback legado
      if (error && String(error?.message || error).toLowerCase().includes("request_withdrawal_real")) {
        const r2 = await supabase.rpc("request_withdrawal", {
          p_user_id: user.id,
          p_account_type: WITHDRAW_ACCOUNT_TYPE,
          p_method: "PIX",
          p_destination: cpfPixKey,
          p_amount_gross: withdrawNumber,
          p_fee_percent: WITHDRAW_FEE_PCT,
          p_request_id: requestId,
        });
        data = r2.data;
        error = r2.error;
      }

      if (error) throw error;
      if (data?.ok === false) {
        if (String(data?.error || "").toLowerCase() === "bonus_locked") {
          throw new Error(data?.message || t("wallet:withdraw.blocked_bonus_rollover"));
        }
        throw new Error(data?.error || t("wallet:withdraw.request_failed"));
      }
      setWithdrawOk(true);
      setWithdrawValue("");
      setAcceptTerms(false);
      void loadHistory();
    } catch (e) {
      setWithdrawError(String(e?.message || e));
    } finally {
      setWithdrawBusy(false);
    }
  };

  const goProfile = () => {
    SoundManager.uiClick();
    onClose?.();
    onGoProfile?.("perfil");
  };

  const openSupportPanel = () => {
    SoundManager.uiClick?.();
    onClose?.();

    try {
      window.dispatchEvent(
        new CustomEvent(OVERLAY_OPEN_EVENT, { detail: { id: "support" } })
      );
    } catch {
      // noop
    }
  };

  // ✅ Scroll necessário para DEPÓSITO e SAQUE (termos/rollover podem ficar abaixo do viewport)
  // - Histórico já possui área scrollável própria (tbody)
  const bodyScrollOn = tab === "deposit" || tab === "withdraw";

  // ✅ style vars: só aplica fora do trading-host (no host, CSS absolute inset:0 domina)
  const overlayStyle = useMemo(() => {
    if (isTradingHost) return undefined;
    return overlayVars;
  }, [isTradingHost, overlayVars]);

  if (!isOpen) return null;

  // ✅ helpers visuais do histórico (chips)
  const getStatusChipVariantClass = (statusText, statusKind) => {
    const k = String(statusKind || "").toLowerCase().trim();
    // ✅ prioridade: classificação explícita (depósito/saque)
    if (k) {
      if (k === "success") return styles.statusChipSuccess;
      if (k === "pending") return styles.statusChipPending;
      if (k === "expired") return styles.statusChipExpired;
      if (k === "canceled") return styles.statusChipCanceled;
      return styles.statusChipDefault;
    }
    // fallback (mantido): por texto
    const s = String(statusText || "").toUpperCase().trim();
    if (s === t("wallet:status.deposit.success").toUpperCase() || s === t("wallet:status.withdraw.paid").toUpperCase()) return styles.statusChipSuccess;
    if (s === t("wallet:status.deposit.pending").toUpperCase() || s === t("wallet:status.withdraw.review").toUpperCase()) return styles.statusChipPending;
    if (s === t("wallet:status.deposit.expired").toUpperCase()) return styles.statusChipExpired;
    if (s === t("wallet:status.deposit.canceled").toUpperCase() || s === t("wallet:status.withdraw.rejected").toUpperCase()) return styles.statusChipCanceled;
    return styles.statusChipDefault;
  };

  const content = (
    <div
      className={`${styles.overlayArea} walletModalOverlayArea`}
      style={overlayStyle}
      role="dialog"
      aria-modal="false"
      aria-label="Wallet"
    >
      <div className={styles.panel}>
        <div className={styles.modalFill}>
          <div className={styles.topBar}>
            <div className={styles.tabs}>
              <button className={`${styles.tabBtn} ${tab === "deposit" ? styles.active : ""}`} onClick={() => goTab("deposit")} type="button">
                {t("wallet:tabs.deposit")}
              </button>
              <button className={`${styles.tabBtn} ${tab === "withdraw" ? styles.active : ""}`} onClick={() => goTab("withdraw")} type="button">
                {t("wallet:tabs.withdraw")}
              </button>
              <button className={`${styles.tabBtn} ${tab === "history" ? styles.active : ""}`} onClick={() => goTab("history")} type="button">
                {t("wallet:tabs.history")}
              </button>
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => {
                SoundManager.uiClick();
                onClose?.();
              }}
              aria-label={t("wallet:common.close")}
              title={t("wallet:common.close")}
            >
              ✕
            </button>
          </div>
          <div className={`${styles.body} ${bodyScrollOn ? styles.bodyScroll : ""}`}>
            {/* DEPÓSITO */}
            {tab === "deposit" && (
              <div className={styles.depositWrap}>
                <div className={styles.stepper}>
                  <div className={`${styles.stepItem} ${depositStep >= 1 ? styles.stepOn : ""}`}>
                    <span className={styles.stepCircle}>1</span>
                    <span className={styles.stepLabel}>{t("wallet:deposit.step.details")}</span>
                  </div>
                  <div className={styles.stepLine} />
                  <div className={`${styles.stepItem} ${depositStep >= 2 ? styles.stepOn : ""}`}>
                    <span className={styles.stepCircle}>2</span>
                    <span className={styles.stepLabel}>{t("wallet:deposit.step.payment")}</span>
                  </div>
                  <div className={styles.stepLine} />
                  <div className={`${styles.stepItem} ${depositStep >= 3 ? styles.stepOn : ""}`}>
                    <span className={styles.stepCircle}>3</span>
                    <span className={styles.stepLabel}>{t("wallet:deposit.step.confirm")}</span>
                  </div>
                </div>
                {/* STEP 1 (NÃO MEXE) */}
                {depositStep === 1 && (
                  <div className={styles.depositGrid}>
                    <div className={styles.leftPane}>
                      <>
                        <div className={styles.methodCard}>
                          <img src={pixLogo} alt="" className={styles.methodPixLogo} draggable={false} aria-hidden />
                          <div className={styles.methodInfo}>
                            <div className={styles.methodSub}>
                              <div>{accountCurrency === "BRL" ? `${t("wallet:deposit.minimum")}: ${moneyText(MIN_DEPOSIT_BRL, "BRL")}` : `Pix mínimo: ${moneyText(MIN_DEPOSIT_BRL, "BRL")}`}</div>
                              <div>{t("wallet:deposit.processing_time")}</div>
                            </div>
                          </div>
                        </div>
                        <div className={styles.valueRow}>
                          <div className={styles.valuePrefix}>{accountCurrencySymbol}</div>
                          <input className={styles.valueInput} value={depositValue} onChange={(e) => setDepositValue(e.target.value)} inputMode="decimal" />
                        </div>
                        {depositNumber > 0 && depositNumber < MIN_DEPOSIT_BRL ? (
                          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.95, color: "#ff6b6b", fontWeight: 800 }}>
                            Depósito mínimo via Pix: {moneyText(MIN_DEPOSIT_BRL, "BRL")}.
                          </div>
                        ) : null}

                        <div className={styles.quickGrid}>
                          {quickValues.map((v) => (
                            <button
                              type="button"
                              key={v}
                              className={styles.quickBtn}
                              onClick={() => {
                                SoundManager.uiClick();
                                setDepositValue(String(v));
                              }}
                            >
                              {moneyValue(v)}
                            </button>
                          ))}
                        </div>
                        <label className={styles.promoRow}>
                          <input
                            type="checkbox"
                            checked={hasPromo}
                            onChange={(e) => {
                              SoundManager.uiClick();
                              const ck = Boolean(e.target.checked);
                              setHasPromo(ck);
                              setPromoApplied(false);
                              setPromoMeta(null);
                              setPromoError("");
                              if (!ck) setPromoCode("");
                            }}
                          />
                          <span>{t("wallet:deposit.has_promo_code")}</span>
                        </label>
                        {hasPromo && (
                          <>
                            <div className={styles.promoBox}>
                              <input
                                className={styles.promoInput}
                                value={promoCode}
                                onChange={(e) => {
                                  setPromoCode(e.target.value);
                                  if (promoApplied) setPromoApplied(false);
                                  if (promoMeta) setPromoMeta(null);
                                  if (promoError) setPromoError("");
                                }}
                                placeholder={t("wallet:deposit.placeholder_enter_here")}
                                spellCheck={false}
                                autoComplete="off"
                              />
                              <button
                                type="button"
                                className={`${styles.promoApplyBtn} ${!String(promoCode || "").trim() || promoBusy ? styles.disabled : ""}`}
                                onClick={applyPromo}
                                disabled={!String(promoCode || "").trim() || promoBusy}
                              >
                                {promoBusy ? t("wallet:common.applying") : t("wallet:common.apply")}
                              </button>
                              {promoApplied && <div className={styles.promoOk}>{t("wallet:common.code_applied")}</div>}
                            </div>
                            {promoError ? (
                              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.95, color: "#ff6b6b" }}>
                                {promoError}
                              </div>
                            ) : null}
                            <div className={styles.bonusLine}>
                              <span className={styles.bonusPrefix}>{t("wallet:common.questions")} </span>
                              <button type="button" className={styles.bonusLink} onClick={openBonusTerms}>
                                {t("wallet:common.check_bonus_terms")}
                              </button>
                            </div>

                            {/* ✅ Termos e Condições (após aplicar cupom) */}
                            {promoApplied && promoMeta && promoTermsModel ? (
                              <div className={styles.bonusTcBox}>
                                <div className={styles.bonusTcTitle}>
                                  {t("wallet:bonus_tc.title", {
                                    defaultValue: "Termos e Condições:",
                                  })}
                                </div>
                                <div className={styles.bonusTcBody}>
                                  <div className={styles.bonusTcItem}>
                                    1 - {t("wallet:bonus_tc.line1_prefix", { defaultValue: "O depósito mínimo para ativar o cupom é" })} {moneyText(promoTermsModel.minDep)} {t("wallet:bonus_tc.line1_mid", { defaultValue: "e o máximo permitido é" })} {moneyText(promoTermsModel.maxDep)}.
                                  </div>
                                  <div className={styles.bonusTcItem}>
                                    2 - {t("wallet:bonus_tc.line2_prefix", { defaultValue: "O bônus adiciona" })} {Math.round(promoTermsModel.pct)}% {t("wallet:bonus_tc.line2_suffix", { defaultValue: "do depósito ao saldo da sua conta real. Somente sendo permitido o saque do valor depositado+bônus após atingir a movimentação necessária de" })} {Math.round(promoTermsModel.rolloverX)}x {t("wallet:bonus_tc.line2_end", { defaultValue: "o valor do bônus." })}
                                  </div>
                                  <div className={styles.bonusTcItem}>
                                    3 - {t("wallet:bonus_tc.line3_prefix", { defaultValue: "Você pode realizar o saque do bônus, após o seu volume de negócios líquido atingir" })} {moneyText(promoTermsModel.target)}.
                                  </div>
                                  <div className={styles.bonusTcItem}>
                                    4 - {t("wallet:bonus_tc.line4", { defaultValue: "A corretora tem o direito de alterar os termos do bônus ou encerrar esta promoção a qualquer momento sem aviso prévio." })}
                                  </div>
                                  <div className={styles.bonusTcItem}>
                                    5 - {t("wallet:bonus_tc.line5", { defaultValue: "O capital depositado sem o uso de bônus pode ser sacado a qualquer momento." })}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </>
                        )}
                        {depositError ? (
                          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
                            <span style={{ color: "#ff6b6b" }}>{depositError}</span>
                          </div>
                        ) : null}
                      </>
                    </div>
                    <div className={styles.rightPane}>
                      <div className={styles.receiveTitleRow}>
                        <span className={styles.receiveArrow} aria-hidden>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M6.5 9.5L12 15l5.5-5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        <span className={styles.receiveTitle}>{t("wallet:deposit.you_receive")}</span>
                      </div>
                      <div className={styles.receiveValue}>{moneyText(receiveTotal)}</div>
                      <button
                        type="button"
                        className={`${styles.depositBtn} ${!canDeposit || depositBusy ? styles.disabled : ""}`}
                        onClick={() => {
                          if (!canDeposit || depositBusy) return;
                          return startDeposit();
                        }}
                        disabled={!canDeposit || depositBusy}
                      >
                        {depositBusy ? t("wallet:deposit.generating") : t("wallet:deposit.deposit")}
                      </button>
                      <div className={styles.helpText}>{t("wallet:deposit.support_question")}</div>
                      <button type="button" className={styles.supportLink} onClick={openSupportPanel}>
                        {t("wallet:deposit.talk_support")}
                      </button>
                    </div>
                  </div>
                )}
                {/* STEP 2 */}
                {depositStep === 2 && (
                  <div className={styles.payPage}>
                    <div className={styles.payCard}>
                      <div className={styles.paymentTitle}>{t("wallet:deposit.pix_payment_title")}</div>
                      {depositExpiresSec > 0 ? (
                        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85, color: "#9aa4b2" }}>
                          {t("wallet:deposit.qr_expires_in")} <b>{formatMMSS(depositExpiresSec)}</b>
                        </div>
                      ) : null}
                      <div className={styles.paymentSub}>
                        {t("wallet:deposit.deposit_correct_amount")} <b>{moneyText(depositInfo?.quote?.pixAmountBrl ?? depositNumber, "BRL")}</b> {t("wallet:deposit.to_key")}:
                      </div>
                      <div
                        className={styles.qrBox}
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          overflow: "hidden",
                        }}
                      >
                        {depositInfo?.encodedImage ? (
                          <img
                            alt={t("wallet:deposit.qr_alt")}
                            src={`data:image/png;base64,${depositInfo.encodedImage}`}
                            className={styles.qrImg}
                            style={{
                              display: "block",
                              maxWidth: "100%",
                              height: "auto",
                              objectFit: "contain",
                            }}
                          />
                        ) : (
                          <div className={styles.qrFake} />
                        )}
                      </div>
                      <div className={styles.pixCopyTitle}>{t("wallet:deposit.pix_copy_title")}</div>
                      <div className={styles.pixCopyRow}>
                        <div className={styles.pixPayloadBox}>{depositInfo?.payload ? String(depositInfo.payload) : "—"}</div>
                        <button type="button" className={styles.copyBtn} onClick={copyPix} disabled={!depositInfo?.payload}>
                          {copiedPix ? t("wallet:common.copied") : t("wallet:common.copy_code")}
                        </button>
                      </div>
                      <div className={styles.pixWarn}>
                        {t("wallet:deposit.pix_warning")}
                      </div>
                      {depositError ? (
                        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
                          <span style={{ color: "#ff6b6b" }}>{depositError}</span>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className={styles.payBottomBtn}
                        onClick={() => {
                          SoundManager.uiClick();
                          void syncPendingDepositStatus(depositInfo?.depositId, { moveToProcessing: true });
                        }}
                        disabled={depositBusy}
                      >
                        {t("wallet:deposit.i_paid")}
                      </button>
                      <div className={styles.payBottomSpacer} />
                    </div>
                  </div>
                )}
                {/* STEP 3 */}
                {depositStep === 3 && (
                  <div className={styles.processingPage}>
                    <div className={styles.processingCard}>
                      <div className={styles.processingRow}>
                        <div className={styles.processingIcon} aria-hidden>
                          <svg width="56" height="56" viewBox="0 0 64 64" fill="none">
                            <circle cx="32" cy="32" r="22" stroke="rgba(255,255,255,0.78)" strokeWidth="5" />
                            <path d="M32 18v14l10 6" stroke="rgba(255,255,255,0.82)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <div className={styles.processingText}>
                          <div className={styles.processingTitle}>{t("wallet:deposit.processing_title")}</div>
                          <div className={styles.processingP}>{t("wallet:deposit.processing_p1")}</div>
                          <div className={styles.processingP}>{t("wallet:deposit.processing_p2")}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.processingOk}
                        onClick={() => {
                          SoundManager.uiClick();
                          onClose?.();
                        }}
                      >
                        OK
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SAQUE */}
            {tab === "withdraw" && (
              <div className={styles.withdrawWrap}>
                {/* ✅ FIX: não renderiza gate/painel até hidratar KYC + bônus (sem flicker) */}
                {withdrawHydrating || !profileReady ? (
                  <div className={styles.withdrawGate}>
                    <div className={styles.withdrawMsg}>{t("wallet:common.loading")}</div>
                  </div>
                ) : !canUseWithdrawScreen ? (
                  <div className={styles.withdrawGate}>
                    <div className={styles.withdrawMsg}>{t("wallet:withdraw.fill_profile_first")}</div>
                    <button type="button" className={styles.primaryBtn} onClick={goProfile}>
                      {t("wallet:common.fill")}
                    </button>
                  </div>
                ) : (
                  <div className={styles.withdrawPanel}>
                    <div className={styles.withdrawGrid}>
                      <div className={styles.withdrawCards}>
                        {(bonusUsage || rolloverRequired > 0 || liveBonusBucket > 0.0001 || lockedCash > 0.0001) ? (
                          <div className={styles.withdrawCard}>
                            <div className={styles.withdrawCardLabel}>
                              Rollover{bonusUsage?.code ? ` (${String(bonusUsage.code).toUpperCase()})` : ""}:
                            </div>

                            {rolloverRequired > 0 ? (
                              <>
                                <div className={styles.withdrawCardValue}>
                                  {moneyText(rolloverCompleted)} <span style={{ opacity: 0.8 }}>{t("wallet:common.of")}</span> {moneyText(rolloverRequired)}
                                </div>

                                <div
                                  style={{
                                    marginTop: 10,
                                    width: "100%",
                                    height: 8,
                                    borderRadius: 999,
                                    background: "rgba(255,255,255,0.10)",
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      height: "100%",
                                      width: `${Math.round(rolloverProgressPct * 100)}%`,
                                      background: "rgba(124,255,138,0.95)",
                                      borderRadius: 999,
                                      transition: "width 240ms ease",
                                    }}
                                  />
                                </div>

                                <div className={`${styles.withdrawPixHint} ${styles.withdrawPixHintExtra}`} style={{ marginTop: 10 }}>
                                  {rolloverCompleted + 0.0001 < rolloverRequired ? (
                                    <>
                                      Bloqueado até bater a meta do bônus.
                                      <br />
                                      Progresso: <b>{Math.round(rolloverProgressPct * 100)}%</b>
                                    </>
                                  ) : (
                                    <>
                                      Meta atingida ✅
                                      <br />
                                      Saque liberado.
                                    </>
                                  )}
                                </div>
                              </>
                            ) : (
                              <div className={`${styles.withdrawPixHint} ${styles.withdrawPixHintExtra}`} style={{ marginTop: 8 }}>
                                Bônus ativo detectado. Carregando meta (rollover)… Se continuar assim, o backend não está retornando rollover_target/rollover_progress.
                              </div>
                            )}

                            {bonusUsageError ? (
                              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
                                <span style={{ color: "#ff6b6b" }}>{bonusUsageError}</span>
                              </div>
	                        ) : null}
                          </div>
                        ) : null}
                        <div className={styles.withdrawCard}>
                          <div className={styles.withdrawCardLabel}>{t("wallet:withdraw.available")}</div>
                          <div className={styles.withdrawCardValue}>{moneyText(withdrawableCash)}</div>
                        </div>

                        {lockedCash > 0 ? (
                          <div className={styles.withdrawCard}>
                            <div className={styles.withdrawCardLabel}>Bloqueado:</div>
                            <div className={styles.withdrawCardValue}>{moneyText(lockedCash)}</div>
                          </div>
                        ) : null}
                        <div className={styles.withdrawCard}>
                          <div className={styles.withdrawCardLabel}>{t("wallet:withdraw.bonus")}</div>
                          <div className={styles.withdrawCardValue}>{moneyText(liveBonusBucket)}</div>
                        </div>
                        <div className={styles.withdrawCard}>
                          <div className={styles.withdrawCardLabel}>{t("wallet:withdraw.fee")}</div>
                          <div className={styles.withdrawCardValue}>{(WITHDRAW_FEE_PCT * 100).toFixed(2).replace(".", ",")}%</div>
                          <div className={`${styles.withdrawPixHint} ${styles.withdrawPixHintExtra}`}>
                            {t("wallet:withdraw.fee_hint_1")}
                            <br />
                            {t("wallet:withdraw.fee_hint_2")}
                          </div>
                        </div>
                      </div>
                      <div className={styles.withdrawPixBox}>
                        <div className={styles.withdrawPixHeader}>
                          <img src={pixLogo} alt="" className={styles.withdrawPixLogo} draggable={false} />
                          <div className={styles.withdrawPixHint}>{t("wallet:withdraw.pix_hint")}</div>
                        </div>
                        {hasActiveBonusLock && withdrawableCash <= 0.0001 ? (
                          <div style={{ marginBottom: 12, fontSize: 12, opacity: 0.95 }}>
                            <span style={{ color: "#ff6b6b" }}>
                              {t("wallet:withdraw.blocked_bonus_rollover")}
                            </span>
                          </div>
                        ) : null}
                        <div className={styles.withdrawField}>
                          <div className={styles.withdrawFieldLabel}>{t("wallet:withdraw.amount_label")}</div>
                          <div className={styles.valueRow}>
                            <div className={styles.valuePrefix}>{accountCurrencySymbol}</div>
                            <input
                              className={`${styles.valueInput} ${styles.withdrawFullInput}`}
                              value={withdrawValue}
                              onChange={(e) => {
                                setWithdrawValue(e.target.value);
                                if (withdrawError) setWithdrawError("");
                                if (withdrawOk) setWithdrawOk(false);
                              }}
                              inputMode="decimal"
                              placeholder={t("wallet:common.zero_amount_placeholder")}
                              disabled={hasActiveBonusLock}
                            />
                          </div>
                          {withdrawNumber > 0 && withdrawNumber < MIN_WITHDRAW_BRL ? (
                            <div className={styles.withdrawWarn}>Saque mínimo: {moneyText(MIN_WITHDRAW_BRL)}.</div>
                          ) : null}
                          {withdrawNumber > 0 && totalDebit > available ? <div className={styles.withdrawWarn}>{t("wallet:withdraw.above_available")}</div> : null}
                        </div>
                        <div className={styles.withdrawField}>
                          <div className={styles.withdrawFieldLabel}>{t("wallet:withdraw.name")}</div>
                          <div className={styles.withdrawReadOnlyBox}>{fullName}</div>
                        </div>
                        <div className={styles.withdrawField}>
                          <div className={styles.withdrawFieldLabel}>{t("wallet:withdraw.pix_key")}</div>
                          <div className={styles.withdrawReadOnlyBox}>{cpfPixKey || "—"}</div>
                        </div>
                        <label className={styles.withdrawTerms}>
                          <input
                            type="checkbox"
                            checked={acceptTerms}
                            onChange={(e) => {
                              SoundManager.uiClick();
                              setAcceptTerms(Boolean(e.target.checked));
                              if (withdrawError) setWithdrawError("");
                              if (withdrawOk) setWithdrawOk(false);
                            }}
                            disabled={hasActiveBonusLock}
                          />
                          <span>{t("wallet:withdraw.accept_terms")}</span>
                        </label>
                        {withdrawError ? (
                          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
                            <span style={{ color: "#ff6b6b" }}>{withdrawError}</span>
                          </div>
                        ) : null}
                        {withdrawOk ? (
                          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.95 }}>
                            <span style={{ color: "#7CFF8A" }}>{t("wallet:withdraw.request_success")}</span>
                          </div>
                        ) : null}
                        <button
                          type="button"
                          className={`${styles.withdrawBtn} ${!canWithdrawSubmit ? styles.disabled : ""}`}
                          onClick={withdrawRequest}
                          disabled={!canWithdrawSubmit}
                        >
                          {withdrawBusy ? t("wallet:withdraw.requesting") : t("wallet:withdraw.request")}
                        </button>
                        <div className={styles.withdrawMeta}>
                          {t("wallet:withdraw.meta_fee")}: <b>{moneyText(feeValue)}</b> • {t("wallet:withdraw.meta_receive")}: <b>{moneyText(netReceive)}</b> • {t("wallet:withdraw.meta_debit")}: <b>{moneyText(totalDebit)}</b>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ✅ HISTÓRICO */}
            {tab === "history" && (
              <div className={styles.historyWrap}>
                <div className={styles.historyTop}>
                  <div ref={historyDropRef} className={styles.historyDropdown}>
                    <button
                      type="button"
                      className={`${styles.historySelectBtn} ${historyOpen ? styles.historySelectBtnOpen : ""}`}
                      onClick={() => {
                        SoundManager.uiClick();
                        setHistoryOpen((v) => !v);
                      }}
                    >
                      <span className={styles.historySelectText}>{historyLabel}</span>
                      <span className={styles.historyChevron}>▾</span>
                    </button>
                    {historyOpen && (
                      <div className={styles.historyMenu}>
                        <button
                          type="button"
                          className={`${styles.historyItem} ${historyKindKey === "deposit" ? styles.historyItemActive : ""}`}
                          onClick={() => {
                            SoundManager.uiClick();
                            setHistoryKind("deposit");
                            setHistoryOpen(false);
                            void loadHistory();
                          }}
                        >
                          {t("wallet:history.kind.deposit")}
                        </button>
                        <button
                          type="button"
                          className={`${styles.historyItem} ${historyKindKey === "withdraw" ? styles.historyItemActive : ""}`}
                          onClick={() => {
                            SoundManager.uiClick();
                            setHistoryKind("withdraw");
                            setHistoryOpen(false);
                            void loadHistory();
                          }}
                        >
                          {t("wallet:history.kind.withdraw")}
                        </button>
                        <button
                          type="button"
                          className={`${styles.historyItem} ${historyKindKey === "ops" ? styles.historyItemActive : ""}`}
                          onClick={() => {
                            SoundManager.uiClick();
                            setHistoryKind("ops");
                            setHistoryOpen(false);
                            void loadHistory();
                          }}
                        >
                          {t("wallet:history.kind.ops")}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className={styles.historyFilters}>
                    <button
                      type="button"
                      className={`${styles.historyFilterBtn} ${historyRange === HISTORY_RANGE.LAST_7_DAYS ? styles.historyFilterBtnActive : ""}`}
                      onClick={() => setHistoryRange(HISTORY_RANGE.LAST_7_DAYS)}
                    >
                      {t("wallet:history.filters.days7")}
                    </button>
                    <button
                      type="button"
                      className={`${styles.historyFilterBtn} ${historyRange === HISTORY_RANGE.LAST_30_DAYS ? styles.historyFilterBtnActive : ""}`}
                      onClick={() => setHistoryRange(HISTORY_RANGE.LAST_30_DAYS)}
                    >
                      {t("wallet:history.filters.days30")}
                    </button>
                    <button
                      type="button"
                      className={`${styles.historyFilterBtn} ${historyRange === HISTORY_RANGE.THIS_MONTH ? styles.historyFilterBtnActive : ""}`}
                      onClick={() => setHistoryRange(HISTORY_RANGE.THIS_MONTH)}
                    >
                      {t("wallet:history.filters.this_month")}
                    </button>
                    <button
                      type="button"
                      className={`${styles.historyFilterBtn} ${historyRange === HISTORY_RANGE.LAST_MONTH ? styles.historyFilterBtnActive : ""}`}
                      onClick={() => setHistoryRange(HISTORY_RANGE.LAST_MONTH)}
                    >
                      {t("wallet:history.filters.last_month")}
                    </button>
                    <button
                      type="button"
                      className={`${styles.historyFilterBtn} ${historyRange === HISTORY_RANGE.CUSTOM ? styles.historyFilterBtnActive : ""}`}
                      onClick={() => setHistoryRange(HISTORY_RANGE.CUSTOM)}
                    >
                      {t("wallet:history.filters.custom")}
                    </button>
                    {historyRange === HISTORY_RANGE.CUSTOM ? (
                      <>
                        <input type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} className={styles.historyDate} />
                        <span className={styles.historyDateSep}>{t("wallet:common.until")}</span>
                        <input type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} className={styles.historyDate} />
                      </>
                    ) : null}
                  </div>
                  <button type="button" className={styles.exportBtn} onClick={exportHistoryPdf}>
                    <span className={styles.exportIcon}>⭳</span> {t("wallet:history.export_pdf")}
                  </button>
                </div>
                {historyError ? (
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
                    <span style={{ color: "#ff6b6b" }}>{historyError}</span>
                  </div>
                ) : null}
                <div className={styles.table}>
                  {historyLoading ? <div className={styles.historyLoadingOverlay}>{t("wallet:history.loading")}</div> : null}
                  <div className={styles.thead}>
                    <div>{t("wallet:table.date")}</div>
                    <div>{historyKindKey === "ops" ? t("wallet:table.order") : t("wallet:table.method")}</div>
                    <div>{t("wallet:table.amount")}</div>
                    <div>{t("wallet:table.status")}</div>
                  </div>
                  <div className={`${styles.tbody} ${historyKindKey === "ops" ? styles.opsTbody : ""}`}>
                    {historyFiltered.length === 0 ? (
                      <div className={styles.emptyRow} />
                    ) : (
                      historyFiltered.map((h, idx) => {
                        const isDeposit = h?.type === "deposit";
                        const hasBonus = Boolean(h?.hasBonus) && (Number(h?.bonusAmount) || 0) > 0;
                        // ✅ visual: APROVADO -> SUCESSO (somente depósito; mantém "APROVADO" internamente p/ PDF/totais)
                        const statusVisual =
                          isDeposit && String(h?.status || "").toUpperCase() === t("wallet:status.deposit.success").toUpperCase() ? t("wallet:status.deposit.success") : String(h?.status || "-");
                        // ✅ chip: método PIX p/ depósitos (mantém texto original se não for PIX)
                        const methodRaw = String(h?.method || "-");
                        const isPixMethod = isDeposit && String(methodRaw || "").toUpperCase().includes("PIX");
                        // ✅ valor (depósito com bônus): mostra + bônus ao lado
                        const baseAmount = h?.amount != null ? moneyText(h.amount, h?.currency || accountCurrency) : "-";
                        const bonusAmountText = hasBonus ? moneyText(Number(h.bonusAmount) || 0, h?.currency || accountCurrency) : "";
                        return (
                          <div key={idx} className={styles.tr}>
                            <div>{h.date || "-"}</div>
                            <div>
                              {isPixMethod ? (
                                <span className={styles.methodCell}>
                                  <span className={styles.methodChip}>Pix</span>
                                  {hasBonus ? (
                                    <span className={styles.bonusBadge}>
                                      <span className={styles.bonusPlus}>+</span>
                                      <span className={styles.bonusText}>{t("wallet:common.bonus")}</span>
                                    </span>
                                  ) : null}
                                </span>
                              ) : (
                                <span>{methodRaw}</span>
                              )}
                            </div>
                            <div className={styles.amountCell}>
                              <span>{baseAmount}</span>
                              {hasBonus ? (
                                <span className={styles.bonusAmount}>
                                  <span className={styles.bonusPlus}>+</span>
                                  <span className={styles.bonusAmountText}>{bonusAmountText}</span>
                                </span>
                              ) : null}
                            </div>
                            <div
                              className={
                                historyKindKey === "ops"
                                  ? String(h.status || "").toUpperCase() === t("wallet:status.ops.win").toUpperCase()
                                    ? styles.opWin
                                    : String(h.status || "").toUpperCase() === t("wallet:status.ops.loss").toUpperCase()
                                    ? styles.opLoss
                                    : undefined
                                  : undefined
                              }
                            >
                              {historyKindKey === "ops" ? (
                                <span>{h.status || "-"}</span>
                              ) : (
                                <span className={`${styles.statusChip} ${getStatusChipVariantClass(statusVisual, h?.statusKind)}`}>
                                  {statusVisual || "-"}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                    {historyKindKey === "ops" && opsSummary ? (
                      <div className={styles.historyOpsSummary}>
                        <div className={styles.historyOpsSummaryLeft}>
                          <div className={styles.historyOpsSummaryTitle}>{t("wallet:history.period_result")}</div>
                          <div className={styles.historyOpsSummaryMeta}>
                            {t("wallet:history.wins")}: <b>{moneyText(opsSummary.wins)}</b> • {t("wallet:history.losses")}: <b>{moneyText(opsSummary.losses)}</b>
                          </div>
                        </div>
                        <div
                          className={`${styles.historyOpsSummaryValue} ${
                            opsSummary.net > 0 ? styles.historyOpsSummaryWin : opsSummary.net < 0 ? styles.historyOpsSummaryLoss : ""
                          }`}
                        >
                          {formatSignedMoney(opsSummary.net)}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: "none" }}>
                    <button type="button" onClick={exportHistoryCsv}>
                      export csv
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ✅ Mini painel: Condições do bônus (aberto via "Confira as condições do bônus") */}
          {bonusTermsOpen ? (
            <div
              className={styles.bonusTermsOverlay}
              role="dialog"
              aria-modal="false"
              aria-label={t("wallet:bonus_terms.title", { defaultValue: "Condições do bônus" })}
              onMouseDown={(e) => {
                // fecha ao clicar fora do card
                if (e.target === e.currentTarget) closeBonusTerms();
              }}
            >
              <div className={styles.bonusTermsCard}>
                <div className={styles.bonusTermsHeader}>
                  <div className={styles.bonusTermsTitle}>{t("wallet:bonus_terms.title", { defaultValue: "Condições do bônus" })}</div>
                  <button type="button" className={styles.bonusTermsClose} onClick={closeBonusTerms} aria-label={t("wallet:common.close")}>✕</button>
                </div>

                <div className={styles.bonusTermsBody}>
                  <div className={styles.bonusTermsSectionTitle}>{t("wallet:bonus_terms.general_title", { defaultValue: "Informações gerais" })}</div>
                  <div className={styles.bonusTermsText}>
                    {t("wallet:bonus_terms.general_text", {
                      defaultValue:
                        "Os bônus são benefícios que a plataforma disponibiliza aos traders, é de total responsabilidade do trader verificar as condições do bônus no momento do uso. É permitido somente a utilização de 1 cupom por vez.",
                    })}
                  </div>

                  <div className={styles.bonusTermsSectionTitle}>{t("wallet:bonus_terms.volume_title", { defaultValue: "Volume de negociação" })}</div>
                  <div className={styles.bonusTermsText}>
                    {t("wallet:bonus_terms.volume_text", {
                      defaultValue:
                        "As retiradas do valor depositado com uso de bônus ficam disponíveis sem restrição após o trader atingir a movimentação necessária mínima de acordo com o bônus utilizado.",
                    })}
                  </div>

                  <div className={styles.bonusTermsSectionTitle}>{t("wallet:bonus_terms.limits_title", { defaultValue: "Limites e cancelamento" })}</div>
                  <div className={styles.bonusTermsText}>
                    {t("wallet:bonus_terms.limits_text", {
                      defaultValue:
                        "Os cupons podem ser limitados por ativação e uso. Caso o valor da conta real fique abaixo do valor utilizado com bônus, automaticamente o cupom será cancelado.",
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (usePortal) {
    if (!portalTarget) return null;
    return createPortal(content, portalTarget);
  }
  return content;
}