import { useMemo, useRef } from "react";
import { useTrade } from "../../../../context/TradeContext";
import { useAccount } from "../../../../context/AccountContext";
import { usePairUI } from "../../../../context/PairUIContext";
import { useMarketStore } from "../../../../stores/market.store";
import styles from "./BottomLeftPanel.module.css";

const EXPIRATION_SECONDS = {
  M1: 60,
  M5: 300,
  M15: 900,
};

// ✅ Regra: enquanto ainda mostra 31s fica na vela atual; no primeiro 30.xxx vai para a próxima
const MIN_LEAD_SECONDS = 30;

function normalizePair(pair) {
  return String(pair || "").replace("/", "").toUpperCase().trim();
}

function normalizeTf(tf) {
  const s = String(tf || "").trim().toUpperCase();
  if (s === "M1" || s === "M5" || s === "M15" || s === "M30" || s === "H1") return s;
  return "M1";
}

function toMsMaybe(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n > 1e11 ? n : n * 1000;
}

function calcAlignedExpiryMs(nowMs, tfSec, minLeadSec = MIN_LEAD_SECONDS) {
  const t = Number(nowMs);
  const tf = Number(tfSec);

  if (!Number.isFinite(t) || !Number.isFinite(tf) || tf <= 0) {
    return Date.now() + 60_000;
  }

  const tfMs = tf * 1000;
  const bucketStartMs = Math.floor(t / tfMs) * tfMs;
  let closeMs = bucketStartMs + tfMs;

  const remainingMs = closeMs - t;
  const remainingWholeSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  if (remainingWholeSeconds <= minLeadSec) closeMs += tfMs;

  return closeMs;
}

export default function BottomLeftPanel() {
  const { openTrade, activeTrades, maxTrades } = useTrade();
  const { accountType } = useAccount();
  const { symbol: uiSymbol, timeframe: chartTf } = usePairUI();

  const symbol = normalizePair(uiSymbol);
  const tf = normalizeTf(chartTf);

  // Trava anti double-click (mínima)
  const clickLockRef = useRef(false);

  // ✅ Anti “múltiplos por bug”: não deixa disparar duas vezes no mesmo segundo
  const lastFireSecRef = useRef(0);

  const pairData = useMarketStore((state) => {
    const key = symbol && tf ? `${symbol}|${tf}` : "";
    return key ? state.pairs[key] : null;
  });

  // Preço soberano (mesma lógica do RightTradePanel)
  const lastPrice = useMemo(() => {
    const tick = pairData?.lastTick?.bid;
    if (Number.isFinite(Number(tick))) return Number(tick);

    const live = pairData?.liveCandle?.close;
    if (Number.isFinite(Number(live))) return Number(live);

    const candles = pairData?.candles;
    if (Array.isArray(candles) && candles.length) {
      const last = candles[candles.length - 1];
      const close = last?.close;
      if (Number.isFinite(Number(close))) return Number(close);
    }

    return null;
  }, [pairData]);

  // Payout simples (mantém consistente com o RightTradePanel)
  const payout = useMemo(() => {
    const payoutMap = {
      EURUSD: 0.82,
      GBPUSD: 0.8,
      USDJPY: 0.78,
    };
    return payoutMap[symbol] || 0.7;
  }, [symbol]);

  const getServerNowMs = useMarketStore((state) => state.getServerNowMs);

  function getNowMsSoberano() {
    try {
      const now = Number(getServerNowMs?.());
      if (Number.isFinite(now) && now > 0) return now;
    } catch {}

    const lt = pairData?.lastTick;

    const s1 = toMsMaybe(lt?.serverTime);
    if (Number.isFinite(s1)) return s1;

    const s2 = toMsMaybe(lt?.time ?? lt?.t);
    if (Number.isFinite(s2)) return s2;

    return Date.now();
  }

  function fire(direction) {
    // 🔒 evita clique duplo abrindo duas operações
    if (clickLockRef.current) return;
    clickLockRef.current = true;
    setTimeout(() => {
      clickLockRef.current = false;
    }, 220);

    // ✅ respeita limite de trades simultâneos
    if (activeTrades?.length >= maxTrades) {
      console.warn("Número máximo de trades ativos atingido");
      return;
    }

    if (!lastPrice) {
      console.warn("Preço atual indisponível");
      return;
    }

    const nowMs = getNowMsSoberano();

    // ✅ trava “múltiplos por bug” no mesmo segundo
    const nowWholeSec = Math.floor(nowMs / 1000);
    if (lastFireSecRef.current === nowWholeSec) return;
    lastFireSecRef.current = nowWholeSec;

    // ✅ BottomLeft é atalho: expiração padrão M1, mas alinhada ao fechamento
    const tfSec = EXPIRATION_SECONDS.M1;
    const expirationTime = calcAlignedExpiryMs(nowMs, tfSec, MIN_LEAD_SECONDS);

    openTrade({
      direction,
      amount: 100,
      payout,
      expirationTime, // ✅ ms alinhado
      expirationLabel: "M1",
      openPrice: lastPrice,
      account: accountType,
      status: "OPEN",
      symbol,
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });
  }

  return (
    <div className={styles.panel}>
      <button className={styles.call} onClick={() => fire("CALL")}>
        CALL
      </button>

      <button className={styles.put} onClick={() => fire("PUT")}>
        PUT
      </button>
    </div>
  );
}
