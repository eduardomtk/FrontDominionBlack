// src/utils/formatters.js

const safeLocale = (locale) => (typeof locale === "string" && locale.trim() ? locale : "en-US");

const currencyByLocale = {
  "pt-BR": "BRL",
  "en-US": "USD",
  "en-CA": "CAD",
  "es-MX": "MXN",
  "es-AR": "ARS",
  "es-CL": "CLP",
  "es-CO": "COP",
  "es-PE": "PEN",
  "pt-PT": "EUR",
  "es-ES": "EUR",
  "fr-FR": "EUR",
  "de-DE": "EUR",
  "it-IT": "EUR",
  "en-GB": "GBP",
  "en-IE": "EUR",
  "ar-AE": "AED",
  "en-IN": "INR",
  "id-ID": "IDR",
  "en-PH": "PHP",
  "ms-MY": "MYR",
};

// fallback “por país” (caso seu i18n use tags diferentes)
const currencyByCountry = {
  BR: "BRL",
  US: "USD",
  CA: "CAD",
  MX: "MXN",
  AR: "ARS",
  CL: "CLP",
  CO: "COP",
  PE: "PEN",
  PT: "EUR",
  ES: "EUR",
  FR: "EUR",
  DE: "EUR",
  IT: "EUR",
  GB: "GBP",
  IE: "EUR",
  AE: "AED",
  IN: "INR",
  ID: "IDR",
  PH: "PHP",
  MY: "MYR",
};

const countryFromLocale = (locale) => {
  const parts = String(locale || "").split("-");
  return parts.length >= 2 ? parts[1].toUpperCase() : "";
};

export const getCurrencyForLocale = (locale, fallbackCurrency = "USD") => {
  const loc = safeLocale(locale);
  if (currencyByLocale[loc]) return currencyByLocale[loc];

  const c = countryFromLocale(loc);
  if (c && currencyByCountry[c]) return currencyByCountry[c];

  return fallbackCurrency;
};

export const formatNumber = (value, locale, options = {}) => {
  const loc = safeLocale(locale);
  const n = Number(value);
  const v = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(loc, options).format(v);
  } catch {
    return String(v);
  }
};

export const formatMoney = (value, locale, currency) => {
  const loc = safeLocale(locale);
  const cur = currency || getCurrencyForLocale(loc, "USD");
  const n = Number(value);
  const v = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(loc, {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `${cur} ${formatNumber(v, loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
};

export const formatPercent = (value, locale, digits = 2) => {
  const loc = safeLocale(locale);
  const n = Number(value);
  const v = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(loc, {
      style: "percent",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(v);
  } catch {
    return `${(v * 100).toFixed(digits)}%`;
  }
};

export const formatDate = (date, locale, options = {}) => {
  const loc = safeLocale(locale);
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return "-";
  try {
    return new Intl.DateTimeFormat(loc, { dateStyle: "short", ...options }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
};

export const formatDateTime = (date, locale, options = {}) => {
  const loc = safeLocale(locale);
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return "-";
  try {
    return new Intl.DateTimeFormat(loc, { dateStyle: "short", timeStyle: "short", ...options }).format(d);
  } catch {
    return d.toLocaleString();
  }
};

export const formatMMSS = (sec) => {
  const s = Math.max(0, Number(sec) || 0);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(Math.floor(s % 60)).padStart(2, "0");
  return `${mm}:${ss}`;
};
