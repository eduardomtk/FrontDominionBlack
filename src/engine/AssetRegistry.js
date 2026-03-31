import { usePayoutStore } from "../stores/payout.store";

/**
 * AssetRegistry
 * Fonte única da verdade dos ativos
 */

export const ASSET_TYPES = Object.freeze({
  FOREX: "forex",
  CRYPTO: "crypto",
  OTC: "otc",
  INDICES: "indices",
});

const RAW_ASSETS = [
  {
    symbol: "EURUSD",
    name: "EUR / USD",
    type: ASSET_TYPES.FOREX,
    payout: 0.82,
    enabled: true,
  },
  {
    symbol: "GBPUSD",
    name: "GBP / USD",
    type: ASSET_TYPES.FOREX,
    payout: 0.8,
    enabled: true,
  },
  {
    symbol: "USDJPY",
    name: "USD / JPY",
    type: ASSET_TYPES.FOREX,
    payout: 0.78,
    enabled: true,
  },
];

function normalizeAsset(asset) {
  return Object.freeze({
    symbol: asset.symbol,
    name: asset.name,
    type: asset.type,
    payout:
      typeof asset.payout === "number" &&
      asset.payout > 0 &&
      asset.payout < 1
        ? asset.payout
        : 0.7,
    enabled: Boolean(asset.enabled),
  });
}

const ASSET_MAP = Object.freeze(
  RAW_ASSETS.reduce((acc, asset) => {
    const a = normalizeAsset(asset);
    acc[a.symbol] = a;
    return acc;
  }, {})
);

export function getEnabledAssets() {
  return Object.values(ASSET_MAP).filter(a => a.enabled);
}

export function getAssetBySymbol(symbol) {
  return ASSET_MAP[symbol] ?? null;
}

/**
 * Payout final:
 * 1️⃣ dinâmico (store)
 * 2️⃣ estático (registry)
 * 3️⃣ fallback seguro
 */
export function getPayoutBySymbol(symbol) {
  const dynamic = usePayoutStore.getState().payouts[symbol];
  if (typeof dynamic === "number") return dynamic;

  return ASSET_MAP[symbol]?.payout ?? 0.7;
}
