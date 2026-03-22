// src/indicators/indicatorRegistry.js
import i18n from "@/i18n/i18n";

const LS_KEY = "valyron.userScripts.v1";

function safeJsonParse(str, fallback) {
  try {
    const v = JSON.parse(str);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function loadUserScripts() {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(LS_KEY);
  const list = safeJsonParse(raw, []);
  if (!Array.isArray(list)) return [];

  return list
    .filter((x) => x && typeof x === "object")
    .map((x) => ({
      id: String(x.id || ""),
      name: String(x.name || "Script sem nome"),
      code: String(x.code || ""),
      enabled: Boolean(x.enabled),
      createdAt: Number.isFinite(Number(x.createdAt)) ? Number(x.createdAt) : Date.now(),
      updatedAt: Number.isFinite(Number(x.updatedAt)) ? Number(x.updatedAt) : Date.now(),
    }))
    .filter((x) => x.id);
}

function saveUserScripts(list) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_KEY, JSON.stringify(list));
}

function scriptToDefinition(s) {
  return {
    id: `script:${s.id}`,
    name: s.name,
    shortName: "SCR",
    group: "scripts",
    placement: "overlay",
    maxInstances: 1,
    params: [],
    // metadata interno
    isUserScript: true,
    scriptId: s.id,
    scriptCode: s.code,
    scriptEnabled: !!s.enabled,
  };
}

export function getUserScriptDefinitions() {
  const scripts = loadUserScripts();
  return scripts.map(scriptToDefinition);
}

export function upsertUserScript({ id, name, code, enabled }) {
  const list = loadUserScripts();
  const now = Date.now();

  const next = [...list];
  const idx = next.findIndex((s) => s.id === id);

  if (idx >= 0) {
    next[idx] = {
      ...next[idx],
      name: String(name ?? next[idx].name ?? "Script sem nome"),
      code: String(code ?? next[idx].code ?? ""),
      enabled: typeof enabled === "boolean" ? enabled : next[idx].enabled,
      updatedAt: now,
    };
  } else {
    next.unshift({
      id: String(id),
      name: String(name ?? "Script sem nome"),
      code: String(code ?? ""),
      enabled: typeof enabled === "boolean" ? enabled : true,
      createdAt: now,
      updatedAt: now,
    });
  }

  saveUserScripts(next);
  return `script:${id}`;
}

export function setUserScriptEnabled(scriptId, enabled) {
  const list = loadUserScripts();
  const now = Date.now();
  const next = list.map((s) =>
    s.id === scriptId ? { ...s, enabled: !!enabled, updatedAt: now } : s
  );
  saveUserScripts(next);
}

export function removeUserScript(scriptId) {
  const list = loadUserScripts();
  const next = list.filter((s) => s.id !== scriptId);
  saveUserScripts(next);
}

// ✅ novos overlays (arquivos separados)
import { HMA_DEFINITION } from "@/indicators/overlays/hma";
import { ZIGZAG_DEFINITION } from "@/indicators/overlays/zigzag";
import { REGRESSION_CHANNEL_DEFINITION } from "@/indicators/overlays/regressionChannel";
import { PIVOTS_DEFINITION } from "@/indicators/overlays/pivots";
import { AUTOSR_DEFINITION } from "@/indicators/overlays/autoSR";
import { ANCHORED_VWAP_DEFINITION } from "@/indicators/overlays/anchoredVwap";

// ========================
// BUILT-IN DEFINITIONS (base em PT-BR como fallback)
// ========================
export const INDICATOR_DEFINITIONS = [
  // ================== MOVING AVERAGES ==================
  {
    id: "sma",
    name: "SMA (Média Móvel Simples)",
    shortName: "SMA",
    group: "trend",
    placement: "overlay",
    maxInstances: 4,
    params: [
      { key: "length", label: "Período", type: "number", min: 1, max: 500, step: 1, default: 20 },
      {
        key: "source",
        label: "Preço",
        type: "select",
        options: [
          { value: "close", label: "Fechamento" },
          { value: "open", label: "Abertura" },
          { value: "high", label: "Máxima" },
          { value: "low", label: "Mínima" },
          { value: "hl2", label: "HL2" },
          { value: "hlc3", label: "HLC3" },
          { value: "ohlc4", label: "OHLC4" },
        ],
        default: "close",
      },
    ],
  },
  {
    id: "ema",
    name: "EMA (Média Móvel Exponencial)",
    shortName: "EMA",
    group: "trend",
    placement: "overlay",
    maxInstances: 4,
    params: [
      { key: "length", label: "Período", type: "number", min: 1, max: 500, step: 1, default: 20 },
      {
        key: "source",
        label: "Preço",
        type: "select",
        options: [
          { value: "close", label: "Fechamento" },
          { value: "open", label: "Abertura" },
          { value: "high", label: "Máxima" },
          { value: "low", label: "Mínima" },
          { value: "hl2", label: "HL2" },
          { value: "hlc3", label: "HLC3" },
          { value: "ohlc4", label: "OHLC4" },
        ],
        default: "close",
      },
    ],
  },

  // ✅ HMA (novo)
  HMA_DEFINITION,

  // ================== VOLATILITY ==================
  {
    id: "bollinger",
    name: "Bandas de Bollinger",
    shortName: "BB",
    group: "volatility",
    placement: "overlay",
    maxInstances: 2,
    params: [
      { key: "length", label: "Período", type: "number", min: 5, max: 500, step: 1, default: 20 },
      { key: "multiplier", label: "Desvios Padrão", type: "number", min: 0.1, max: 10, step: 0.1, default: 2 },
      {
        key: "source",
        label: "Preço",
        type: "select",
        options: [
          { value: "close", label: "Fechamento" },
          { value: "hl2", label: "HL2" },
          { value: "hlc3", label: "HLC3" },
          { value: "ohlc4", label: "OHLC4" },
        ],
        default: "close",
      },
    ],
  },

  // ================== OVERLAY ==================
  {
    id: "vwap",
    name: "VWAP",
    shortName: "VWAP",
    group: "volume",
    placement: "overlay",
    maxInstances: 1,
    params: [
      {
        key: "source",
        label: "Preço",
        type: "select",
        options: [
          { value: "hlc3", label: "HLC3" },
          { value: "hl2", label: "HL2" },
          { value: "close", label: "Fechamento" },
          { value: "ohlc4", label: "OHLC4" },
        ],
        default: "hlc3",
      },
      { key: "resetDaily", label: "Reset diário (UTC)", type: "boolean", default: true },
    ],
  },

  // ✅ Anchored VWAP (novo)
  ANCHORED_VWAP_DEFINITION,

  {
    id: "donchian",
    name: "Donchian Channels",
    shortName: "DON",
    group: "volatility",
    placement: "overlay",
    maxInstances: 1,
    params: [{ key: "length", label: "Período", type: "number", min: 1, max: 500, step: 1, default: 20 }],
  },
  {
    id: "keltner",
    name: "Keltner Channels",
    shortName: "KELT",
    group: "volatility",
    placement: "overlay",
    maxInstances: 1,
    params: [
      { key: "length", label: "EMA Período", type: "number", min: 1, max: 500, step: 1, default: 20 },
      { key: "atrLength", label: "ATR Período", type: "number", min: 1, max: 200, step: 1, default: 10 },
      { key: "multiplier", label: "Multiplicador", type: "number", min: 0.1, max: 10, step: 0.1, default: 2 },
      {
        key: "source",
        label: "Preço (EMA)",
        type: "select",
        options: [
          { value: "hlc3", label: "HLC3" },
          { value: "hl2", label: "HL2" },
          { value: "close", label: "Fechamento" },
          { value: "ohlc4", label: "OHLC4" },
        ],
        default: "hlc3",
      },
    ],
  },
  {
    id: "envelopes",
    name: "Envelopes",
    shortName: "ENV",
    group: "trend",
    placement: "overlay",
    maxInstances: 1,
    params: [
      { key: "length", label: "Período", type: "number", min: 1, max: 500, step: 1, default: 20 },
      { key: "percent", label: "% Envelope", type: "number", min: 0, max: 20, step: 0.1, default: 1 },
      {
        key: "maType",
        label: "Tipo MA",
        type: "select",
        options: [
          { value: "sma", label: "SMA" },
          { value: "ema", label: "EMA" },
        ],
        default: "sma",
      },
      {
        key: "source",
        label: "Preço",
        type: "select",
        options: [
          { value: "close", label: "Fechamento" },
          { value: "hl2", label: "HL2" },
          { value: "hlc3", label: "HLC3" },
          { value: "ohlc4", label: "OHLC4" },
        ],
        default: "close",
      },
    ],
  },

  // ================== PSAR ==================
  {
    id: "psar",
    name: "Parabolic SAR",
    shortName: "PSAR",
    group: "trend",
    placement: "overlay",
    maxInstances: 1,
    params: [
      { key: "start", label: "Início", type: "number", min: 0.001, max: 0.2, step: 0.001, default: 0.02 },
      { key: "increment", label: "Incremento", type: "number", min: 0.001, max: 0.2, step: 0.001, default: 0.02 },
      { key: "max", label: "Máx", type: "number", min: 0.01, max: 1, step: 0.01, default: 0.2 },
      {
        key: "precision",
        label: "Precisão",
        type: "select",
        options: [
          { value: "default", label: "Padrão" },
          { value: "0", label: "0" },
          { value: "1", label: "0,1" },
          { value: "2", label: "0,01" },
          { value: "3", label: "0,001" },
          { value: "4", label: "0,0001" },
        ],
        default: "default",
      },
    ],
  },

  // ================== SUPERTREND ==================
  {
    id: "supertrend",
    name: "SuperTrend",
    shortName: "ST",
    group: "trend",
    placement: "overlay",
    maxInstances: 1,
    params: [
      { key: "atrLength", label: "ATR Período", type: "number", min: 1, max: 200, step: 1, default: 7 },
      { key: "multiplier", label: "Multiplicador", type: "number", min: 0.1, max: 10, step: 0.1, default: 3 },
    ],
  },

  // ================== FRACTAL ==================
  {
    id: "fractal",
    name: "Fractal",
    shortName: "FRAC",
    group: "trend",
    placement: "overlay",
    maxInstances: 1,
    params: [
      { key: "period", label: "Período", type: "number", min: 3, max: 25, step: 2, default: 5 },
    ],
  },

  // ✅ ZigZag / Regression / Pivots / AutoSR (novos)
  ZIGZAG_DEFINITION,
  REGRESSION_CHANNEL_DEFINITION,
  PIVOTS_DEFINITION,
  AUTOSR_DEFINITION,

  // ================== PANE ==================
  {
    id: "atr",
    name: "ATR (Average True Range)",
    shortName: "ATR",
    group: "volatility",
    placement: "separate",
    maxInstances: 1,
    params: [{ key: "length", label: "Período", type: "number", min: 1, max: 200, step: 1, default: 14 }],
  },

  // ================== OSCILLATORS ==================
  {
    id: "rsi",
    name: "RSI",
    shortName: "RSI",
    group: "oscillator",
    placement: "separate",
    maxInstances: 1,
    params: [
      { key: "length", label: "Período", type: "number", min: 2, max: 100, step: 1, default: 14 },
      { key: "lowerLevel", label: "Nível inferior", type: "number", min: 0, max: 100, step: 1, default: 20 },
      { key: "upperLevel", label: "Nível superior", type: "number", min: 0, max: 100, step: 1, default: 80 },
      { key: "midLevel", label: "Nível do meio", type: "number", min: 0, max: 100, step: 1, default: 50 },
      { key: "showMidLevel", label: "Exibir linha do meio", type: "boolean", default: true },
    ],
  },
  {
    id: "stochastic",
    name: "Estocástico",
    shortName: "STOCH",
    group: "oscillator",
    placement: "separate",
    maxInstances: 1,
    params: [
      { key: "kLength", label: "%K Período", type: "number", min: 2, max: 200, step: 1, default: 14 },
      { key: "dLength", label: "%D Período", type: "number", min: 1, max: 200, step: 1, default: 3 },
      { key: "smoothK", label: "Suavização %K", type: "number", min: 1, max: 50, step: 1, default: 3 },
      { key: "lowerLevel", label: "Nível inferior", type: "number", min: 0, max: 100, step: 1, default: 20 },
      { key: "upperLevel", label: "Nível superior", type: "number", min: 0, max: 100, step: 1, default: 80 },
      { key: "midLevel", label: "Nível do meio", type: "number", min: 0, max: 100, step: 1, default: 50 },
      { key: "showMidLevel", label: "Exibir linha do meio", type: "boolean", default: true },
    ],
  },
  {
    id: "macd",
    name: "MACD",
    shortName: "MACD",
    group: "oscillator",
    placement: "separate",
    maxInstances: 1,
    params: [
      { key: "fast", label: "Rápida", type: "number", min: 1, max: 100, step: 1, default: 12 },
      { key: "slow", label: "Lenta", type: "number", min: 1, max: 200, step: 1, default: 26 },
      { key: "signal", label: "Sinal", type: "number", min: 1, max: 100, step: 1, default: 9 },
      {
        key: "source",
        label: "Preço",
        type: "select",
        options: [
          { value: "close", label: "Fechamento" },
          { value: "hl2", label: "HL2" },
          { value: "hlc3", label: "HLC3" },
          { value: "ohlc4", label: "OHLC4" },
        ],
        default: "close",
      },
    ],
  },
  {
    id: "adx",
    name: "ADX / DMI",
    shortName: "ADX",
    group: "oscillator",
    placement: "separate",
    maxInstances: 1,
    params: [{ key: "length", label: "Período", type: "number", min: 2, max: 200, step: 1, default: 14 }],
  },
  {
    id: "cci",
    name: "CCI",
    shortName: "CCI",
    group: "oscillator",
    placement: "separate",
    maxInstances: 1,
    params: [{ key: "length", label: "Período", type: "number", min: 2, max: 200, step: 1, default: 20 }],
  },
  {
    id: "williamsr",
    name: "Williams %R",
    shortName: "%R",
    group: "oscillator",
    placement: "separate",
    maxInstances: 1,
    params: [{ key: "length", label: "Período", type: "number", min: 2, max: 200, step: 1, default: 14 }],
  },
  {
    id: "momentum",
    name: "Momentum",
    shortName: "MOM",
    group: "oscillator",
    placement: "separate",
    maxInstances: 1,
    params: [{ key: "length", label: "Período", type: "number", min: 1, max: 200, step: 1, default: 10 }],
  },
  {
    id: "roc",
    name: "ROC (Rate of Change)",
    shortName: "ROC",
    group: "oscillator",
    placement: "separate",
    maxInstances: 1,
    params: [{ key: "length", label: "Período", type: "number", min: 1, max: 200, step: 1, default: 12 }],
  },

  // ================== VOLUME ==================
  {
    id: "volume",
    name: "Volume",
    shortName: "VOL",
    group: "volume",
    placement: "separate",
    maxInstances: 1,
    params: [],
  },
];

// ========================
// ✅ FUNÇÕES DE TRADUÇÃO (usam i18n diretamente)
// ========================

/**
 * Obtém a definição de um indicador com strings traduzidas
 * @param {string} id - ID do indicador (ex: "sma", "rsi")
 * @param {string} [lng] - Locale opcional (padrão: i18n.language)
 * @returns {Object|null} Definição traduzida ou null se não encontrado
 */
export function getTranslatedIndicatorDefinition(id, lng) {
  const locale = lng || i18n.language || "pt-BR";
  const baseDef = getIndicatorDefinition(id);
  
  if (!baseDef) return null;

  // Helper para traduzir com fallback para o valor original
  const t = (key, fallback) => {
    try {
      const translated = i18n.t(key, { lng: locale, ns: "indicators" });
      return translated !== key ? translated : fallback;
    } catch {
      return fallback;
    }
  };

  // Traduz nome e shortName do indicador
  const translatedName = t(`indicators.${baseDef.id}.name`, baseDef.name);
  const translatedShortName = t(`indicators.${baseDef.id}.shortName`, baseDef.shortName);
  const translatedGroup = t(`indicators.groups.${baseDef.group}`, baseDef.group);

  // Traduz parâmetros
  const translatedParams = baseDef.params?.map((param) => {
    const translatedLabel = t(`indicators.params.${param.key}`, param.label);
    
    // Traduz opções de select
    const translatedOptions = param.options?.map((opt) => ({
      ...opt,
      label: t(`indicators.source.${opt.value}`, opt.label),
    }));

    return {
      ...param,
      label: translatedLabel,
      options: translatedOptions,
    };
  });

  return {
    ...baseDef,
    name: translatedName,
    shortName: translatedShortName,
    group: translatedGroup,
    params: translatedParams,
  };
}

/**
 * Obtém todas as definições de indicadores com strings traduzidas
 * @param {string} [lng] - Locale opcional (padrão: i18n.language)
 * @returns {Array} Lista de definições traduzidas
 */
export function getTranslatedIndicatorDefinitions(lng) {
  const locale = lng || i18n.language || "pt-BR";
  const allDefs = getAllIndicatorDefinitions();
  
  return allDefs.map((def) => {
    // Scripts de usuário mantêm o nome original
    if (def.isUserScript) return def;
    
    return getTranslatedIndicatorDefinition(def.id, locale) || def;
  });
}

/**
 * Traduz um valor de fonte de preço (para uso em selects)
 * @param {string} value - Valor da fonte (ex: "close", "hl2")
 * @param {string} [lng] - Locale opcional
 * @returns {string} Label traduzido
 */
export function translatePriceSource(value, lng) {
  const locale = lng || i18n.language || "pt-BR";
  try {
    const translated = i18n.t(`indicators.source.${value}`, { lng: locale, ns: "indicators" });
    return translated !== `indicators.source.${value}` ? translated : value;
  } catch {
    return value;
  }
}

/**
 * Traduz um grupo de indicadores
 * @param {string} group - ID do grupo (ex: "trend", "oscillator")
 * @param {string} [lng] - Locale opcional
 * @returns {string} Nome do grupo traduzido
 */
export function translateIndicatorGroup(group, lng) {
  const locale = lng || i18n.language || "pt-BR";
  try {
    const translated = i18n.t(`indicators.groups.${group}`, { lng: locale, ns: "indicators" });
    return translated !== `indicators.groups.${group}` ? translated : group;
  } catch {
    return group;
  }
}

// ========================
// FUNÇÕES ORIGINAIS (mantidas para compatibilidade)
// ========================

export function getAllIndicatorDefinitions() {
  return [...INDICATOR_DEFINITIONS, ...getUserScriptDefinitions()];
}

export function getIndicatorDefinition(id) {
  const builtin = INDICATOR_DEFINITIONS.find((def) => def.id === id) || null;
  if (builtin) return builtin;

  const scripts = getUserScriptDefinitions();
  return scripts.find((def) => def.id === id) || null;
}