// src/i18n/resources.js
import { coreBundle } from "./bundles/core";

/**
 * Deep merge simples e seguro para i18n resources:
 * - preserva objetos já existentes
 * - mescla recursivamente
 * - último bundle vence em caso de conflito de string/valor
 */
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepMerge(target, source) {
  if (!isPlainObject(target) || !isPlainObject(source)) return source;

  const out = { ...target };
  for (const key of Object.keys(source)) {
    const t = out[key];
    const s = source[key];

    if (isPlainObject(t) && isPlainObject(s)) {
      out[key] = deepMerge(t, s);
    } else {
      out[key] = s;
    }
  }
  return out;
}

function mergeBundles(...bundles) {
  return bundles.reduce((acc, bundle) => deepMerge(acc, bundle), {});
}

/**
 * ✅ Export final (i18next)
 * No futuro: mergeBundles(coreBundle, walletBundle, profileBundle, legalBundle, ...)
 */
export const resources = mergeBundles(coreBundle);
