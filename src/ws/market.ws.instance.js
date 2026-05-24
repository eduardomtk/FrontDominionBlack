import MarketWSManager from "./marketwsmanager";

let wsManager = null;
let bound = false;

const PRIMARY_WS =
  import.meta.env.VITE_MARKET_WS_URL ||
  "ws://51.83.61.131:9002";

const FALLBACK_WS =
  import.meta.env.VITE_MARKET_WS_FALLBACK_URL ||
  "wss://ws-local.dominionblack.com";

function createManager(url) {
  console.log("🚀 [WS_INSTANCE] Criando MarketWSManager:", url);

  const manager = new MarketWSManager({
    url,
    onMarketEvent: null,
  });

  manager.__wsUrl = url;

  return manager;
}

async function probeWebSocket(url, timeout = 2500) {
  return new Promise((resolve) => {
    let done = false;

    try {
      const ws = new WebSocket(url);

      const finalize = (ok) => {
        if (done) return;
        done = true;

        try {
          ws.close();
        } catch {}

        resolve(ok);
      };

      const timer = setTimeout(() => finalize(false), timeout);

      ws.onopen = () => {
        clearTimeout(timer);
        finalize(true);
      };

      ws.onerror = () => {
        clearTimeout(timer);
        finalize(false);
      };

      ws.onclose = () => {
        clearTimeout(timer);
      };
    } catch {
      resolve(false);
    }
  });
}

export async function getMarketWSManager({ url } = {}) {
  if (wsManager) return wsManager;

  const isLocal =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  let finalUrl = url;

  if (!finalUrl) {
    if (isLocal) {
      finalUrl = "ws://localhost:9002";
    } else {
      console.log("🧠 [WS_INSTANCE] Testando VPS WS...");

      const primaryAlive = await probeWebSocket(PRIMARY_WS, 2200);

      if (primaryAlive) {
        console.log("✅ [WS_INSTANCE] VPS WS ONLINE.");
        finalUrl = PRIMARY_WS;
      } else {
        console.warn("⚠️ [WS_INSTANCE] VPS OFFLINE. Ativando fallback local tunnel.");
        finalUrl = FALLBACK_WS;
      }
    }
  }

  wsManager = createManager(finalUrl);

  wsManager.connect();

  return wsManager;
}

export async function bindMarketWSManagerToStore(updateFn) {
  const mgr = await getMarketWSManager({});

  if (typeof updateFn !== "function") {
    console.warn("⚠️ [WS_INSTANCE] bind ignorado: updateFn inválido.");
    return mgr;
  }

  if (!bound) {
    console.log("🔗 [WS_INSTANCE] Bind do MarketWSManager ao Store realizado.");
    bound = true;
  }

  mgr.setCallback((event) => {
    try {
      updateFn(event);
    } catch (e) {
      console.error("❌ [WS_INSTANCE] Erro ao encaminhar evento ao Store:", e);
    }
  });

  return mgr;
}

export function destroyMarketWSManager() {
  if (wsManager) {
    console.warn("🧨 [WS_INSTANCE] Destruindo conexão WS.");

    try {
      wsManager.disconnect();
    } catch {}

    wsManager = null;
    bound = false;
  }
}