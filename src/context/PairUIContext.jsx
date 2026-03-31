import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useMarketStore } from "../stores/market.store";
import { useTradingAuth } from "@/context/TradingAuthContext";

const PairUIContext = createContext(null);

function normalizePair(pair) {
  return String(pair || "").replace("/", "").toUpperCase().trim();
}

function normalizeTf(tf) {
  const s = String(tf || "").trim().toUpperCase();
  if (s === "M1" || s === "M5" || s === "M15" || s === "M30" || s === "H1") return s;

  if (s === "1M" || s === "1MIN" || s === "1MINUTE" || s === "1") return "M1";
  if (s === "5M" || s === "5MIN" || s === "5MINUTE" || s === "5") return "M5";
  if (s === "15M" || s === "15MIN" || s === "15MINUTE" || s === "15") return "M15";
  if (s === "30M" || s === "30MIN" || s === "30MINUTE" || s === "30") return "M30";
  if (s === "1H" || s === "H1" || s === "60M" || s === "60" || s === "60MIN") return "H1";

  return "M1";
}

const DEFAULT_FOREX_SYMBOL = "EURUSD";
const DEFAULT_CRYPTO_SYMBOL = "BTCUSD";
const DEFAULT_TF = "M1";

const PAIR_UI_LS_VERSION = "v2";
const keyForUser = (userKey) => `pair-ui:${PAIR_UI_LS_VERSION}:${userKey || "guest"}`;

// ✅ quantos pares flutuantes manter assinados/quentes
const MAX_FLOATING_PAIRS = 5;

function safeJsonParse(v) {
  try {
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

function makeKey(pair, timeframe) {
  const s = normalizePair(pair);
  const tf = normalizeTf(timeframe);
  if (!s || !tf) return "";
  return `${s}|${tf}`;
}


function isLikelyForexSymbol(symbol) {
  const s = normalizePair(symbol);
  if (!s || s.length < 6) return false;
  const base = s.slice(0, 3);
  return !["BTC", "ETH", "ADA", "SOL", "XRP", "BNB", "LTC", "XAU", "XAG"].includes(base);
}

function isLikelyForexOpen(now = new Date()) {
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();

  const OPEN_MIN = 21 * 60;
  const CLOSE_MIN = 17 * 60;

  if (day === 6) return false;
  if (day === 0) return minutes >= OPEN_MIN;
  if (day === 5) return minutes < CLOSE_MIN;
  return minutes < CLOSE_MIN || minutes >= OPEN_MIN;
}

function resolveBootSymbol(candidate) {
  const normalized = normalizePair(candidate);
  const forexOpen = isLikelyForexOpen();

  if (normalized) {
    if (!isLikelyForexSymbol(normalized)) return normalized;
    if (forexOpen) return normalized;
  }

  return forexOpen ? DEFAULT_FOREX_SYMBOL : DEFAULT_CRYPTO_SYMBOL;
}

export function PairUIProvider({ children }) {
  const { user: authUser, loading: authLoading } = useTradingAuth();

  const userKey = useMemo(() => {
    const id = authUser?.id ? String(authUser.id) : "";
    const email = authUser?.email ? String(authUser.email) : "";
    return (id || email || "guest").trim().toLowerCase();
  }, [authUser?.id, authUser?.email]);

  const storageKey = useMemo(() => keyForUser(userKey), [userKey]);

  const [symbol, _setSymbol] = useState("");
  const [timeframe, _setTimeframe] = useState(DEFAULT_TF);
  const [isPairPanelOpen, setIsPairPanelOpen] = useState(false);
  const [pairPanelSource, setPairPanelSource] = useState(null);
  const [activePanel, setActivePanel] = useState(null);
  const [activeFloatingPairs, setActiveFloatingPairs] = useState([]);
  const [bootHydrated, setBootHydrated] = useState(false);
  const [floatingWarmReady, setFloatingWarmReady] = useState(false);

  const persistPairUIState = (nextSymbol, nextTimeframe, nextFloatingPairs) => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          symbol: resolveBootSymbol(nextSymbol),
          timeframe: normalizeTf(nextTimeframe || DEFAULT_TF),
          activeFloatingPairs: Array.isArray(nextFloatingPairs)
            ? nextFloatingPairs.map(normalizePair).filter(Boolean).slice(0, MAX_FLOATING_PAIRS)
            : [],
        })
      );
    } catch {}
  };

  const refreshPairForChart = useMarketStore((s) => s.refreshPairForChart);

  const prevRef = useRef({ symbol: "", timeframe: DEFAULT_TF });

  useEffect(() => {
    if (authLoading) {
      setBootHydrated(false);
      setFloatingWarmReady(false);
      return;
    }

    setBootHydrated(false);
    setFloatingWarmReady(false);
    setIsPairPanelOpen(false);
    setPairPanelSource(null);
    setActivePanel(null);

    const fallbackSymbol = resolveBootSymbol();

    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = safeJsonParse(raw);

      const persistedSymbol = normalizePair(parsed?.symbol);
      const nextSymbol = resolveBootSymbol(persistedSymbol || fallbackSymbol);
      const nextTimeframe = normalizeTf(parsed?.timeframe || DEFAULT_TF);
      const nextFloatingPairs = Array.isArray(parsed?.activeFloatingPairs)
        ? parsed.activeFloatingPairs
            .map(normalizePair)
            .filter(Boolean)
            .filter((pair) => pair !== nextSymbol)
            .slice(0, MAX_FLOATING_PAIRS)
        : [];

      _setSymbol(nextSymbol);
      _setTimeframe(nextTimeframe);
      setActiveFloatingPairs(nextFloatingPairs);

      persistPairUIState(nextSymbol, nextTimeframe, nextFloatingPairs);
    } catch {
      _setSymbol(fallbackSymbol);
      _setTimeframe(DEFAULT_TF);
      setActiveFloatingPairs([]);
    } finally {
      prevRef.current = { symbol: "", timeframe: DEFAULT_TF };
      setBootHydrated(true);
    }
  }, [authLoading, storageKey]);

  useEffect(() => {
    if (!bootHydrated || !symbol) return;
    persistPairUIState(symbol, timeframe, activeFloatingPairs);
  }, [bootHydrated, symbol, timeframe, activeFloatingPairs, storageKey]);

  useEffect(() => {
    if (!bootHydrated || !symbol || !timeframe) return;

    setFloatingWarmReady(false);
    const timer = setTimeout(() => setFloatingWarmReady(true), 180);
    return () => clearTimeout(timer);
  }, [bootHydrated, symbol, timeframe]);

  // 🔒 modo profissional: pares flutuantes continuam apenas como UI/atalho.
  // Não mantemos mais warm/pin/subscription para eles no front.

  useEffect(() => {
    if (!bootHydrated) return;

    const s = normalizePair(symbol);
    const tf = normalizeTf(timeframe);
    if (!s || !tf) return;

    try {
      refreshPairForChart({ pair: s, timeframe: tf });
    } catch {}

    prevRef.current = { symbol: s, timeframe: tf };
  }, [bootHydrated, symbol, timeframe, refreshPairForChart]);

  const chartKey = useMemo(() => `${symbol}_${timeframe}`, [symbol, timeframe]);

  const togglePairPanelFromHeader = (event) => {
    if (event) event.stopPropagation();
    setIsPairPanelOpen((prev) => {
      const next = !prev;
      setPairPanelSource(next ? "header" : null);
      return next;
    });
  };

  const openPairPanelFromChart = () => {
    setIsPairPanelOpen(true);
    setPairPanelSource("chart");
  };

  const closePairPanel = () => {
    setIsPairPanelOpen(false);
    setPairPanelSource(null);
  };

  const addFloatingPair = (pair) => {
    const normalized = normalizePair(pair);
    if (!normalized) return;

    setActiveFloatingPairs((prev) => {
      if (prev.includes(normalized)) return prev;
      const next = [...prev, normalized].slice(-MAX_FLOATING_PAIRS);
      persistPairUIState(symbol, timeframe, next);
      return next;
    });
  };

  const removeFloatingPair = (pair) => {
    const normalized = normalizePair(pair);
    setActiveFloatingPairs((prev) => {
      const next = prev.filter((p) => p !== normalized);
      persistPairUIState(symbol, timeframe, next);
      return next;
    });
  };

  const addFloatingPairFromSelector = (pair) => addFloatingPair(pair);

  const selectPair = (pair, nextTimeframe) => {
    const normalized = normalizePair(pair);
    const tf = normalizeTf(nextTimeframe || timeframe);

    if (!normalized) return;

    const samePair = normalizePair(symbol) === normalized;
    const sameTf = normalizeTf(timeframe) === tf;

    const nextFloating = activeFloatingPairs.includes(normalized)
      ? activeFloatingPairs
      : [...activeFloatingPairs, normalized].slice(-MAX_FLOATING_PAIRS);

    if (!samePair) {
      _setSymbol(normalized);
    }
    if (!sameTf) {
      _setTimeframe(tf);
    }

    setActiveFloatingPairs(nextFloating);
    persistPairUIState(normalized, tf, nextFloating);
    closePairPanel();
  };

  const value = useMemo(
    () => ({
      symbol,
      timeframe,
      chartKey,
      isPairPanelOpen,
      pairPanelSource,
      activePanel,
      activeFloatingPairs,

      setSymbol: (s) => {
        const nextSymbol = resolveBootSymbol(s);
        _setSymbol(nextSymbol);
        persistPairUIState(nextSymbol, timeframe, activeFloatingPairs);
      },
      setTimeframe: (tf) => {
        const nextTf = normalizeTf(tf);
        _setTimeframe(nextTf);
        persistPairUIState(symbol, nextTf, activeFloatingPairs);
      },
      setPair: selectPair,

      togglePairPanelFromHeader,
      openPairPanelFromChart,
      closePairPanel,

      addFloatingPair,
      addFloatingPairFromSelector,
      removeFloatingPair,
      setActivePanel,
    }),
    [
      symbol,
      timeframe,
      chartKey,
      isPairPanelOpen,
      pairPanelSource,
      activePanel,
      activeFloatingPairs,
    ]
  );

  return (
    <PairUIContext.Provider value={value}>
      {children}
    </PairUIContext.Provider>
  );
}

export function usePairUI() {
  const ctx = useContext(PairUIContext);
  if (!ctx) {
    throw new Error("usePairUI precisa ser usado dentro de <PairUIProvider>");
  }
  return ctx;
}