import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { useAccount } from "./AccountContext";
import { useTradingAuth } from "./TradingAuthContext";
import { supabase } from "../services/supabaseClient";

const BalanceContext = createContext();

function toNumberSafe(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeType(v, fallback) {
  const t = String(v || fallback || "").toUpperCase();
  return t === "REAL" ? "REAL" : "DEMO";
}

function coerceBalanceLocal(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return null;
    return coerceBalanceLocal(v[0]);
  }
  if (v && typeof v === "object") {
    const o = v;
    const cand = o.balance ?? o.new_balance ?? o.value ?? o.result ?? o.amount;
    return coerceBalanceLocal(cand);
  }
  return null;
}

// ✅ Cache por usuário
const LS_BAL_PREFIX = "tp_wallet_balance_cache_v1:";

function lsKey(uid, type) {
  return `${LS_BAL_PREFIX}${uid}:${normalizeType(type, "DEMO")}`;
}

function safeGetCachedBalance(uid, type) {
  try {
    if (!uid) return null;
    const raw = localStorage.getItem(lsKey(uid, type));
    if (raw === null || raw === undefined) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function safeSetCachedBalance(uid, type, value) {
  try {
    if (!uid) return;
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    localStorage.setItem(lsKey(uid, type), String(n));
  } catch {}
}

export function BalanceProvider({ children }) {
  const { accountType, accountReady } = useAccount();
  const { user, loading: authLoading } = useTradingAuth();

  const uid = user?.id || null;

  const [balances, setBalances] = useState(() => {
    if (!uid) return { REAL: 0, DEMO: 10000 };

    const cachedReal = safeGetCachedBalance(uid, "REAL");
    const cachedDemo = safeGetCachedBalance(uid, "DEMO");

    return { REAL: cachedReal, DEMO: cachedDemo };
  });

  const [ready, setReady] = useState(false);
  const [readyByType, setReadyByType] = useState({ REAL: false, DEMO: false });

  // ✅ CRÍTICO: nunca exponha balance do tipo ativo se ele não estiver confirmado
  const balance = ready && readyByType?.[accountType] ? balances?.[accountType] : null;

  const rtDbRef = useRef(null);
  const rtBroadcastRef = useRef(null);
  const loadSeqRef = useRef(0);

  // ✅ troca de usuário
  useEffect(() => {
    setReady(false);
    setReadyByType({ REAL: false, DEMO: false });

    if (authLoading) return;

    if (!uid) {
      setBalances({ REAL: 0, DEMO: 10000 });
      setReady(true);
      setReadyByType({ REAL: true, DEMO: true });
      return;
    }

    const cachedReal = safeGetCachedBalance(uid, "REAL");
    const cachedDemo = safeGetCachedBalance(uid, "DEMO");

    setBalances({ REAL: cachedReal, DEMO: cachedDemo });

    setReadyByType({
      REAL: Number.isFinite(Number(cachedReal)),
      DEMO: Number.isFinite(Number(cachedDemo)),
    });
  }, [uid, authLoading]);

  const reload = useCallback(async () => {
    if (authLoading) return false;
    if (!uid) return false;

    const seq = ++loadSeqRef.current;

    const { data, error } = await supabase
      .from("wallets")
      .select("account_type,balance")
      .eq("user_id", uid);

    if (seq !== loadSeqRef.current) return false;

    if (error) {
      console.warn("[Balance] reload wallets error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return false;
    }

    const next = { REAL: null, DEMO: null };

    for (const row of data || []) {
      const t = normalizeType(row?.account_type);
      const v = toNumberSafe(row?.balance);
      if (v !== null) next[t] = v;
    }

    setBalances((prev) => {
      const cacheReal = safeGetCachedBalance(uid, "REAL");
      const cacheDemo = safeGetCachedBalance(uid, "DEMO");

      const merged = {
        REAL:
          next.REAL !== null
            ? next.REAL
            : Number.isFinite(Number(cacheReal))
            ? Number(cacheReal)
            : prev?.REAL,
        DEMO:
          next.DEMO !== null
            ? next.DEMO
            : Number.isFinite(Number(cacheDemo))
            ? Number(cacheDemo)
            : prev?.DEMO,
      };

      if (!Number.isFinite(Number(merged.REAL))) merged.REAL = 0;
      if (!Number.isFinite(Number(merged.DEMO))) merged.DEMO = 10000;

      safeSetCachedBalance(uid, "REAL", merged.REAL);
      safeSetCachedBalance(uid, "DEMO", merged.DEMO);

      return merged;
    });

    setReadyByType({
      REAL: next.REAL !== null || Number.isFinite(Number(safeGetCachedBalance(uid, "REAL"))),
      DEMO: next.DEMO !== null || Number.isFinite(Number(safeGetCachedBalance(uid, "DEMO"))),
    });

    return true;
  }, [uid, authLoading]);

  // ✅ boot inicial (sincronizado com accountReady)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (authLoading) return;
      if (!uid) return;
      if (!accountReady) return;

      const ok = await reload();
      if (cancelled) return;

      setReady(true);
      if (!ok) setReady(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [uid, authLoading, accountReady, reload]);

  // ✅ FIX DEFINITIVO DO “SALDO VAZANDO NA TROCA”
  // UseLayoutEffect roda ANTES do paint, então não existe 1-frame com saldo antigo.
  useLayoutEffect(() => {
    if (authLoading) return;
    if (!uid) return;
    if (!accountReady) return;

    const t = normalizeType(accountType, "DEMO");

    // ✅ (1) invalida o tipo alvo IMEDIATAMENTE (antes do paint)
    setBalances((prev) => {
      if (prev?.[t] === null) return prev;
      return { ...prev, [t]: null };
    });

    setReadyByType((prev) => {
      if (prev?.[t] === false) return prev;
      return { ...prev, [t]: false };
    });

    // ✅ (2) carrega cache ainda no mesmo ciclo (continua antes do paint, pois é sync)
    const cached = safeGetCachedBalance(uid, t);
    if (Number.isFinite(Number(cached))) {
      setBalances((prev) => ({ ...prev, [t]: Number(cached) }));
      setReadyByType((prev) => ({ ...prev, [t]: true }));
    }

    // ✅ (3) cancela respostas antigas e força sync do backend
    loadSeqRef.current += 1;
    reload().catch(() => {});
  }, [accountType, uid, authLoading, accountReady, reload]);

  // ============================
  // ✅ Realtime DB
  // ============================
  useEffect(() => {
    if (rtDbRef.current) {
      supabase.removeChannel(rtDbRef.current);
      rtDbRef.current = null;
    }

    if (authLoading) return;
    if (!uid) return;

    const channel = supabase
      .channel(`wallets:db:${uid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallets",
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const row = payload?.new ?? payload?.old;
          if (!row) return;

          const t = normalizeType(row.account_type, "DEMO");

          if (payload.eventType === "DELETE") {
            setBalances((prev) => {
              const next = { ...prev, [t]: 0 };
              safeSetCachedBalance(uid, t, 0);
              return next;
            });
            setReadyByType((r) => ({ ...r, [t]: true }));
            return;
          }

          const bal = toNumberSafe(row.balance);
          if (bal === null) return;

          setBalances((prev) => {
            const cur = toNumberSafe(prev?.[t]);
            if (cur === bal) return prev;

            const next = { ...prev, [t]: bal };
            safeSetCachedBalance(uid, t, bal);
            return next;
          });

          setReadyByType((r) => ({ ...r, [t]: true }));
        }
      )
      .subscribe();

    rtDbRef.current = channel;

    return () => {
      if (rtDbRef.current) {
        supabase.removeChannel(rtDbRef.current);
        rtDbRef.current = null;
      }
    };
  }, [uid, authLoading]);

  // ============================
  // ✅ Broadcast
  // ============================
  useEffect(() => {
    if (rtBroadcastRef.current) {
      supabase.removeChannel(rtBroadcastRef.current);
      rtBroadcastRef.current = null;
    }

    if (authLoading) return;
    if (!uid) return;

    const channel = supabase
      .channel(`wallets:user:${uid}`)
      .on("broadcast", { event: "wallet_updated" }, ({ payload }) => {
        const t = normalizeType(payload?.account_type, "DEMO");

        const bal =
          coerceBalanceLocal(payload?.balance) ??
          coerceBalanceLocal(payload?.normalized_balance) ??
          coerceBalanceLocal(payload?.balance_raw);

        if (bal === null) return;

        setBalances((prev) => {
          const cur = toNumberSafe(prev?.[t]);
          if (cur === bal) return prev;

          const next = { ...prev, [t]: bal };
          safeSetCachedBalance(uid, t, bal);
          return next;
        });

        setReadyByType((r) => ({ ...r, [t]: true }));
      })
      .subscribe();

    rtBroadcastRef.current = channel;

    return () => {
      if (rtBroadcastRef.current) {
        supabase.removeChannel(rtBroadcastRef.current);
        rtBroadcastRef.current = null;
      }
    };
  }, [uid, authLoading]);

  async function applyDelta(amountDelta, type) {
    const t = normalizeType(type, accountType);
    const d = toNumberSafe(amountDelta);

    if (d === null || d === 0) return false;

    setBalances((prev) => {
      const cur = toNumberSafe(prev?.[t]) ?? 0;
      const nextVal = cur + d;
      const next = { ...prev, [t]: nextVal };
      if (uid) safeSetCachedBalance(uid, t, nextVal);
      return next;
    });
    setReadyByType((r) => ({ ...r, [t]: true }));

    const { data, error } = await supabase.rpc("wallet_apply_delta", {
      p_account_type: t,
      p_delta: d,
    });

    if (error) {
      setBalances((prev) => {
        const cur = toNumberSafe(prev?.[t]) ?? 0;
        const nextVal = cur - d;
        const next = { ...prev, [t]: nextVal };
        if (uid) safeSetCachedBalance(uid, t, nextVal);
        return next;
      });

      console.warn("[Balance] wallet_apply_delta error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        delta: d,
        account_type: t,
        ctx_user_id: uid ?? null,
      });

      return false;
    }

    const newBalance = toNumberSafe(data);
    if (newBalance !== null) {
      setBalances((prev) => {
        const next = { ...prev, [t]: newBalance };
        if (uid) safeSetCachedBalance(uid, t, newBalance);
        return next;
      });
      setReadyByType((r) => ({ ...r, [t]: true }));
    }

    return true;
  }

  function debit(amount, type = accountType) {
    const a = toNumberSafe(amount);
    if (a === null || a <= 0) return Promise.resolve(false);
    const t = normalizeType(type, accountType);
    return applyDelta(-a, t);
  }

  function credit(amount, type = accountType) {
    const a = toNumberSafe(amount);
    if (a === null || a <= 0) return Promise.resolve(false);
    const t = normalizeType(type, accountType);
    return applyDelta(+a, t);
  }

  function resetDemo() {
    setBalances((prev) => {
      const next = { ...prev, DEMO: 10000 };
      if (uid) safeSetCachedBalance(uid, "DEMO", 10000);
      return next;
    });
    setReadyByType((r) => ({ ...r, DEMO: true }));
  }

  const resetDemoBalance = useCallback(
    async (amount = 10000) => {
      const v = toNumberSafe(amount);
      const target = v !== null && v > 0 ? v : 10000;

      setBalances((prev) => {
        const next = { ...prev, DEMO: target };
        if (uid) safeSetCachedBalance(uid, "DEMO", target);
        return next;
      });
      setReadyByType((r) => ({ ...r, DEMO: true }));

      const { error } = await supabase.rpc("reset_demo_balance", { p_amount: target });

      if (error) {
        console.warn("[Balance] reset_demo_balance error:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          p_amount: target,
          ctx_user_id: uid ?? null,
        });

        await reload();
        return false;
      }

      await reload();
      return true;
    },
    [reload, uid]
  );

  return (
    <BalanceContext.Provider
      value={{
        ready,
        readyByType,
        balance,
        balances,
        debit,
        credit,
        resetDemo,
        resetDemoBalance,
        reload,
      }}
    >
      {children}
    </BalanceContext.Provider>
  );
}

export function useBalance() {
  return useContext(BalanceContext);
}
