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

function stripLogicalFromPoint(pt) {
  if (!pt || typeof pt !== "object" || Array.isArray(pt)) return pt;
  const out = { ...pt };
  delete out.l;
  return out;
}


function parseCacheEntry(raw) {
  const parsed = safeJsonParse(raw);
  if (Array.isArray(parsed)) {
    return { payload: parsed, savedAt: 0 };
  }
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.payload)) {
    return {
      payload: parsed.payload,
      savedAt: Number(parsed.savedAt || parsed.updatedAt || parsed.ts || 0) || 0,
    };
  }
  return null;
}

function readBestLocalCache(keys) {
  let best = null;
  for (const key of keys || []) {
    if (!key) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    const entry = parseCacheEntry(raw);
    if (!entry || !Array.isArray(entry.payload)) continue;
    if (!best || entry.savedAt >= best.savedAt) best = entry;
  }
  return best;
}

function writeCacheEntry(key, payload) {
  const entry = { payload: Array.isArray(payload) ? payload : [], savedAt: Date.now() };
  localStorage.setItem(key, JSON.stringify(entry));
  return entry.savedAt;
}

function sanitizePayloadForPairScope(payload) {
  if (!Array.isArray(payload)) return [];

  return payload
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const next = { ...item };
      delete next.l;

      if (next.a) next.a = stripLogicalFromPoint(next.a);
      if (next.b) next.b = stripLogicalFromPoint(next.b);
      if (next.start) next.start = stripLogicalFromPoint(next.start);
      if (next.end) next.end = stripLogicalFromPoint(next.end);
      if (next.p1) next.p1 = stripLogicalFromPoint(next.p1);
      if (next.p2) next.p2 = stripLogicalFromPoint(next.p2);
      if (next.from) next.from = stripLogicalFromPoint(next.from);
      if (next.to) next.to = stripLogicalFromPoint(next.to);
      if (next.A) next.A = stripLogicalFromPoint(next.A);
      if (next.B) next.B = stripLogicalFromPoint(next.B);

      return next;
    });
}

export default function useDrawingsPersistence({ symbol, timeframe, drawingsApiRef, chartInstanceKey = "" }) {
  const sym = useMemo(() => normalizePair(symbol), [symbol]);
  const tf = useMemo(() => normalizeTf(timeframe), [timeframe]);
  const PAIR_SCOPE_TF = "__PAIR__";

  const [userId, setUserId] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);

  const saveTimerRef = useRef(0);
  const lastLoadTargetRef = useRef("");
  const loadSeqRef = useRef(0);
  const suppressPersistenceRef = useRef(false);
  const suppressReleaseTimerRef = useRef(0);

  const key = useMemo(() => {
    if (!authResolved || !sym) return "";
    const uid = userId || "anon";
    return `drawings:v2:${uid}:${sym}:${PAIR_SCOPE_TF}`;
  }, [authResolved, userId, sym]);

  const legacyKeys = useMemo(() => {
    if (!authResolved || !sym) return [];
    const uid = userId || "anon";
    const all = [tf, "M1", "M5", "M15", "M30", "H1"];
    return Array.from(new Set(all.filter(Boolean))).map((item) => `drawings:v1:${uid}:${sym}:${item}`);
  }, [authResolved, userId, sym, tf]);

  // ✅ pega user (sem depender de contexts)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!alive) return;
        setUserId(data?.user?.id || null);
        setAuthResolved(true);
      } catch {
        if (!alive) return;
        setUserId(null);
        setAuthResolved(true);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || null);
      setAuthResolved(true);
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

  const stopSuppressReleaseTimer = useCallback(() => {
    if (suppressReleaseTimerRef.current) {
      try {
        clearTimeout(suppressReleaseTimerRef.current);
      } catch {}
      suppressReleaseTimerRef.current = 0;
    }
  }, []);

  const beginProgrammaticHydration = useCallback(() => {
    suppressPersistenceRef.current = true;
    stopDebounce();
    stopSuppressReleaseTimer();
  }, [stopDebounce, stopSuppressReleaseTimer]);

  const endProgrammaticHydrationSoon = useCallback((delay = 900) => {
    stopSuppressReleaseTimer();
    suppressReleaseTimerRef.current = window.setTimeout(() => {
      suppressReleaseTimerRef.current = 0;
      suppressPersistenceRef.current = false;
    }, Math.max(0, Number(delay) || 0));
  }, [stopSuppressReleaseTimer]);

  useEffect(() => () => {
    stopDebounce();
    stopSuppressReleaseTimer();
  }, [stopDebounce, stopSuppressReleaseTimer]);

  const clearEngineInstant = useCallback(() => {
    const api = drawingsApiRef?.current;
    if (!api) return;

    try {
      // mais forte que clearAll: força estado consistente
      api.importJSON?.([]);
      api.invalidate?.();
    } catch {
      try {
        api.clearAll?.();
        api.invalidate?.();
      } catch {}
    }
  }, [drawingsApiRef]);

  const applyPayloadToEngine = useCallback(
    (payload) => {
      const api = drawingsApiRef?.current;
      if (!api?.importJSON) return;

      try {
        api.importJSON(payload);
        api.invalidate?.();
      } catch {}
    },
    [drawingsApiRef]
  );

  // ✅ load (local instantâneo + supabase em paralelo) com anti-race
  const load = useCallback(async () => {
    const api = drawingsApiRef?.current;
    if (!authResolved || !api?.importJSON || !sym || !tf || !key) return;

    beginProgrammaticHydration();
    const seq = ++loadSeqRef.current;

    // 1) local primeiro (instantâneo)
    let localSavedAt = 0;
    try {
      if (userId) {
        const anonKey = `drawings:v2:anon:${sym}:${PAIR_SCOPE_TF}`;
        const ownRaw = localStorage.getItem(key);
        const anonRaw = ownRaw ? null : localStorage.getItem(anonKey);
        if (!ownRaw && anonRaw) {
          try {
            localStorage.setItem(key, anonRaw);
          } catch {}
        }
      }

      const keysToTry = [key, ...legacyKeys];
      const localEntry = readBestLocalCache(keysToTry);
      if (localEntry?.payload) {
        if (seq !== loadSeqRef.current) return;
        applyPayloadToEngine(sanitizePayloadForPairScope(localEntry.payload));
      }

      localSavedAt = Number(localEntry?.savedAt || 0) || 0;
    } catch {}

    // 2) supabase (se logado)
    if (!userId) {
      endProgrammaticHydrationSoon();
      return;
    }

    try {
      let pairScoped = null;
      const pairScopedResp = await supabase
        .from("user_drawings")
        .select("payload, updated_at")
        .eq("user_id", userId)
        .eq("pair", sym)
        .eq("timeframe", PAIR_SCOPE_TF)
        .maybeSingle();

      if (seq !== loadSeqRef.current) return;
      if (!pairScopedResp.error && pairScopedResp.data?.payload) {
        pairScoped = pairScopedResp.data;
      }

      let chosen = pairScoped;

      if (!chosen) {
        const legacyResp = await supabase
          .from("user_drawings")
          .select("payload, timeframe, updated_at")
          .eq("user_id", userId)
          .eq("pair", sym)
          .in("timeframe", [tf, "M1", "M5", "M15", "M30", "H1"])
          .order("updated_at", { ascending: false })
          .limit(5);

        if (seq !== loadSeqRef.current) return;
        if (!legacyResp.error && Array.isArray(legacyResp.data) && legacyResp.data.length) {
          chosen = legacyResp.data.find((row) => row?.timeframe === tf && Array.isArray(row?.payload))
            || legacyResp.data.find((row) => Array.isArray(row?.payload))
            || null;
        }
      }

      if (!chosen?.payload) {
        endProgrammaticHydrationSoon();
        return;
      }

      const sanitized = sanitizePayloadForPairScope(chosen.payload);
      const remoteSavedAt = Date.parse(chosen.updated_at || pairScopedResp?.data?.updated_at || "") || 0;

      if (remoteSavedAt >= localSavedAt || !localSavedAt) {
        applyPayloadToEngine(sanitized);
        try {
          writeCacheEntry(key, sanitized);
        } catch {}
      }

      if (chosen?.timeframe && chosen.timeframe !== PAIR_SCOPE_TF) {
        try {
          await supabase.from("user_drawings").upsert(
            {
              user_id: userId,
              pair: sym,
              timeframe: PAIR_SCOPE_TF,
              payload: sanitized,
              version: 2,
            },
            { onConflict: "user_id,pair,timeframe" }
          );
        } catch {}
      }
    } catch {}
    finally {
      endProgrammaticHydrationSoon();
    }
  }, [applyPayloadToEngine, authResolved, beginProgrammaticHydration, drawingsApiRef, endProgrammaticHydrationSoon, key, legacyKeys, sym, tf, userId]);

  // ✅ salva (local + supabase upsert)
  const saveNow = useCallback(async () => {
    const api = drawingsApiRef?.current;
    if (!authResolved || !api?.exportJSON || !sym || !key) return;

    let payloadArr = [];
    try {
      const exported = api.exportJSON(); // string JSON
      const parsed = safeJsonParse(exported);
      if (Array.isArray(parsed)) payloadArr = sanitizePayloadForPairScope(parsed);
    } catch {}

    // local cache sempre
    try {
      writeCacheEntry(key, payloadArr);
    } catch {}

    // supabase apenas se logado
    if (!userId) return;

    try {
      await supabase.from("user_drawings").upsert(
        {
          user_id: userId,
          pair: sym,
          timeframe: PAIR_SCOPE_TF,
          payload: payloadArr,
          version: 2,
        },
        { onConflict: "user_id,pair,timeframe" }
      );
    } catch {}
  }, [authResolved, drawingsApiRef, key, sym, userId]);

  const scheduleSave = useCallback(() => {
    if (suppressPersistenceRef.current) return;
    stopDebounce();
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = 0;
      saveNow();
    }, 650);
  }, [saveNow, stopDebounce]);

  // ✅ plugar no DrawingOverlay.onChange
  const onDrawingsChange = useCallback(() => {
    scheduleSave();
  }, [scheduleSave]);

  // ✅ plugar no DrawingOverlay.onCommit (salva imediato)
  const onDrawingsCommit = useCallback(() => {
    if (suppressPersistenceRef.current) return;
    stopDebounce();
    saveNow();
  }, [saveNow, stopDebounce]);

  // ✅ quando muda par/TF/user: some IMEDIATO e depois carrega certo (sem race)
  useEffect(() => {
    if (!authResolved || !key) return;

    const loadTarget = `${key}::${chartInstanceKey || "stable"}`;
    if (lastLoadTargetRef.current === loadTarget) return;
    lastLoadTargetRef.current = loadTarget;

    // mata race antiga
    loadSeqRef.current++;
    beginProgrammaticHydration();

    // ✅ some em milissegundos (sem vazar pro outro par)
    clearEngineInstant();

    // espera apiRef estar pronto (overlay monta depois)
    const t0 = performance.now();
    const tick = () => {
      const api = drawingsApiRef?.current;
      if (api?.importJSON) {
        load();
        return;
      }
      if (performance.now() - t0 > 2500) {
        endProgrammaticHydrationSoon();
        return;
      }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [authResolved, beginProgrammaticHydration, key, load, drawingsApiRef, clearEngineInstant, chartInstanceKey, endProgrammaticHydrationSoon]);

  return { onDrawingsChange, onDrawingsCommit, load, saveNow };
}
