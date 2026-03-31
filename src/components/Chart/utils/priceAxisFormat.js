function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function getCompactAxisDecimals(price, maxDigits = 6) {
  const n = Math.abs(Number(price));
  if (!Number.isFinite(n)) return 0;

  const integerDigits = n >= 1 ? Math.max(1, Math.floor(n).toString().length) : 1;
  return clamp(maxDigits - integerDigits, 0, 5);
}

export function formatCompactAxisPrice(price, maxDigits = 6) {
  const n = Number(price);
  if (!Number.isFinite(n)) return "";

  const decimals = getCompactAxisDecimals(n, maxDigits);
  return n.toFixed(decimals);
}
