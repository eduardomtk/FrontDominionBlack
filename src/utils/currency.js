export function normalizeCurrency(value, fallback = "BRL") {
  const cur = String(value || fallback || "BRL").trim().toUpperCase();
  return ["BRL", "USD", "EUR"].includes(cur) ? cur : fallback;
}

export function getCurrencySymbol(currency) {
  const cur = normalizeCurrency(currency);
  if (cur === "USD") return "$";
  if (cur === "EUR") return "€";
  return "R$";
}

export function getCurrencyLocale(currency, locale) {
  if (locale && String(locale).trim()) return String(locale).trim();
  const cur = normalizeCurrency(currency);
  if (cur === "USD") return "en-US";
  if (cur === "EUR") return "de-DE";
  return "pt-BR";
}

export function formatCurrency(value, currency = "BRL", locale) {
  const cur = normalizeCurrency(currency);
  const loc = getCurrencyLocale(cur, locale);
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(loc, {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${getCurrencySymbol(cur)} ${safe.toFixed(2)}`;
  }
}

export function formatCurrencyValue(value, currency = "BRL", locale) {
  const cur = normalizeCurrency(currency);
  const loc = getCurrencyLocale(cur, locale);
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(loc, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return safe.toFixed(2);
  }
}
