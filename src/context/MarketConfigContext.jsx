// src/context/MarketConfigContext.jsx
import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/services/supabaseClient";

/**
 * ✅ Regras de sessão (source of truth):
 * - enabled=false => fechado sempre
 * - session_mode="manual" => manual_open decide
 * - session_mode="auto" =>
 *    - se existir market_sessions para o símbolo => decide por sessões (hora do servidor + TZ)
 *    - senão, se schedule_enabled=true e open_time/close_time definidos => decide por agenda (hora do servidor + TZ)
 *    - senão => aberto (auto sem agenda)
 *
 * Horários são aplicados com base no relógio do SERVIDOR (get_server_time()).
 */

const MarketConfigContext = createContext(null);

function normalizeSymbol(v) {
  return String(v || "").trim().toUpperCase().replace(/\s+/g, "");
}

function safeNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, a, b) {
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}

// 0=Dom..6=Sáb
const WEEKDAY_TO_BIT = [1, 2, 4, 8, 16, 32, 64];

function parseTimeToMinutes(hhmmss) {
  const s = String(hhmmss || "").trim();
  if (!s) return null;
  // aceita HH:MM:SS ou HH:MM
  const m = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/.exec(s);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return hh * 60 + mm;
}

function getZonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = fmt.formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;

  const wd = String(map.weekday || "").toLowerCase();
  const hour = Number(map.hour);
  const minute = Number(map.minute);

  const weekday =
    wd.startsWith("sun") ? 0 :
    wd.startsWith("mon") ? 1 :
    wd.startsWith("tue") ? 2 :
    wd.startsWith("wed") ? 3 :
    wd.startsWith("thu") ? 4 :
    wd.startsWith("fri") ? 5 :
    wd.startsWith("sat") ? 6 : 0;

  return { weekday, minutes: hour * 60 + minute };
}

function getWeeklyDayCfg(weekly, day) {
  if (!weekly || typeof weekly !== "object") return null;
  const v = weekly[day] ?? weekly[String(day)];
  if (!v || typeof v !== "object") return null;
  return v;
}

// ============================================================
// ✅ (0) AGENDA POR DIA (weekly_schedule)
// ============================================================
function isOpenByWeeklySchedule(serverDate, cfg) {
  // Se schedule não estiver ON, a agenda não manda (mantém semântica atual)
  if (!cfg?.schedule_enabled) return true;

  const useWeekly = cfg?.use_weekly_schedule === true;
  const weekly = cfg?.weekly_schedule;

  if (!useWeekly || !weekly) {
    return null; // sinaliza: "não tenho weekly"
  }

  const tz = String(cfg?.tz || "America/Sao_Paulo");
  const { weekday, minutes } = getZonedParts(serverDate, tz);

  const today = getWeeklyDayCfg(weekly, weekday);
  const yesterday = getWeeklyDayCfg(weekly, (weekday + 6) % 7);

  // helper: interpreta um dia (se não enabled => fechado)
  const dayEnabled = (d) => Boolean(d?.enabled);

  // Se hoje tem janela "normal" (open<=close), decide hoje
  if (dayEnabled(today)) {
    const openMin = parseTimeToMinutes(today?.open_time);
    const closeMin = parseTimeToMinutes(today?.close_time);

    if (openMin === null || closeMin === null) return false; // weekly ON mas inválido => fechado

    const inSameDayWindow = openMin <= closeMin;

    if (inSameDayWindow) {
      const isEndOfDay = closeMin === 23 * 60 + 59; // 1439
      return minutes >= openMin && (minutes < closeMin || (isEndOfDay && minutes === closeMin));
    }

    // cruza meia-noite: parte A (no próprio dia, depois de open)
    if (minutes >= openMin) return true;
    // parte B (dia seguinte antes de close) é decidido pelo "ontem"
  }

  // Parte B: madrugada do dia atual pode vir do "ontem" se ontem cruzava meia-noite
  if (dayEnabled(yesterday)) {
    const yOpen = parseTimeToMinutes(yesterday?.open_time);
    const yClose = parseTimeToMinutes(yesterday?.close_time);

    if (yOpen === null || yClose === null) return false;

    const yCrossesMidnight = yOpen > yClose;
    if (yCrossesMidnight && minutes < yClose) return true;
  }

  return false;
}

// ============================================================
// ✅ (1) AGENDA LEGACY (market_configs)
// ============================================================
function isOpenBySchedule(serverDate, cfg) {
  if (!cfg?.schedule_enabled) return true;

  const tz = String(cfg?.tz || "America/Sao_Paulo");
  const { weekday, minutes } = getZonedParts(serverDate, tz);

  const openMin = parseTimeToMinutes(cfg?.open_time);
  const closeMin = parseTimeToMinutes(cfg?.close_time);

  if (openMin === null || closeMin === null) {
    // agenda ligada mas sem horários válidos => fechado (mais seguro)
    return false;
  }

  const mask = clamp(safeNum(cfg?.open_days, 127), 0, 127);

  const todayBit = WEEKDAY_TO_BIT[weekday] || 1;
  const yesterday = (weekday + 6) % 7;
  const yesterdayBit = WEEKDAY_TO_BIT[yesterday] || 1;

  const inSameDayWindow = openMin <= closeMin;

  if (inSameDayWindow) {
    const dayAllowed = (mask & todayBit) !== 0;
    if (!dayAllowed) return false;
    const isEndOfDay = closeMin === 23 * 60 + 59; // 1439
    return minutes >= openMin && (minutes < closeMin || (isEndOfDay && minutes === closeMin));
  }

  // janela cruza meia-noite (ex: 21:00 -> 06:00)
  if (minutes >= openMin) {
    const dayAllowed = (mask & todayBit) !== 0;
    return dayAllowed;
  }

  if (minutes < closeMin) {
    const dayAllowed = (mask & yesterdayBit) !== 0;
    return dayAllowed;
  }

  return false;
}

// ============================================================
// ✅ (2) SESSÕES PROFISSIONAIS (market_sessions)
// ============================================================
function isOpenBySessions(serverDate, sessions, fallbackTz) {
  const list = Array.isArray(sessions) ? sessions : [];
  if (list.length === 0) return null; // sinaliza: "não tenho sessões"

  // Se qualquer sessão estiver enabled=false, ignoramos ela.
  // Abrir: se existir ao menos 1 sessão enabled que case.
  for (const s of list) {
    if (s?.enabled === false) continue;

    const tz = String(s?.tz || fallbackTz || "America/Sao_Paulo");
    const { weekday, minutes } = getZonedParts(serverDate, tz);

    const day = Number(s?.day_of_week);
    if (!Number.isFinite(day) || day < 0 || day > 6) continue;

    const openMin = parseTimeToMinutes(s?.open_time);
    const closeMin = parseTimeToMinutes(s?.close_time);
    if (openMin === null || closeMin === null) continue;

    const inSameDayWindow = openMin <= closeMin;

    if (inSameDayWindow) {
      if (weekday !== day) continue;
      if (minutes >= openMin && minutes < closeMin) return true;
      continue;
    }

    // cruza meia-noite
    // parte A: no próprio dia após open
    if (weekday === day && minutes >= openMin) return true;

    // parte B: no dia seguinte antes de close
    const nextDay = (day + 1) % 7;
    if (weekday === nextDay && minutes < closeMin) return true;
  }

  return false;
}

function computeTradable(serverDate, cfg, sessionsBySymbol) {
  if (!cfg) return { isOpen: true, reason: "default" };

  if (cfg.enabled === false) return { isOpen: false, reason: "disabled" };

  const mode = String(cfg.session_mode || "auto");
  if (mode === "manual") {
    return { isOpen: Boolean(cfg.manual_open), reason: "manual" };
  }

  // ✅ prioridade: market_sessions (se existirem para o símbolo)
  const sym = normalizeSymbol(cfg?.symbol);
  const sessions = sym ? sessionsBySymbol?.get(sym) : null;
  const sessionsResult = isOpenBySessions(serverDate, sessions, cfg?.tz);

  if (sessionsResult === true) return { isOpen: true, reason: "sessions" };
  if (sessionsResult === false) return { isOpen: false, reason: "sessions" };

  // ✅ NOVO: weekly_schedule se habilitado
  const weeklyResult = isOpenByWeeklySchedule(serverDate, cfg);
  if (weeklyResult === true) return { isOpen: true, reason: "weekly" };
  if (weeklyResult === false) return { isOpen: false, reason: "weekly" };

  // ✅ fallback: agenda legacy do market_configs
  const ok = isOpenBySchedule(serverDate, cfg);
  return { isOpen: ok, reason: cfg.schedule_enabled ? "schedule" : "auto" };
}

export function MarketConfigProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState(() => new Map()); // symbol -> cfg

  // ✅ sessões por símbolo (opcional; só se tabela existir)
  const [sessionsBySymbol, setSessionsBySymbol] = useState(() => new Map()); // symbol -> sessions[]

  const [serverOffsetMs, setServerOffsetMs] = useState(0);

  const rtRef = useRef(null);
  const rtSessionsRef = useRef(null);
  const tickRef = useRef(null);
  const serverSyncIntervalRef = useRef(null);

  // ✅ fallback polling (se realtime falhar/atrasar)
  const pollRef = useRef(null);
  const lastRtAtRef = useRef(0);

  const lastServerSyncRef = useRef(0);

  const loadConfigs = useCallback(async () => {
    const { data, error } = await supabase.from("market_configs").select("*");
    if (error) throw error;

    const map = new Map();
    (data || []).forEach((r) => {
      const sym = normalizeSymbol(r.symbol);
      if (!sym) return;
      map.set(sym, r);
    });
    setConfigs(map);
  }, []);

  // ✅ tenta carregar market_sessions (se não existir, segue a vida)
  const loadSessions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("market_sessions")
        .select("*");

      if (error) {
        // tabela pode não existir ainda, ou RLS pode bloquear
        return;
      }

      const map = new Map();
      (data || []).forEach((row) => {
        const sym = normalizeSymbol(row?.symbol);
        if (!sym) return;
        const prev = map.get(sym) || [];
        prev.push(row);
        map.set(sym, prev);
      });

      // ordena por dia / hora para previsibilidade
      map.forEach((arr, sym) => {
        arr.sort((a, b) => {
          const da = Number(a?.day_of_week ?? 0);
          const db = Number(b?.day_of_week ?? 0);
          if (da !== db) return da - db;
          const oa = parseTimeToMinutes(a?.open_time) ?? 0;
          const ob = parseTimeToMinutes(b?.open_time) ?? 0;
          return oa - ob;
        });
        map.set(sym, arr);
      });

      setSessionsBySymbol(map);
    } catch {
      // silêncio total
    }
  }, []);

  const syncServerTime = useCallback(async () => {
    // evita spam
    const now = Date.now();
    if (now - lastServerSyncRef.current < 30_000) return;
    lastServerSyncRef.current = now;

    try {
      const { data, error } = await supabase.rpc("get_server_time");
      if (error) throw error;

      const serverNowMs = new Date(data).getTime();
      const localNowMs = Date.now();
      if (Number.isFinite(serverNowMs)) {
        setServerOffsetMs(serverNowMs - localNowMs);
      }
    } catch (e) {
      // ✅ não quebra o app por causa do relógio
      console.warn("[MarketConfig] syncServerTime error:", e?.message || e);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        await syncServerTime();
        await loadConfigs();
        await loadSessions();
      } catch (e) {
        console.warn("[MarketConfig] init error:", e?.message || e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loadConfigs, loadSessions, syncServerTime]);

  // ✅ resync periódico do relógio do servidor (profissional)
  useEffect(() => {
    if (serverSyncIntervalRef.current) clearInterval(serverSyncIntervalRef.current);

    // 60s é suficiente (e você ainda tem o anti-spam de 30s)
    serverSyncIntervalRef.current = setInterval(() => {
      syncServerTime();
    }, 60_000);

    const onFocus = () => syncServerTime();
    window.addEventListener("focus", onFocus);

    return () => {
      if (serverSyncIntervalRef.current) clearInterval(serverSyncIntervalRef.current);
      serverSyncIntervalRef.current = null;
      window.removeEventListener("focus", onFocus);
    };
  }, [syncServerTime]);

  // ✅ Realtime market_configs
  useEffect(() => {
    if (rtRef.current) {
      supabase.removeChannel(rtRef.current);
      rtRef.current = null;
    }

    const ch = supabase
      .channel("market-configs-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "market_configs" }, async (payload) => {
        lastRtAtRef.current = Date.now();

        const type = payload?.eventType;
        const newRow = payload?.new || null;
        const oldRow = payload?.old || null;

        setConfigs((prev) => {
          const next = new Map(prev);

          if (type === "DELETE") {
            const sym = normalizeSymbol(oldRow?.symbol);
            if (sym) next.delete(sym);
            return next;
          }

          const sym = normalizeSymbol(newRow?.symbol);
          if (sym) next.set(sym, newRow);

          return next;
        });

        syncServerTime();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          lastRtAtRef.current = Date.now();
        }
      });

    rtRef.current = ch;

    return () => {
      if (rtRef.current) {
        supabase.removeChannel(rtRef.current);
        rtRef.current = null;
      }
    };
  }, [syncServerTime]);

  // ✅ Realtime market_sessions (opcional; se tabela existir)
  useEffect(() => {
    if (rtSessionsRef.current) {
      supabase.removeChannel(rtSessionsRef.current);
      rtSessionsRef.current = null;
    }

    // tenta subscribar; se tabela não existir, o supabase simplesmente não entrega eventos
    const ch = supabase
      .channel("market-sessions-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "market_sessions" }, async () => {
        // mais simples e robusto: refetch
        try { await loadSessions(); } catch {}
        syncServerTime();
      })
      .subscribe();

    rtSessionsRef.current = ch;

    return () => {
      if (rtSessionsRef.current) {
        supabase.removeChannel(rtSessionsRef.current);
        rtSessionsRef.current = null;
      }
    };
  }, [loadSessions, syncServerTime]);

  // ✅ Fallback polling: se ficar sem evento realtime, recarrega configs automaticamente
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      const now = Date.now();
      const last = Number(lastRtAtRef.current || 0);

      // 15s sem evento realtime => refetch
      if (!last || now - last > 15_000) {
        try {
          await loadConfigs();
          await loadSessions();
        } catch {}
      }
    }, 5_000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [loadConfigs, loadSessions]);

  // ✅ Ticker: “vira” aberto/fechado sem refresh
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setTick((x) => (x + 1) % 1_000_000), 2000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, []);

  const serverNow = useMemo(() => new Date(Date.now() + serverOffsetMs), [serverOffsetMs, tick]);

  const getConfig = useCallback(
    (symbol) => configs.get(normalizeSymbol(symbol)) || null,
    [configs]
  );

  // ✅ payout em % (inteiro) — mantém assinatura atual
  const getPayoutPct = useCallback(
    (symbol, fallbackPct = 92) => {
      const cfg = getConfig(symbol);
      if (!cfg) return fallbackPct;
      const p = safeNum(cfg.payout, fallbackPct / 100);
      return Math.round(clamp(p, 0, 1) * 100);
    },
    [getConfig]
  );

  // ✅ payout em 0..1 (para painel de trade e engine)
  const getPayoutRate = useCallback(
    (symbol, fallbackRate = 0.92) => {
      const cfg = getConfig(symbol);
      const p = cfg ? Number(cfg?.payout) : NaN;
      if (Number.isFinite(p)) return clamp(p, 0, 1);

      const fb = Number(fallbackRate);
      if (Number.isFinite(fb)) return clamp(fb, 0, 1);
      return 0.7;
    },
    [getConfig]
  );

  const getOpenState = useCallback(
    (symbol) => {
      const cfg = getConfig(symbol);
      return computeTradable(serverNow, cfg, sessionsBySymbol);
    },
    [getConfig, serverNow, sessionsBySymbol]
  );

  const getSessions = useCallback(
    (symbol) => sessionsBySymbol.get(normalizeSymbol(symbol)) || [],
    [sessionsBySymbol]
  );

  const value = useMemo(
    () => ({
      loading,
      serverNow,
      serverOffsetMs,
      configs,
      sessionsBySymbol,

      getConfig,
      getPayoutPct,
      getPayoutRate,
      getOpenState,
      getSessions,

      reload: async () => {
        await syncServerTime();
        await loadConfigs();
        await loadSessions();
      },
    }),
    [
      loading,
      serverNow,
      serverOffsetMs,
      configs,
      sessionsBySymbol,
      getConfig,
      getPayoutPct,
      getPayoutRate,
      getOpenState,
      getSessions,
      syncServerTime,
      loadConfigs,
      loadSessions,
    ]
  );

  return <MarketConfigContext.Provider value={value}>{children}</MarketConfigContext.Provider>;
}

export function useMarketConfigs() {
  const ctx = useContext(MarketConfigContext);
  if (!ctx) throw new Error("useMarketConfigs must be used inside MarketConfigProvider");
  return ctx;
}