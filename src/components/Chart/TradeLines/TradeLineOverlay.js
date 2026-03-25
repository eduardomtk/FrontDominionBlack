import { useMarketStore } from "@/stores/market.store";
import styles from "./tradeLines.module.css";

const overlays = new Map();

function format(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function getNowMsSoberano() {
  try {
    const getServerNowMs = useMarketStore.getState?.()?.getServerNowMs;
    const now = Number(getServerNowMs?.());
    if (Number.isFinite(now) && now > 0) return now;
  } catch {}
  return Date.now();
}

function pickMsExpiresAt(trade) {
  const a = Number(trade?.expiresAt);
  if (Number.isFinite(a)) return a;

  const b = Number(trade?.expirationTime);
  if (Number.isFinite(b)) return b;

  return null;
}

export function mount({ trade, container, series }) {
  const id = String(trade?.id ?? trade?.tradeId ?? "");
  if (!id || !container || !series || overlays.has(id)) return;

  const openPrice = Number(trade?.openPrice);
  if (!Number.isFinite(openPrice)) {
    console.warn("[TradeLineOverlay] openPrice inválido:", trade);
    return;
  }

  const direction = String(trade?.direction || "CALL").toUpperCase();
  const color = direction === "CALL" ? "#00c176" : "#ff4d4f";

  const el = document.createElement("div");
  el.className = styles.tradeLabel;

  el.innerHTML = `
    <div class="${styles.content}" style="--bg-color: ${color}">
      <div class="${styles.amount}">$${Number(trade?.amount || 0).toFixed(0)}</div>
      <div class="${styles.timer}">
        <span class="${styles.time}">--:--</span>
      </div>
    </div>
  `;

  container.appendChild(el);

  const isAxisOverlay =
    container?.getAttribute?.("data-trade-axis-overlay") === "true";

  const timeEl = el.querySelector(`.${styles.time}`);
  let destroyed = false;

  const updatePosition = () => {
    if (destroyed) return;

    const y = series.priceToCoordinate(openPrice);
    if (y !== null && Number.isFinite(y)) {
      if (isAxisOverlay) {
        el.style.left = "0px";
        el.style.right = "auto";
        el.style.transform = `translateX(calc(-100%)) translateY(${y}px) translateY(-50%)`;
      } else {
        el.style.transform = `translateY(${y}px) translateY(-50%)`;
      }
      el.style.display = "block";
    } else {
      el.style.display = "none";
    }

    requestAnimationFrame(updatePosition);
  };

  // ✅ TIMER PROFISSIONAL: alinhado ao próximo “tick” exato de segundo
  let tickTimeout = null;
  let tickInterval = null;

  const setTimeText = (expiresAtMs) => {
    if (!timeEl) return;

    // ✅ trava em 00:00, mas NÃO remove o label.
    // Quem remove é o TradeLinesManager quando o trade sai de activeTrades.
    const remaining = Math.max(0, Math.ceil((expiresAtMs - getNowMsSoberano()) / 1000));
    timeEl.textContent = format(remaining);
  };

  const startAlignedCountdown = () => {
    const expiresAt = pickMsExpiresAt(trade);

    if (!Number.isFinite(expiresAt)) {
      if (timeEl) timeEl.textContent = "--:--";
      return;
    }

    // atualiza imediatamente (sem esperar 1s)
    setTimeText(expiresAt);

    // alinha para o próximo boundary do segundo
    const now = getNowMsSoberano();
    const msToNextSecond = 1000 - (now % 1000);

    tickTimeout = setTimeout(() => {
      if (destroyed) return;

      setTimeText(expiresAt);

      // depois do alinhamento, roda a cada 1000ms estável
      tickInterval = setInterval(() => {
        if (destroyed) return;
        setTimeText(expiresAt);
      }, 1000);
    }, msToNextSecond);
  };

  startAlignedCountdown();

  overlays.set(id, {
    el,
    destroy: () => (destroyed = true),
    cleanup: () => {
      if (tickTimeout) clearTimeout(tickTimeout);
      if (tickInterval) clearInterval(tickInterval);
      tickTimeout = null;
      tickInterval = null;
    },
  });

  requestAnimationFrame(updatePosition);
}

export function unmount(id) {
  const key = String(id || "");
  const overlay = overlays.get(key);
  if (!overlay) return;

  overlay.destroy();
  try {
    overlay.cleanup?.();
  } catch {}

  overlay.el.remove();
  overlays.delete(key);
}

export default { mount, unmount };
