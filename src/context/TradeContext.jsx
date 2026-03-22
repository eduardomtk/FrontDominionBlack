// src/context/TradeContext.jsx
import { createContext, useContext, useRef, useState, useEffect, useCallback } from "react";
import { useBalance } from "./BalanceContext";
import { useAccount } from "./AccountContext";
import { useTournament } from "./TournamentContext";
import { useTradingAuth } from "./TradingAuthContext";
import { supabase } from "../services/supabaseClient";
import { useMarketStore } from "@/stores/market.store";

const TradeContext = createContext(null);
const MAX_SIMULTANEOUS_TRADES = 3;

const CLOSED_IDS_MAX = 5000;
const TRADES_HISTORY_MAX = 20;

const TOURNAMENTS_ENABLED = false;
const WALLET_SYNC_DEBOUNCE_MS = 400;

const DEBUG_TRADE_HISTORY = true;

// ✅ Edge function soberana (settlement + history)
const SETTLE_FUNCTION_CANDIDATES = ["trade_settle", "trade-settle"];

function toMs(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return NaN;
  return n < 1e11 ? n * 1000 : n;
}

function normalizeAccountType(v, fallback) {
  const t = String(v || fallback || "").toUpperCase();
  return t === "REAL" ? "REAL" : "DEMO";
}

function toNumberSafe(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizePair(pair) {
  return String(pair || "").replace("/", "").toUpperCase().trim();
}

function normalizeTf(tf) {
  const s = String(tf || "").toUpperCase().trim();
  if (s === "M1" || s === "M5" || s === "M15" || s === "M30" || s === "H1") return s;
  return "M1";
}

function normalizeDirection(d) {
  const s = String(d || "").toUpperCase();
  if (s === "CALL" || s === "PUT") return s;
  if (s === "BUY") return "CALL";
  if (s === "SELL") return "PUT";
  return "CALL";
}

function normalizeResult(v) {
  const r = String(v || "").toUpperCase().trim();
  // ✅ regra da corretora: empate é perda (não existe TIE)
  if (r === "TIE") return "LOSS";
  return r === "WIN" ? "WIN" : "LOSS";
}

function getPairKeyFromTrade(trade) {
  const s = normalizePair(trade?.symbol ?? trade?.asset);
  const tf = normalizeTf(trade?.timeframe || trade?.expirationLabel);
  if (!s || !tf) return "";
  return `${s}|${tf}`;
}

function pickClosePriceFromMarketStore(pairKey) {
  try {
    const st = useMarketStore.getState();
    const p = st?.pairs?.[pairKey];
    if (!p) return null;

    const live = p.liveCandle;
    const tick = p.lastTick;
    const candles = p.candles;

    const liveClose = Number(live?.close);
    if (Number.isFinite(liveClose)) return liveClose;

    const bid = Number(tick?.bid ?? tick?.price ?? tick?.close);
    if (Number.isFinite(bid)) return bid;

    const lastClosed = Array.isArray(candles) && candles.length ? candles[candles.length - 1] : null;
    const closedClose = Number(lastClosed?.close);
    if (Number.isFinite(closedClose)) return closedClose;

    return null;
  } catch {
    return null;
  }
}

/**
 * ✅ Resultado soberano (SEM TIE):
 * - CALL: close > open => WIN, senão LOSS (inclui empate)
 * - PUT : close < open => WIN, senão LOSS (inclui empate)
 */
function calcResult({ direction, openPrice, closePrice }) {
  const dir = normalizeDirection(direction);
  const o = Number(openPrice);
  const c = Number(closePrice);
  if (!Number.isFinite(o) || !Number.isFinite(c)) return "LOSS";

  if (dir === "CALL") {
    return c > o ? "WIN" : "LOSS";
  }

  return c < o ? "WIN" : "LOSS";
}

function getHistoryKey(t) {
  if (!t) return "";
  const a = normalizeAccountType(t.account, "DEMO");
  const tradeId = String(t.tradeId || t.trade_id || t.id || "");
  if (tradeId) return `${a}|${tradeId}`;

  const ts = Number(t.timestamp ?? t.closedAt ?? 0);
  const sym = String(t.symbol ?? t.asset ?? "");
  const dir = String(t.direction ?? "");
  const amt = Number(t.amount ?? 0);
  return `${a}|${ts}|${sym}|${dir}|${amt}`;
}

function mapTradeHistoryRow(row) {
  if (!row) return null;

  const ts = Number(row.timestamp);
  const timestamp = Number.isFinite(ts) ? ts : Date.now();
  const symbol = row.symbol ?? null;

  const tradeId = row.trade_id ? String(row.trade_id) : null;
  const idFallback = row.id != null ? String(row.id) : `${row.user_id}-${timestamp}`;
  const uiId = tradeId || idFallback;

  return {
    id: uiId,
    tradeId: tradeId || undefined,

    account: normalizeAccountType(row.account_type, "DEMO"),
    symbol: symbol,
    asset: symbol,

    direction: normalizeDirection(row.direction),

    amount: toNumberSafe(row.amount) ?? 0,
    payout: toNumberSafe(row.payout) ?? null,
    profit: row.profit !== undefined && row.profit !== null ? toNumberSafe(row.profit) : null,

    result: row.result ?? null,

    openPrice: toNumberSafe(row.open_price) ?? null,
    closePrice: toNumberSafe(row.close_price) ?? null,

    timestamp,
    closedAt: timestamp,
  };
}

function mapOpenTradeRow(row) {
  if (!row) return null;

  const expMs = Number.isFinite(toMs(row.expires_at)) ? toMs(row.expires_at) : NaN;
  const openedMs = Number.isFinite(toMs(row.opened_at)) ? toMs(row.opened_at) : NaN;

  const symbol = normalizePair(row.symbol);
  const tf = normalizeTf(row.timeframe || "M1");

  return {
    id: String(row.trade_id || ""),
    tradeId: String(row.trade_id || ""),
    account: normalizeAccountType(row.account_type, "DEMO"),

    symbol,
    asset: symbol,

    direction: normalizeDirection(row.direction),

    amount: Number(row.amount || 0),
    payout: toNumberSafe(row.payout) ?? 0.85,

    openPrice: toNumberSafe(row.open_price) ?? null,

    timeframe: tf,
    expirationLabel: tf,

    expirationTime: Number.isFinite(expMs) ? expMs : null,
    expiresAt: Number.isFinite(expMs) ? expMs : null,
    openedAt: Number.isFinite(openedMs) ? openedMs : null,
  };
}

function safePin(symbol, timeframe) {
  try {
    const st = useMarketStore.getState();
    st?.pinPair?.({ pair: symbol, timeframe });
  } catch {}
}

function safeUnpin(symbol, timeframe) {
  try {
    const st = useMarketStore.getState();
    st?.unpinPair?.({ pair: symbol, timeframe });
  } catch {}
}

function emptyHistoryByAccount() {
  return { REAL: [], DEMO: [] };
}

export function TradeProvider({ children }) {
  const [activeTrades, setActiveTrades] = useState([]);
  const [tradesByAccount, setTradesByAccount] = useState(() => emptyHistoryByAccount());
  const [lastResult, setLastResult] = useState(null);

  const engineRef = useRef(null);
  const openIdsRef = useRef(new Set());

  const closedIdsRef = useRef(new Set());
  const closedIdsQueueRef = useRef([]);

  const lastResultTimerRef = useRef(null);

  const { debit, reload } = useBalance();
  const { accountType, accountReady } = useAccount();
  const tournament = useTournament();
  const { user } = useTradingAuth();

  const userIdRef = useRef(null);
  useEffect(() => {
    if (user?.id) userIdRef.current = String(user.id);
  }, [user?.id]);

  const getStableUid = useCallback(() => {
    return String(user?.id || userIdRef.current || "");
  }, [user?.id]);

  const syncTimerRef = useRef(null);
  const scheduleWalletSync = useCallback(() => {
    if (!reload) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      reload?.();
    }, WALLET_SYNC_DEBOUNCE_MS);
  }, [reload]);

  const activeTradesRef = useRef([]);
  useEffect(() => {
    activeTradesRef.current = Array.isArray(activeTrades) ? activeTrades : [];
  }, [activeTrades]);

  const expireTimersRef = useRef(new Map());

  function bindEngine(engine) {
    engineRef.current = engine;
  }

  function rememberClosedId(id) {
    if (closedIdsRef.current.has(id)) return false;

    closedIdsRef.current.add(id);
    closedIdsQueueRef.current.push(id);

    while (closedIdsQueueRef.current.length > CLOSED_IDS_MAX) {
      const oldest = closedIdsQueueRef.current.shift();
      if (oldest) closedIdsRef.current.delete(oldest);
    }

    return true;
  }

  // ============================================================
  // OPEN TRADES
  // ============================================================

  async function persistOpenTradeToSupabase(openTradeNormalized) {
    if (!user?.id) return;

    const tradeId = String(openTradeNormalized?.id || openTradeNormalized?.tradeId || "");
    if (!tradeId) return;

    const acc = normalizeAccountType(openTradeNormalized?.account, accountType);

    const expMs =
      Number.isFinite(toMs(openTradeNormalized?.expiresAt)) ? toMs(openTradeNormalized?.expiresAt)
      : Number.isFinite(toMs(openTradeNormalized?.expirationTime)) ? toMs(openTradeNormalized?.expirationTime)
      : NaN;

    if (!Number.isFinite(expMs)) return;

    const openedAt =
      Number.isFinite(toMs(openTradeNormalized?.openedAt)) ? toMs(openTradeNormalized?.openedAt)
      : Date.now();

    const payload = {
      user_id: user.id,
      account_type: acc,
      trade_id: tradeId,

      symbol: openTradeNormalized?.symbol ?? openTradeNormalized?.asset ?? null,
      timeframe: normalizeTf(openTradeNormalized?.timeframe || "M1"),

      direction: openTradeNormalized?.direction ?? null,
      amount: Number(openTradeNormalized?.amount || 0),
      payout: toNumberSafe(openTradeNormalized?.payout) ?? null,
      open_price: toNumberSafe(openTradeNormalized?.openPrice) ?? null,
      opened_at: openedAt,
      expires_at: expMs,
    };

    const { error } = await supabase.from("open_trades").upsert(payload, {
      onConflict: "user_id,trade_id",
    });

    if (error) console.warn("[OpenTrades] upsert error:", error.message);
  }

  async function removeOpenTradeFromSupabase(tradeId) {
    if (!user?.id) return;
    const id = String(tradeId || "");
    if (!id) return;

    const { error } = await supabase
      .from("open_trades")
      .delete()
      .eq("user_id", user.id)
      .eq("trade_id", id);

    if (error) console.warn("[OpenTrades] delete error:", error.message);
  }

  const openLoadSeqRef = useRef(0);
  const restoredPinsRef = useRef([]);

  const loadOpenTrades = useCallback(async (typeOverride) => {
    const uid = user?.id;

    try {
      const prevPins = Array.isArray(restoredPinsRef.current) ? restoredPinsRef.current : [];
      for (const p of prevPins) safeUnpin(p.symbol, p.timeframe);
    } catch {}
    restoredPinsRef.current = [];

    if (!uid) {
      setActiveTrades([]);
      openIdsRef.current = new Set();
      return;
    }

    const acc = normalizeAccountType(typeOverride, accountType);
    const seq = ++openLoadSeqRef.current;

    try {
      const { data, error } = await supabase
        .from("open_trades")
        .select("user_id,account_type,trade_id,symbol,timeframe,direction,amount,payout,open_price,opened_at,expires_at")
        .eq("user_id", uid)
        .eq("account_type", acc)
        .order("expires_at", { ascending: true });

      if (seq !== openLoadSeqRef.current) return;

      if (error) {
        console.warn("[OpenTrades] load error:", error.message);
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      const mappedAll = rows.map(mapOpenTradeRow).filter(Boolean);

      const now = Date.now();
      const stillOpen = [];
      const expiredIds = [];

      for (const t of mappedAll) {
        const exp = Number(t?.expiresAt ?? t?.expirationTime ?? 0);
        const id = String(t?.tradeId ?? t?.id ?? "");
        if (!id) continue;

        if (!Number.isFinite(exp) || exp <= 0 || exp <= now) expiredIds.push(id);
        else stillOpen.push(t);
      }

      if (expiredIds.length) {
        try {
          await supabase.from("open_trades").delete().eq("user_id", uid).in("trade_id", expiredIds);
        } catch {}
      }

      const mapped = stillOpen;

      const pins = [];
      for (const t of mapped) {
        const symbol = normalizePair(t.symbol || t.asset);
        const tf = normalizeTf(t.timeframe || "M1");
        if (symbol) {
          safePin(symbol, tf);
          pins.push({ symbol, timeframe: tf });
        }
      }
      restoredPinsRef.current = pins;

      openIdsRef.current = new Set(mapped.map((t) => String(t.id)));
      setActiveTrades(mapped);

      for (const t of mapped) scheduleExpiration(t);
    } catch (e) {
      console.warn("[OpenTrades] load exception:", e?.message || e);
    }
  }, [user?.id, accountType]);

  useEffect(() => {
    if (!user?.id) {
      try {
        const prevPins = Array.isArray(restoredPinsRef.current) ? restoredPinsRef.current : [];
        for (const p of prevPins) safeUnpin(p.symbol, p.timeframe);
      } catch {}
      restoredPinsRef.current = [];

      setActiveTrades([]);
      openIdsRef.current = new Set();
      return;
    }

    loadOpenTrades(accountType);
  }, [user?.id, accountType, loadOpenTrades]);

  // ============================================================
  // ✅ TRADE HISTORY
  // ============================================================

  const historyLoadSeqRef = useRef(0);

  const debugCounts = useCallback(async (uid) => {
    try {
      const qDemo = await supabase
        .from("trade_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("account_type", "DEMO");

      const qReal = await supabase
        .from("trade_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("account_type", "REAL");

      console.log("[TradeHistory] DB counts by account_type:", {
        DEMO: qDemo?.count ?? null,
        REAL: qReal?.count ?? null,
        demo_error: qDemo?.error ?? null,
        real_error: qReal?.error ?? null,
      });
    } catch (e) {
      console.warn("[TradeHistory] debugCounts exception:", e?.message || e);
    }
  }, []);

  const loadTradeHistory = useCallback(async (typeOverride) => {
    const uid = getStableUid();
    if (!uid) {
      setTradesByAccount(emptyHistoryByAccount());
      return;
    }

    const acc = normalizeAccountType(typeOverride, accountType);
    const seq = ++historyLoadSeqRef.current;

    if (DEBUG_TRADE_HISTORY) {
      console.log("[TradeHistory] loadTradeHistory", { uid, acc, TRADES_HISTORY_MAX, seq });
    }

    try {
      const { data, error } = await supabase
        .from("trade_history")
        .select(
          "id,trade_id,user_id,account_type,symbol,direction,amount,payout,profit,result,open_price,close_price,timestamp,created_at"
        )
        .eq("user_id", uid)
        .eq("account_type", acc)
        .order("created_at", { ascending: false })
        .order("timestamp", { ascending: false })
        .limit(TRADES_HISTORY_MAX);

      if (seq !== historyLoadSeqRef.current) return;

      if (error) {
        console.warn("[TradeHistory] load error FULL:", error);
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      console.log("[TradeHistory] rows returned:", rows.length, rows[0] ?? null);

      if (rows.length === 0) {
        await debugCounts(uid);
      }

      const mapped = rows.map(mapTradeHistoryRow).filter(Boolean);

      const seen = new Set();
      const unique = [];
      for (const t of mapped) {
        const k = getHistoryKey(t);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        unique.push(t);
      }

      console.log("[TradeHistory] mapped unique:", unique.length);

      const finalList = unique.slice(0, TRADES_HISTORY_MAX);

      setTradesByAccount((prev) => {
        const next = prev && typeof prev === "object" ? prev : emptyHistoryByAccount();
        return { ...next, [acc]: finalList };
      });
    } catch (e) {
      console.warn("[TradeHistory] load exception:", e?.message || e);
    }
  }, [accountType, debugCounts, getStableUid]);

  useEffect(() => {
    const uid = getStableUid();
    if (!uid) {
      setTradesByAccount(emptyHistoryByAccount());
      return;
    }

    if (!accountReady) return;

    loadTradeHistory(accountType);
  }, [accountType, accountReady, loadTradeHistory, getStableUid]);

  const historyChannelRef = useRef(null);
  useEffect(() => {
    const uid = getStableUid();
    const acc = normalizeAccountType(accountType, "DEMO");

    if (historyChannelRef.current) {
      try { supabase.removeChannel(historyChannelRef.current); } catch {}
      historyChannelRef.current = null;
    }

    if (!uid) return;

    const channel = supabase
      .channel(`trade_history:${uid}:${acc}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trade_history", filter: `user_id=eq.${uid}` },
        (payload) => {
          const row = payload?.new;
          if (!row) return;
          const rowAcc = normalizeAccountType(row.account_type, "DEMO");
          if (rowAcc !== acc) return;

          const mapped = mapTradeHistoryRow(row);
          if (!mapped) return;

          setTradesByAccount((prev) => {
            const next = prev && typeof prev === "object" ? prev : emptyHistoryByAccount();
            const list = Array.isArray(next[rowAcc]) ? next[rowAcc] : [];

            const key = getHistoryKey(mapped);
            if (key && list.some((x) => getHistoryKey(x) === key)) return next;

            return { ...next, [rowAcc]: [mapped, ...list].slice(0, TRADES_HISTORY_MAX) };
          });
        }
      )
      .subscribe();

    historyChannelRef.current = channel;

    return () => {
      try {
        if (historyChannelRef.current) supabase.removeChannel(historyChannelRef.current);
      } catch {}
      historyChannelRef.current = null;
    };
  }, [accountType, getStableUid]);

  // ============================================================
  // ✅ FECHAMENTO SOBERANO (EDGE) + SEM TIE
  // ============================================================

  async function settleClosedTradeViaEdge(normalizedClosed) {
    const acc = normalizeAccountType(normalizedClosed.account, accountType);

    const tradeId = String(normalizedClosed.id || normalizedClosed.tradeId || "");
    if (!tradeId) return false;

    const res = normalizeResult(normalizedClosed.result); // ✅ TIE vira LOSS aqui

    const amt = toNumberSafe(normalizedClosed.amount) ?? 0;
    const payout = toNumberSafe(normalizedClosed.payout);
    const profit =
      normalizedClosed.profit !== undefined && normalizedClosed.profit !== null
        ? toNumberSafe(normalizedClosed.profit)
        : null;

    if (!Number.isFinite(Number(amt)) || amt <= 0) return false;

    const tsRaw =
      normalizedClosed.timestamp ??
      normalizedClosed.closedAt ??
      normalizedClosed.expiresAt ??
      normalizedClosed.expirationTime ??
      Date.now();

    const timestamp = Number.isFinite(toMs(tsRaw)) ? toMs(tsRaw) : Date.now();

    const payload = {
      account_type: acc,
      trade_id: tradeId,
      result: res,
      amount: amt,
      payout: payout ?? null,
      profit: profit ?? null,
      symbol: normalizedClosed.symbol ?? normalizedClosed.asset ?? null,
      direction: normalizedClosed.direction ?? null,
      open_price: toNumberSafe(normalizedClosed.openPrice) ?? null,
      close_price: toNumberSafe(normalizedClosed.closePrice) ?? null,
      timestamp,
    };

    for (const fnName of SETTLE_FUNCTION_CANDIDATES) {
      try {
        const { data, error } = await supabase.functions.invoke(fnName, { body: payload });

        if (error) {
          console.warn(`[SETTLE][EDGE] ${fnName} invoke error:`, error);
          continue;
        }

        if (data?.error) {
          console.warn(`[SETTLE][EDGE] ${fnName} response error:`, data?.error, data);
          continue;
        }

        if (data?.ok === true) {
          console.log(`[SETTLE][EDGE] OK via ${fnName}`, data);
          return true;
        }

        console.warn(`[SETTLE][EDGE] ${fnName} unexpected response:`, data);
      } catch (e) {
        console.warn(`[SETTLE][EDGE] ${fnName} exception:`, e?.message || e);
      }
    }

    return false;
  }

  function registerClosedTrade(trade) {
    const uidNow = String(user?.id || userIdRef.current || "");

    console.log("[TH][FLOW] registerClosedTrade CALLED", {
      uid_ctx: user?.id ?? null,
      uid_ref: userIdRef.current ?? null,
      uid_now: uidNow || null,
      trade_id: trade?.id ?? trade?.tradeId ?? null,
      account_in_trade: trade?.account ?? null,
      symbol: trade?.symbol ?? trade?.asset ?? null,
      result: trade?.result ?? null,
    });

    const closedId = String(trade?.id ?? trade?.tradeId ?? "");
    if (!closedId) return;

    const firstTime = rememberClosedId(closedId);
    if (!firstTime) return;

    openIdsRef.current.delete(closedId);
    removeOpenTradeFromSupabase(closedId);

    try {
      const sym = normalizePair(trade?.symbol ?? trade?.asset);
      const tf = normalizeTf(trade?.timeframe || "M1");
      if (sym) safeUnpin(sym, tf);
    } catch {}

    const tmr = expireTimersRef.current.get(closedId);
    if (tmr) {
      try { clearTimeout(tmr); } catch {}
      expireTimersRef.current.delete(closedId);
    }

    setActiveTrades((prev) =>
      prev.filter((t) => String(t?.id ?? t?.tradeId ?? "") !== closedId)
    );

    const closedAccount = normalizeAccountType(trade?.account, accountType);

    const ts =
      (Number.isFinite(toMs(trade?.closedAt)) ? toMs(trade?.closedAt) : NaN) ||
      (Number.isFinite(toMs(trade?.expirationTime)) ? toMs(trade?.expirationTime) : NaN) ||
      (Number.isFinite(toMs(trade?.expiresAt)) ? toMs(trade?.expiresAt) : NaN) ||
      Date.now();

    const normalizedClosed = {
      ...trade,
      id: String(trade?.id ?? trade?.tradeId ?? closedId),
      tradeId: String(trade?.id ?? trade?.tradeId ?? closedId),
      account: closedAccount,
      timestamp: ts,
      // ✅ garante que não existe TIE
      result: normalizeResult(trade?.result),
    };

    // ✅ UI otimista (histórico local)
    setTradesByAccount((prev) => {
      const next = prev && typeof prev === "object" ? prev : emptyHistoryByAccount();
      const list = Array.isArray(next[closedAccount]) ? next[closedAccount] : [];
      const key = getHistoryKey(normalizedClosed);
      if (key && list.some((x) => getHistoryKey(x) === key)) return next;
      return { ...next, [closedAccount]: [normalizedClosed, ...list].slice(0, TRADES_HISTORY_MAX) };
    });

    if (TOURNAMENTS_ENABLED && tournament?.active) {
      normalizedClosed.result === "WIN"
        ? tournament.applyWin(normalizedClosed.amount, normalizedClosed.payout)
        : tournament.applyLoss(normalizedClosed.amount);
    }

    // ✅ settlement soberano no backend (balance + trade_history)
    settleClosedTradeViaEdge(normalizedClosed).then((ok) => {
      if (!ok) {
        console.warn("[SETTLE][EDGE] FAILED (no candidate succeeded) - forcing sync");
      }
      // sempre sincroniza com o soberano
      scheduleWalletSync();
      reload?.();
      loadTradeHistory?.(accountType);
    });

    setLastResult(normalizedClosed);

    if (lastResultTimerRef.current) clearTimeout(lastResultTimerRef.current);
    lastResultTimerRef.current = setTimeout(() => {
      setLastResult(null);
      lastResultTimerRef.current = null;
    }, 3500);
  }

  const finalizeTradeById = useCallback((tradeId) => {
    const id = String(tradeId || "");
    if (!id) return;

    const list = activeTradesRef.current;
    const t = list.find((x) => String(x?.id ?? x?.tradeId ?? "") === id);
    if (!t) return;

    const pairKey = getPairKeyFromTrade(t);
    const closePrice = pickClosePriceFromMarketStore(pairKey);

    const openPrice = Number(t?.openPrice ?? t?.entryPrice ?? t?.price ?? t?.open);
    const payout = Number(t?.payout ?? 0.85);
    const amount = Number(t?.amount ?? 0);

    const result = calcResult({
      direction: t?.direction ?? t?.side ?? t?.type,
      openPrice,
      closePrice,
    });

    const profit = result === "WIN" ? amount * payout : 0;

    registerClosedTrade({
      ...t,
      closedAt: Date.now(),
      closePrice: Number.isFinite(Number(closePrice)) ? Number(closePrice) : null,
      result,
      profit,
    });
  }, []);

  function scheduleExpiration(trade) {
    const id = String(trade?.id ?? "");
    if (!id) return;

    const expMs =
      Number.isFinite(toMs(trade?.expiresAt)) ? toMs(trade?.expiresAt)
      : Number.isFinite(toMs(trade?.expirationTime)) ? toMs(trade?.expirationTime)
      : NaN;

    if (!Number.isFinite(expMs)) return;

    const prev = expireTimersRef.current.get(id);
    if (prev) {
      try { clearTimeout(prev); } catch {}
      expireTimersRef.current.delete(id);
    }

    // ✅ fallback com pequena folga para nunca fechar cedo por relógio local.
    // O fechamento soberano continua vindo da TradeEngine no boundary do candle.
    const SAFETY_GRACE_MS = 1200;
    const delay = Math.max(0, expMs - Date.now() + SAFETY_GRACE_MS);
    const timeoutId = setTimeout(() => finalizeTradeById(id), delay);

    expireTimersRef.current.set(id, timeoutId);
  }

  // ✅ CRÍTICO: openTrade async e só abre se o débito confirmar
  async function openTrade(trade) {
    if (!user?.id) return false;
    if (!engineRef.current) return false;

    const id = String(trade?.id ?? "");
    if (!id) return false;
    if (openIdsRef.current.has(id)) return false;

    const expMs =
      Number.isFinite(toMs(trade?.expiresAt)) ? toMs(trade?.expiresAt)
      : Number.isFinite(toMs(trade?.expirationTime)) ? toMs(trade?.expirationTime)
      : NaN;

    const normalizedAccount = normalizeAccountType(trade?.account, accountType);

    const normalized = {
      ...trade,
      id,
      tradeId: id,
      account: normalizedAccount,
      direction: normalizeDirection(trade?.direction ?? trade?.side ?? trade?.type),
      expirationTime: Number.isFinite(expMs) ? expMs : trade?.expirationTime,
      expiresAt: Number.isFinite(expMs) ? expMs : trade?.expiresAt,
      symbol: normalizePair(trade?.symbol ?? trade?.asset),
      timeframe: normalizeTf(trade?.timeframe || trade?.expirationLabel),
      openedAt: Date.now(),
    };

    const tradeAccount = normalized.account;

    const activeForAccount = activeTrades.filter(
      (t) => normalizeAccountType(t?.account, accountType) === tradeAccount
    ).length;

    if (activeForAccount >= MAX_SIMULTANEOUS_TRADES) return false;

    // ✅ (1) confirma débito antes de abrir no engine
    const debitOk = await debit(normalized.amount, tradeAccount);
    if (!debitOk) {
      console.warn("[Trade] openTrade ABORT: debit failed", {
        account_type: tradeAccount,
        amount: normalized.amount,
        trade_id: id,
      });
      scheduleWalletSync();
      return false;
    }

    // ✅ (2) abre no engine
    const ok = engineRef.current.openTrade?.(normalized);
    if (!ok) {
      // se o engine recusou, força sync (o saldo já foi debitado, então precisa alinhar e você vê o erro)
      scheduleWalletSync();
      reload?.();
      return false;
    }

    openIdsRef.current.add(id);
    setActiveTrades((prev) => [...prev, normalized]);

    if (normalized.symbol) safePin(normalized.symbol, normalized.timeframe);

    persistOpenTradeToSupabase(normalized);

    scheduleWalletSync();
    scheduleExpiration(normalized);
    return true;
  }

  useEffect(() => {
    return () => {
      try {
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;

        for (const [, tmr] of expireTimersRef.current.entries()) {
          try { clearTimeout(tmr); } catch {}
        }
        expireTimersRef.current.clear();

        if (historyChannelRef.current) {
          try { supabase.removeChannel(historyChannelRef.current); } catch {}
          historyChannelRef.current = null;
        }

        try {
          const prevPins = Array.isArray(restoredPinsRef.current) ? restoredPinsRef.current : [];
          for (const p of prevPins) safeUnpin(p.symbol, p.timeframe);
        } catch {}
        restoredPinsRef.current = [];
      } catch {}
    };
  }, []);

  const accNow = normalizeAccountType(accountType, "DEMO");
  const tradesNow = Array.isArray(tradesByAccount?.[accNow]) ? tradesByAccount[accNow] : [];

  return (
    <TradeContext.Provider
      value={{
        allActiveTrades: activeTrades,
        activeTrades: activeTrades.filter(
          (t) => normalizeAccountType(t?.account, accountType) === accountType
        ),

        trades: tradesNow,

        lastResult,
        openTrade,
        registerClosedTrade,
        bindEngine,
        maxTrades: MAX_SIMULTANEOUS_TRADES,
        loadTradeHistory,
        loadOpenTrades,
      }}
    >
      {children}
    </TradeContext.Provider>
  );
}

export function useTrade() {
  const ctx = useContext(TradeContext);
  if (!ctx) throw new Error("useTrade must be used inside TradeProvider");
  return ctx;
}
