// src/context/CandleContext.jsx
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { usePairUI } from "./PairUIContext";
import { useMarketStore } from "@/stores/market.store";
import CandleEngine from "../engine/CandleEngine";
import { useTrade } from "./TradeContext";

const CandleContext = createContext(null);

function tfToSec(tf) {
  return {
    M1: 60,
    M5: 300,
    M15: 900,
    M30: 1800,
    H1: 3600,
  }[String(tf || "").toUpperCase().trim()] || null;
}

function normalizePair(pair) {
  return String(pair || "").replace("/", "").toUpperCase().trim();
}

function normalizeTf(tf) {
  const s = String(tf || "").toUpperCase().trim();
  if (s === "M1" || s === "M5" || s === "M15" || s === "M30" || s === "H1") return s;
  return "M1";
}

export function CandleEngineProvider({ children }) {
  const { symbol, timeframe } = usePairUI();

  const enginesRef = useRef(new Map()); // pairKey -> engine
  const [currentKey, setCurrentKey] = useState("");

  // ✅ força re-render quando uma engine é criada/recriada
  const [engineVersion, setEngineVersion] = useState(0);

  const symbolKey = useMemo(() => normalizePair(symbol), [symbol]);
  const tfKey = useMemo(() => normalizeTf(timeframe), [timeframe]);

  const currentPairKey = useMemo(() => {
    if (!symbolKey || !tfKey) return "";
    return `${symbolKey}|${tfKey}`;
  }, [symbolKey, tfKey]);

  const activePairKeys = useMemo(() => {
    const set = new Set();
    if (currentPairKey) set.add(currentPairKey);
    return set;
  }, [currentPairKey]);

  // ============================================================
  // ✅ Anti-rollback shield (por pairKey)
  // - baseReady=false => aceita primeiro history SEM BLOQUEAR
  // - bloqueia apenas history stale: historyLT < engineLastTime
  // - dedup leve por assinatura (len:ft:lt) quando baseReady=true
  // ============================================================
  const guardsRef = useRef(new Map()); // pairKey -> { baseReady, lastSig, lastLt }

  const getGuard = useCallback((pairKey) => {
    const k = String(pairKey || "");
    let g = guardsRef.current.get(k);
    if (!g) {
      g = { baseReady: false, lastSig: "", lastLt: 0 };
      guardsRef.current.set(k, g);
    }
    return g;
  }, []);

  const resetGuard = useCallback((pairKey) => {
    const k = String(pairKey || "");
    guardsRef.current.set(k, { baseReady: false, lastSig: "", lastLt: 0 });
  }, []);

  const deleteGuard = useCallback((pairKey) => {
    const k = String(pairKey || "");
    guardsRef.current.delete(k);
  }, []);

  const calcHistoryMeta = useCallback((eng, candles) => {
    if (!eng || !Array.isArray(candles) || candles.length === 0) return null;

    const len = candles.length;
    let ft = Infinity;
    let lt = -Infinity;

    for (let i = 0; i < len; i++) {
      const c = candles[i];
      const tRaw = c?.time ?? c?.t;
      const sec = eng._parseTime(tRaw);
      const bucket = eng._bucketTime(sec);
      if (!Number.isFinite(bucket)) continue;

      if (bucket < ft) ft = bucket;
      if (bucket > lt) lt = bucket;
    }

    if (!Number.isFinite(ft) || !Number.isFinite(lt)) return null;

    const tail = candles.slice(Math.max(0, candles.length - 6));
    const tailSig = tail
      .map((c) => {
        const tRaw = c?.time ?? c?.t;
        const sec = eng._parseTime(tRaw);
        const bucket = eng._bucketTime(sec);
        const open = Number(c?.open ?? c?.o);
        const high = Number(c?.high ?? c?.h);
        const low = Number(c?.low ?? c?.l);
        const close = Number(c?.close ?? c?.c);
        return [bucket, open, high, low, close]
          .map((v) => (Number.isFinite(v) ? String(v) : "x"))
          .join(",");
      })
      .join("|");

    return {
      len,
      ft,
      lt,
      sig: `${len}:${ft}:${lt}:${tailSig}`,
    };
  }, []);

  const applySnapshotToEngine = useCallback(
    (pairKey, pairData) => {
      const k = String(pairKey || "");
      const eng = enginesRef.current.get(k);
      if (!eng || !pairData) return;

      const guard = getGuard(k);

      // ---------------------------
      // 1) HISTORY (com shield certo)
      // ---------------------------
      const history = pairData.candles;
      if (Array.isArray(history) && history.length) {
        const meta = calcHistoryMeta(eng, history);

        if (meta) {
          const engineEmpty = typeof eng.isEmpty === "function"
            ? eng.isEmpty()
            : ((Array.isArray(eng.candles) ? eng.candles.length : 0) === 0 && !eng.liveCandle);

          const engineLastClosedTime = typeof eng.getLastClosedTime === "function"
            ? Number(eng.getLastClosedTime()) || 0
            : (Array.isArray(eng.candles) && eng.candles.length
                ? Number(eng.candles[eng.candles.length - 1]?.time) || 0
                : 0);

          // ✅ Primeira carga / engine vazia => NUNCA bloqueia history
          const allowInitHistory = engineEmpty || !guard.baseReady;

          // ✅ FIX CRÍTICO:
          // history fechado legítimo pode ficar 1 bucket atrás da live atual.
          // Se compararmos contra getLastTime() (que inclui live), vamos bloquear
          // exatamente a correção soberana do candle recém-fechado após a virada.
          // O rollback stale real deve ser comparado apenas contra o ÚLTIMO FECHADO.
          const isStaleRollback =
            !allowInitHistory && engineLastClosedTime > 0 && meta.lt < engineLastClosedTime;

          const isDuplicate =
            !allowInitHistory && guard.lastSig && meta.sig === guard.lastSig;

          if (!isStaleRollback && !isDuplicate) {
            const applied = eng.onHistory(history);
            if (applied !== false) {
              guard.baseReady = true;
              guard.lastSig = meta.sig;
              guard.lastLt = meta.lt;
            }
          }
        } else {
          // meta inválida: aplica sem shield (preferível a bloquear)
          const applied = eng.onHistory(history);
          if (applied !== false) {
            guard.baseReady = true;
            guard.lastSig = "";
            guard.lastLt = 0;
          }
        }
      }

      // ---------------------------
      // 2) LIVE / TICK (sempre)
      // ---------------------------
      if (pairData.liveCandle) {
        eng.onCandleUpdate(pairData.liveCandle);
      }
      if (pairData.lastTick) {
        eng.onTick(pairData.lastTick);
      }
    },
    [calcHistoryMeta, getGuard]
  );

  // ✅ hidrata engine imediatamente usando snapshot do store (sem esperar subscribe)
  const hydrateEngineByKey = useCallback(
    (pairKey) => {
      const k = String(pairKey || "");
      const eng = enginesRef.current.get(k);
      if (!eng) return;

      const st = useMarketStore.getState();
      const pairData = st.pairs?.[k];
      if (!pairData) return;

      try {
        applySnapshotToEngine(k, pairData);
      } catch {}
    },
    [applySnapshotToEngine]
  );

  const ensureEngine = useCallback(
    (pairKey) => {
      const normalizedKey = String(pairKey || "");
      const existing = enginesRef.current.get(normalizedKey);
      if (existing) return existing;

      const [s, tf] = normalizedKey.split("|");
      const sym = normalizePair(s);
      const tfNorm = normalizeTf(tf);
      const timeframeSec = tfToSec(tfNorm);

      if (!sym || !timeframeSec) return null;

      const key = `${sym}|${tfNorm}`;

      // ✅ engine nova => reseta guard (primeiro history não pode ser bloqueado)
      resetGuard(key);

      const engine = new CandleEngine({ symbol: sym, timeframeSec });
      enginesRef.current.set(key, engine);

      hydrateEngineByKey(key);

      setEngineVersion((v) => v + 1);
      return engine;
    },
    [hydrateEngineByKey, resetGuard]
  );

  // mantém currentKey do chart
  useEffect(() => {
    if (currentPairKey) setCurrentKey(currentPairKey);
  }, [currentPairKey]);

  // =========================================
  // cria/limpa engines conforme activePairKeys
  // =========================================
  useEffect(() => {
    activePairKeys.forEach((k) => {
      ensureEngine(k);
      hydrateEngineByKey(k);
    });

    for (const [k, eng] of enginesRef.current.entries()) {
      if (!activePairKeys.has(k)) {
        try {
          eng.destroy();
        } catch {}
        enginesRef.current.delete(k);

        // ✅ remove guard para não acumular
        deleteGuard(k);

        setEngineVersion((v) => v + 1);
      }
    }
  }, [activePairKeys, ensureEngine, hydrateEngineByKey, deleteGuard]);

  // ✅ SWAP QUENTE do chart:
  // garante a engine do par atual, mas NÃO destrói/recria o par do chart.
  // Assim o MainChart pode trocar dataset sem "apagar" o gráfico.
  useEffect(() => {
    if (!currentKey) return;

    ensureEngine(currentKey);
    hydrateEngineByKey(currentKey);
    setEngineVersion((v) => v + 1);
  }, [currentKey, ensureEngine, hydrateEngineByKey]);

  // =========================================
  // pump store -> engines (updates contínuos)
  // =========================================
  useEffect(() => {
    const applyKey = (pairKey) => {
      const st = useMarketStore.getState();
      const pairData = st.pairs?.[pairKey];
      if (!pairData) return;

      applySnapshotToEngine(pairKey, pairData);
    };

    for (const k of enginesRef.current.keys()) applyKey(k);

    const unsub = useMarketStore.subscribe(() => {
      for (const k of enginesRef.current.keys()) applyKey(k);
    });

    return () => {
      try {
        unsub?.();
      } catch {}
    };
  }, [applySnapshotToEngine]);

  const currentEngine = useMemo(() => {
    if (!currentKey) return null;
    return enginesRef.current.get(currentKey) || null;
  }, [currentKey, engineVersion]);

  const ctxValue = useMemo(
    () => ({
      currentEngine,
      enginesRef,
      ensureEngineByKey: ensureEngine,
    }),
    [currentEngine, ensureEngine]
  );

  return <CandleContext.Provider value={ctxValue}>{children}</CandleContext.Provider>;
}

export function useCandleEngine() {
  const ctx = useContext(CandleContext);
  return ctx?.currentEngine || null;
}

export function useCandleRegistry() {
  const ctx = useContext(CandleContext);

  const getEngineByKey = (pairKey) => ctx?.enginesRef?.current?.get(pairKey) || null;
  const ensureEngineByKey = (pairKey) => ctx?.ensureEngineByKey?.(pairKey) || null;

  return { getEngineByKey, ensureEngineByKey };
}