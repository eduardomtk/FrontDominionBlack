// src/chart/panes/paneTypes.js

export const PANE_PLACEMENT = {
  OVERLAY: "overlay",
  PANE: "pane",
};

export const PANE_TYPES = {
  RSI: "rsi",
  MACD: "macd",
  STOCH: "stoch", // (se você decidir separar STOCH em pane próprio no futuro)
  VOLUME: "volume",

  // ✅ novos panes (seguem o mesmo padrão soberano)
  ATR: "atr",
  ADX: "adx",
  CCI: "cci",
  WILLIAMSR: "williamsr",
  MOMENTUM: "momentum",
  ROC: "roc",
};

export const VALID_PANE_TYPES = new Set(Object.values(PANE_TYPES));

export function isPaneType(type) {
  return typeof type === "string" && VALID_PANE_TYPES.has(type);
}

export function makePaneId(type) {
  return `pane:${type}`;
}

/**
 * ✅ Baseline global (usado apenas se um tipo não tiver config específica)
 * Mantido “baixo” por padrão.
 */
export const DEFAULT_PANE_CONFIG = {
  height: 100,
  minHeight: 56,
  maxHeight: 320,
};

/**
 * ✅ Defaults soberanos por tipo (estilo corretora: panes baixos)
 * Esses valores controlam:
 * - altura inicial
 * - minHeight/maxHeight
 * - e, principalmente, “clamp” quando panes antigos vierem do storage.
 */
export const DEFAULT_PANE_CONFIG_BY_TYPE = {
  [PANE_TYPES.RSI]: {
    height: 95,
    minHeight: 56,
    maxHeight: 220,
  },
  [PANE_TYPES.MACD]: {
    height: 95,
    minHeight: 56,
    maxHeight: 260,
  },
  [PANE_TYPES.VOLUME]: {
    height: 80,
    minHeight: 48,
    maxHeight: 200,
  },

  // fallback (caso você crie novos panes no futuro)
  [PANE_TYPES.STOCH]: {
    height: 95,
    minHeight: 56,
    maxHeight: 220,
  },

  // ==========================
  // ✅ novos panes (baixos)
  // ==========================
  [PANE_TYPES.ATR]: {
    height: 85,
    minHeight: 56,
    maxHeight: 220,
  },
  [PANE_TYPES.ADX]: {
    height: 95,
    minHeight: 56,
    maxHeight: 240,
  },
  [PANE_TYPES.CCI]: {
    height: 85,
    minHeight: 56,
    maxHeight: 220,
  },
  [PANE_TYPES.WILLIAMSR]: {
    height: 85,
    minHeight: 56,
    maxHeight: 220,
  },
  [PANE_TYPES.MOMENTUM]: {
    height: 85,
    minHeight: 56,
    maxHeight: 220,
  },
  [PANE_TYPES.ROC]: {
    height: 85,
    minHeight: 56,
    maxHeight: 220,
  },
};
