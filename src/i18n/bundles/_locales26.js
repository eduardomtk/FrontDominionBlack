// src/i18n/bundles/_locales26.js

/**
 * ✅ Profissional: garante que TODOS os bundles tenham exatamente 26 locales.
 * - Você mantém traduções "base" (as que já existem)
 * - E completa as derivadas com fallback inteligente
 *
 * 26 locales:
 * pt-BR, pt-PT,
 * en-US, en-GB, en-SG, en-CA, en-IE, en-AU, en-NZ,
 * es-ES, es-MX, es-AR, es-CL, es-CO, es-PE,
 * fr-FR, de-DE, it-IT,
 * ar-AE, hi-IN, id-ID, fil-PH, ms-MY, th-TH, vi-VN, zh-HK
 */

const DERIVED_LOCALE_FALLBACK = {
  // English derived
  "en-CA": "en-US",
  "en-IE": "en-GB",
  "en-AU": "en-GB",
  "en-NZ": "en-GB",

  // Spanish derived
  "es-MX": "es-ES",
  "es-AR": "es-ES",
  "es-CL": "es-ES",
  "es-CO": "es-ES",
  "es-PE": "es-ES",
};

const ALL_26 = [
  "pt-BR",
  "pt-PT",

  "en-US",
  "en-GB",
  "en-SG",
  "en-CA",
  "en-IE",
  "en-AU",
  "en-NZ",

  "es-ES",
  "es-MX",
  "es-AR",
  "es-CL",
  "es-CO",
  "es-PE",

  "fr-FR",
  "de-DE",
  "it-IT",

  "ar-AE",
  "hi-IN",
  "id-ID",
  "fil-PH",
  "ms-MY",
  "th-TH",
  "vi-VN",
  "zh-HK",
];

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepClone(obj) {
  try {
    // node 17+/browsers modernos
    return structuredClone(obj);
  } catch {
    return JSON.parse(JSON.stringify(obj));
  }
}

function deepMerge(target, source) {
  if (!isPlainObject(target) || !isPlainObject(source)) return source;

  const out = { ...target };
  for (const key of Object.keys(source)) {
    const t = out[key];
    const s = source[key];

    if (isPlainObject(t) && isPlainObject(s)) out[key] = deepMerge(t, s);
    else out[key] = s;
  }
  return out;
}

/**
 * Expande um bundle parcial (com algumas línguas) para conter os 26.
 * - Preserva as línguas existentes
 * - Preenche línguas derivadas usando o fallback definido
 * - Se mesmo assim não houver base, cai no en-US
 */
export function expandTo26Locales(partialBundle) {
  const out = {};

  // 1) Copia os que já existem
  for (const lng of Object.keys(partialBundle || {})) {
    out[lng] = deepClone(partialBundle[lng]);
  }

  // 2) Preenche as faltantes
  for (const lng of ALL_26) {
    if (out[lng]) continue;

    const fallback =
      DERIVED_LOCALE_FALLBACK[lng] ||
      (lng.startsWith("en-") ? "en-US" : null) ||
      (lng.startsWith("es-") ? "es-ES" : null) ||
      "en-US";

    out[lng] = out[fallback] ? deepClone(out[fallback]) : {};
  }

  return out;
}

/**
 * Merge util opcional (para core aggregator).
 */
export function mergeLocaleBundles(...bundles) {
  return bundles.reduce((acc, b) => deepMerge(acc, b), {});
}
