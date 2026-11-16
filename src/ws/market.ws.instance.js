import MarketWSManager from "./marketwsmanager";

let wsManager = null;
let bound = false;

const PRIMARY_WS = import.meta.env.VITE_MARKET_WS_URL;

function createManager(url) {
  console.log(
    "[WS_INSTANCE] Criando MarketWSManager:",
    url
  );

  return new MarketWSManager({
    url,
    onMarketEvent: null,
  });
}

export async function getMarketWSManager({ url } = {}) {
  if (wsManager) return wsManager;

  const finalUrl = url || PRIMARY_WS;

  if (!finalUrl) {
    throw new Error(
      "VITE_MARKET_WS_URL não configurada."
    );
  }

  wsManager = createManager(finalUrl);
  wsManager.connect();

  return wsManager;
}

export async function bindMarketWSManagerToStore(updateFn) {
  const mgr = await getMarketWSManager({});

  if (typeof updateFn !== "function") {
    console.warn(
      "[WS_INSTANCE] updateFn inválido."
    );
    return mgr;
  }

  if (!bound) {
    console.log(
      "[WS_INSTANCE] Bind ao Store realizado."
    );
    bound = true;
  }

  mgr.setCallback((event) => {
    try {
      updateFn(event);
    } catch (e) {
      console.error(
        "[WS_INSTANCE] Erro ao encaminhar evento:",
        e
      );
    }
  });

  return mgr;
}

export function destroyMarketWSManager() {
  if (wsManager) {
    console.warn(
      "[WS_INSTANCE] Destruindo conexão."
    );

    try {
      wsManager.disconnect();
    } catch {}

    wsManager = null;
    bound = false;
  }
}
