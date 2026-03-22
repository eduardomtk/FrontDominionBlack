// src/context/AccountContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../services/supabaseClient";
import { useTradingAuth } from "./TradingAuthContext";

const AccountContext = createContext();

function normalizeAccountType(v, fallback) {
  const t = String(v || fallback || "").toUpperCase();
  return t === "REAL" ? "REAL" : "DEMO";
}

const LS_KEY_PREFIX = "tp_account_type_cache_v1:";

function safeGetCachedType(uid) {
  try {
    if (!uid) return null;
    const raw = localStorage.getItem(`${LS_KEY_PREFIX}${uid}`);
    if (!raw) return null;
    return normalizeAccountType(raw, null);
  } catch {
    return null;
  }
}

function safeSetCachedType(uid, type) {
  try {
    if (!uid) return;
    localStorage.setItem(`${LS_KEY_PREFIX}${uid}`, normalizeAccountType(type, "DEMO"));
  } catch {}
}

export const AccountProvider = ({ children }) => {
  const { user } = useTradingAuth();
  const uid = user?.id || null;

  // ✅ Inicializa sincrono (evita flash no F5):
  // - se tiver cache do usuário, nasce REAL/DEMO corretamente
  // - senão, DEMO
  const [accountType, setAccountType] = useState(() => {
    const cached = safeGetCachedType(uid);
    return cached || "DEMO";
  });

  // ✅ NOVO: indica quando a preferência já foi carregada/decidida
  const [accountReady, setAccountReady] = useState(false);

  // ✅ evita race: se o user mudar enquanto carrega, ignora resposta antiga
  const loadSeqRef = useRef(0);

  // ✅ Se trocar de usuário (login/logout), tenta hidratar do cache imediatamente
  useEffect(() => {
    // sempre que trocar user, voltamos pra "não pronto" até carregar
    setAccountReady(false);

    if (!uid) {
      setAccountType("DEMO");
      setAccountReady(true);
      return;
    }

    const cached = safeGetCachedType(uid);
    if (cached) {
      setAccountType(cached);
    }
  }, [uid]);

  const loadPreference = useCallback(async () => {
    const currentUid = uid;

    if (!currentUid) return;

    const seq = ++loadSeqRef.current;

    try {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("selected_account_type")
        .eq("user_id", currentUid)
        .maybeSingle();

      // se user mudou durante a chamada, ignora
      if (seq !== loadSeqRef.current) return;

      if (error) {
        console.warn("[AccountPref] load error:", error.message);
        // ✅ não força DEMO aqui — mantém o que já estava (cache ou estado atual)
        setAccountReady(true);
        return;
      }

      // ✅ primeiro acesso (sem preferência salva ainda)
      if (!data) {
        // usa o que já está no estado/cache como “first”, senão DEMO
        const first = normalizeAccountType(accountType, "DEMO");
        setAccountType(first);
        safeSetCachedType(currentUid, first);

        const { error: upsertErr } = await supabase
          .from("user_preferences")
          .upsert({ user_id: currentUid, selected_account_type: first }, { onConflict: "user_id" });

        if (upsertErr) console.warn("[AccountPref] upsert first error:", upsertErr.message);

        setAccountReady(true);
        return;
      }

      const next = normalizeAccountType(data.selected_account_type, accountType);
      setAccountType(next);
      safeSetCachedType(currentUid, next);
      setAccountReady(true);
    } catch (e) {
      console.warn("[AccountPref] load exception:", e?.message || e);
      // ✅ não força DEMO — mantém o que já estava
      setAccountReady(true);
    }
  }, [uid, accountType]);

  useEffect(() => {
    loadPreference();
  }, [loadPreference]);

  const switchAccount = useCallback(
    async (type) => {
      const next = normalizeAccountType(type, accountType);
      if (next === accountType) return;

      setAccountType(next);

      const currentUid = uid;
      if (currentUid) safeSetCachedType(currentUid, next);

      if (!currentUid) return;

      try {
        const { error } = await supabase
          .from("user_preferences")
          .upsert(
            { user_id: currentUid, selected_account_type: next, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );

        if (error) console.warn("[AccountPref] save error:", error.message);
      } catch (e) {
        console.warn("[AccountPref] save exception:", e?.message || e);
      }
    },
    [accountType, uid]
  );

  return (
    <AccountContext.Provider value={{ accountType, accountReady, switchAccount }}>
      {children}
    </AccountContext.Provider>
  );
};

export const useAccount = () => useContext(AccountContext);
