import MarketWSManager from "./marketwsmanager";

let wsManager = null;
let bound = false;

const PRIMARY_WS =
  import.meta.env.VITE_MARKET_WS_URL ||
  "wss://ws.dominionblack.com";

const FALLBACK_WS =
  import.meta.env.VITE_MARKET_WS_FALLBACK_URL ||
  "wss://ws-local.dominionblack.com";

function createManager(url) {
  console.log("🚀 [WS_INSTANCE] Criando instância única do MarketWSManager...", url);

  const manager = new MarketWSManager({
    url,
    onMarketEvent: null,
  });

  return manager;
}

async function probeWebSocket(url, timeout = 2500) {
  return new Promise((resolve) => {
    let settled = false;

    try {
      const ws = new WebSocket(url);

      const finish = (result) => {
        if (settled) return;

        settled = true;

        try {
          ws.close();
        } catch {}

        resolve(result);
      };

      const timer = setTimeout(() => {
        finish(false);
      }, timeout);

      ws.onopen = () => {
        clearTimeout(timer);
        finish(true);
      };

      ws.onerror = () => {
        clearTimeout(timer);
        finish(false);
      };

      ws.onclose = () => {
        clearTimeout(timer);

        if (!settled) {
          finish(false);
        }
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
      console.log("🧪 [WS_INSTANCE] Testando VPS principal...");

      const primaryAlive = await probeWebSocket(PRIMARY_WS, 2200);

      console.log("🧪 [WS_INSTANCE] PRIMARY WS RESULT:", primaryAlive);

      if (primaryAlive) {
        console.log("✅ [WS_INSTANCE] VPS ONLINE.");
        finalUrl = PRIMARY_WS;
      } else {
        console.warn("⚠️ [WS_INSTANCE] VPS OFFLINE. Ativando fallback local.");

        const fallbackAlive = await probeWebSocket(FALLBACK_WS, 3500);

        console.log("🧪 [WS_INSTANCE] FALLBACK WS RESULT:", fallbackAlive);

        if (fallbackAlive) {
          console.log("✅ [WS_INSTANCE] FALLBACK LOCAL ONLINE.");
          finalUrl = FALLBACK_WS;
        } else {
          console.error("❌ [WS_INSTANCE] Nenhum WS disponível.");
          finalUrl = FALLBACK_WS;
        }
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
    console.warn("⚠️ [WS_INSTANCE] bindMarketWSManagerToStore ignorado: updateFn inválido.");
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
    console.warn("🧨 [WS_INSTANCE] Destruindo conexão e limpando manager.");

    try {
      wsManager.disconnect();
    } catch {}

    wsManager = null;
    bound = false;
  }
}