import MarketWSManager from "./marketwsmanager";

let wsManager = null;
let bound = false;

export function getMarketWSManager({ url } = {}) {
  if (!wsManager) {
    const isLocal =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1");

    const finalUrl = url || (isLocal
      ? "ws://localhost:9002"
      : "wss://ws.dominionblack.com");

    console.log("🚀 [WS_INSTANCE] Criando instância única do MarketWSManager...", finalUrl);

    wsManager = new MarketWSManager({
      url: finalUrl,
      onMarketEvent: null,
    });

    wsManager.connect();
  }

  return wsManager;
}

export function bindMarketWSManagerToStore(updateFn) {
  const mgr = getMarketWSManager({});

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