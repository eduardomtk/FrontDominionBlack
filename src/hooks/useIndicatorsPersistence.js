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

/**
 * Contract esperado (você pluga conforme teu engine):
 * - getIndicatorsState(): retorna objeto serializável (ex: { overlays: [...], panes: [...] })
 * - applyIndicatorsState(payloadObj): aplica no engine/estado e força re-render se necessário
 * - clearIndicatorsInstant(): limpa overlays+panes imediatamente (anti “vazamento” entre par/TF)
 */
export default function useIndicatorsPersistence({
  symbol,
  timeframe,
  getIndicatorsState,
  applyIndicatorsState,
  clearIndicatorsInstant,
}) {
  const sym = useMemo(() => normalizePair(symbol), [symbol]);
  const tf = useMemo(() => normalizeTf(timeframe), [timeframe]);

  const [userId, setUserId] = useState(null);

  const saveTimerRef = useRef(0);
  const lastKeyRef = useRef("");
  const loadSeqRef = useRef(0);

  const key = useMemo(() => {
    const uid = userId || "anon";
    if (!sym || !tf) return "";
    return `indicators:v1:${uid}:${sym}:${tf}`;
  }, [userId, sym, tf]);

  // ✅ pega user (sem depender de contexts)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!alive) return;
        setUserId(data?.user?.id || null);
      } catch {
        if (!alive) return;
        setUserId(null);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || null);
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

  const load = useCallback(async () => {
    if (!key || !sym || !tf) return;

    const seq = ++loadSeqRef.current;

    // 1) local instantâneo
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = safeJsonParse(raw);
        if (parsed && typeof parsed === "object") {
          if (seq !== loadSeqRef.current) return;
          applyIndicatorsState?.(parsed);
        }
      }
    } catch {}

    // 2) supabase se logado
    if (!userId) return;

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
      if (!data?.payload) return;

      applyIndicatorsState?.(data.payload);

      try {
        localStorage.setItem(key, JSON.stringify(data.payload));
      } catch {}
    } catch {}
  }, [applyIndicatorsState, key, sym, tf, userId]);

  const saveNow = useCallback(async () => {
    if (!key || !sym || !tf) return;

    let payloadObj = {};
    try {
      const st = getIndicatorsState?.();
      if (st && typeof st === "object") payloadObj = st;
    } catch {}

    // local cache sempre
    try {
      localStorage.setItem(key, JSON.stringify(payloadObj));
    } catch {}

    // supabase apenas se logado
    if (!userId) return;

    try {
      await supabase.from("user_indicators").upsert(
        {
          user_id: userId,
          pair: sym,
          timeframe: tf,
          payload: payloadObj,
          version: 1,
        },
        { onConflict: "user_id,pair,timeframe" }
      );
    } catch {}
  }, [getIndicatorsState, key, sym, tf, userId]);

  const scheduleSave = useCallback(() => {
    stopDebounce();
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = 0;
      saveNow();
    }, 650);
  }, [saveNow, stopDebounce]);

  // ✅ plugar em “onChange” (overlay/pane)
  const onIndicatorsChange = useCallback(() => {
    scheduleSave();
  }, [scheduleSave]);

  // ✅ plugar em “onCommit” (drop/confirm/config apply)
  const onIndicatorsCommit = useCallback(() => {
    stopDebounce();
    saveNow();
  }, [saveNow, stopDebounce]);

  // ✅ quando muda par/TF/user: limpa IMEDIATO e recarrega (sem race)
  useEffect(() => {
    if (!key) return;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;

    // mata race antiga
    loadSeqRef.current++;

    // some em milissegundos (sem vazar)
    try {
      clearIndicatorsInstant?.();
    } catch {}

    // carrega no próximo frame
    requestAnimationFrame(() => load());
  }, [key, load, clearIndicatorsInstant]);

  return { onIndicatorsChange, onIndicatorsCommit, load, saveNow };
}