// src/components/Chart/Indicators/persistence/useIndicatorsPersistence.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/services/supabaseClient";

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

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ✅ chave de cache do último usuário logado (para boot instantâneo no F5)
const LAST_UID_KEY = "indicators:last_uid";

// ✅ persistência global na mesma tabela (sem migração)
const GLOBAL_PAIR = "__GLOBAL__";
const GLOBAL_TF = "__GLOBAL__";

/**
 * Persistência GLOBAL dos indicadores (instances) por user.
 * - LocalStorage instantâneo (F5)
 * - Supabase (login/logout, multi-device)
 *
 * Contract:
 * - getIndicatorsState(): retorna ARRAY serializável (instances)
 * - applyIndicatorsState(arr): aplica no context (setAllInstances)
 * - clearIndicatorsInstant(): limpa instantâneo (clearAllIndicators)
 */
export default function useIndicatorsPersistence({
  symbol,
  timeframe,
  getIndicatorsState,
  applyIndicatorsState,
  clearIndicatorsInstant,
}) {
  // 🔸 mantemos sym/tf apenas para migração do legado v1 (pair+tf)
  const sym = useMemo(() => normalizePair(symbol), [symbol]);
  const tf = useMemo(() => normalizeTf(timeframe), [timeframe]);

  const [userId, setUserId] = useState(null);

  // ✅ bootUid: pego do localStorage SINCRONO no primeiro render (zero delay no F5)
  const [bootUid] = useState(() => {
    try {
      const v = (localStorage.getItem(LAST_UID_KEY) || "").trim();
      return v || null;
    } catch {
      return null;
    }
  });

  const saveTimerRef = useRef(0);
  const lastKeyRef = useRef("");
  const loadSeqRef = useRef(0);

  // ✅ prioridade:
  // 1) userId real (quando chegar)
  // 2) bootUid (instantâneo no F5)
  // 3) anon
  const uid = useMemo(() => userId || bootUid || "anon", [userId, bootUid]);

  // ✅ NOVA chave: GLOBAL por uid (não depende de par/TF)
  const key = useMemo(() => {
    return `indicators:v2:${uid}:global`;
  }, [uid]);

  // ✅ chave antiga (legado v1) por par/TF — usada só para migração automática
  const legacyKey = useMemo(() => {
    if (!sym || !tf) return "";
    return `indicators:v1:${uid}:${sym}:${tf}`;
  }, [uid, sym, tf]);

  // ✅ pega user (sem depender de contexts)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;
        const id = data?.session?.user?.id || null;
        setUserId(id);
      } catch {
        if (!alive) return;
        setUserId(null);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id || null;
      setUserId(id);
    });

    return () => {
      alive = false;
      try {
        sub?.subscription?.unsubscribe?.();
      } catch {}
    };
  }, []);

  const stopDebounce = useCallback(() => {
    if (saveTimerRef.current) {
      try {
        clearTimeout(saveTimerRef.current);
      } catch {}
      saveTimerRef.current = 0;
    }
  }, []);

  useEffect(() => () => stopDebounce(), [stopDebounce]);

  const saveNow = useCallback(async () => {
    if (!key) return;

    let arr = [];
    try {
      const st = getIndicatorsState?.();
      if (Array.isArray(st)) arr = st;
    } catch {}

    // local cache sempre
    try {
      localStorage.setItem(key, JSON.stringify(arr));
    } catch {}

    // ✅ salva o último uid logado para boot instantâneo no F5
    if (userId) {
      try {
        localStorage.setItem(LAST_UID_KEY, String(userId));
      } catch {}
    }

    // supabase apenas se logado
    if (!userId) return;

    try {
      await supabase.from("user_indicators").upsert(
        {
          user_id: userId,
          pair: GLOBAL_PAIR,
          timeframe: GLOBAL_TF,
          payload: arr, // ✅ payload é array de instances
          version: 2,
        },
        { onConflict: "user_id,pair,timeframe" }
      );
    } catch {}
  }, [getIndicatorsState, key, userId]);

  const load = useCallback(async () => {
    if (!key) return;

    const seq = ++loadSeqRef.current;

    // 1) local instantâneo (GLOBAL v2)
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = safeJsonParse(raw);
        if (Array.isArray(parsed)) {
          if (seq !== loadSeqRef.current) return;
          applyIndicatorsState?.(parsed);
          return;
        }
      }
    } catch {}

    // 1.1) migração local do legado v1 (se existir)
    if (legacyKey) {
      try {
        const rawLegacy = localStorage.getItem(legacyKey);
        if (rawLegacy) {
          const parsedLegacy = safeJsonParse(rawLegacy);
          if (Array.isArray(parsedLegacy)) {
            if (seq !== loadSeqRef.current) return;
            applyIndicatorsState?.(parsedLegacy);

            // promove para v2 global
            try {
              localStorage.setItem(key, JSON.stringify(parsedLegacy));
            } catch {}
            // salva no supabase (se logado)
            if (userId) {
              try {
                await supabase.from("user_indicators").upsert(
                  {
                    user_id: userId,
                    pair: GLOBAL_PAIR,
                    timeframe: GLOBAL_TF,
                    payload: parsedLegacy,
                    version: 2,
                  },
                  { onConflict: "user_id,pair,timeframe" }
                );
              } catch {}
            }

            return;
          }
        }
      } catch {}
    }

    // 2) supabase (se logado)
    if (!userId) return;

    // 2.1) tenta GLOBAL primeiro
    try {
      const { data, error } = await supabase
        .from("user_indicators")
        .select("payload, updated_at")
        .eq("user_id", userId)
        .eq("pair", GLOBAL_PAIR)
        .eq("timeframe", GLOBAL_TF)
        .maybeSingle();

      if (seq !== loadSeqRef.current) return;
      if (error) return;

      const payload = data?.payload;
      const arr =
        Array.isArray(payload) ? payload : Array.isArray(payload?.instances) ? payload.instances : null;

      if (Array.isArray(arr)) {
        applyIndicatorsState?.(arr);
        try {
          localStorage.setItem(key, JSON.stringify(arr));
        } catch {}
        return;
      }
    } catch {}

    // 2.2) fallback: migra do legado (pair+tf) no supabase (se existir)
    if (!sym || !tf) return;

    try {
      const { data, error } = await supabase
        .from("user_indicators")
        .select("payload, updated_at")
        .eq("user_id", userId)
        .eq("pair", sym)
        .eq("timeframe", tf)
        .maybeSingle();

      if (seq !== loadSeqRef.current) return;
      if (error) return;

      const payload = data?.payload;
      const arr =
        Array.isArray(payload) ? payload : Array.isArray(payload?.instances) ? payload.instances : null;

      if (!Array.isArray(arr)) return;

      applyIndicatorsState?.(arr);

      // promove para global
      try {
        localStorage.setItem(key, JSON.stringify(arr));
      } catch {}

      try {
        await supabase.from("user_indicators").upsert(
          {
            user_id: userId,
            pair: GLOBAL_PAIR,
            timeframe: GLOBAL_TF,
            payload: arr,
            version: 2,
          },
          { onConflict: "user_id,pair,timeframe" }
        );
      } catch {}
    } catch {}
  }, [applyIndicatorsState, key, legacyKey, sym, tf, userId]);

  const scheduleSave = useCallback(() => {
    stopDebounce();
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = 0;
      saveNow();
    }, 650);
  }, [saveNow, stopDebounce]);

  const onIndicatorsChange = useCallback(() => {
    scheduleSave();
  }, [scheduleSave]);

  const onIndicatorsCommit = useCallback(() => {
    stopDebounce();
    saveNow();
  }, [saveNow, stopDebounce]);

  // ✅ Agora: só reage a mudança de UID (key global).
  // Não limpa/recarrega em troca de par/TF -> elimina sumiço e trepidação de remount.
  useEffect(() => {
    if (!key) return;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    loadSeqRef.current++;

    try {
      clearIndicatorsInstant?.();
    } catch {}

    requestAnimationFrame(() => load());
  }, [key, load, clearIndicatorsInstant]);

  return { onIndicatorsChange, onIndicatorsCommit, load, saveNow };
}