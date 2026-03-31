const CRYPTO_BASES = new Set([
  'BTC','ETH','BNB','SOL','XRP','ADA','DOGE','TRX','TON','AVAX','DOT','LINK','LTC','BCH',
  'MATIC','ATOM','FIL','UNI','APT','ARB','OP','NEAR','AAVE','SUI','PEPE','SHIB','FLOKI'
]);

function normalizeSymbol(symbol) {
  return String(symbol || '').toUpperCase().replace(/\//g, '').trim();
}

export function isMetalSymbol(symbol) {
  const s = normalizeSymbol(symbol);
  return s.startsWith('XAU') || s.startsWith('XAG') || s.includes('XAU') || s.includes('XAG');
}

export function isCryptoSymbol(symbol) {
  const s = normalizeSymbol(symbol);
  if (!s) return false;
  if (isMetalSymbol(s)) return false;
  const base3 = s.slice(0, 3);
  return CRYPTO_BASES.has(base3) || [...CRYPTO_BASES].some((c) => s.startsWith(c));
}

export function isForexSymbol(symbol) {
  const s = normalizeSymbol(symbol);
  if (!s || isMetalSymbol(s) || isCryptoSymbol(s)) return false;
  return /^[A-Z]{6}$/.test(s);
}

export function getAxisPrecision(symbol, price) {
  if (isForexSymbol(symbol)) return 5;

  const n = Math.abs(Number(price));
  if (!Number.isFinite(n)) return 2;
  if (n >= 100000) return 1;
  if (n >= 10000) return 2;
  if (n >= 1000) return 2;
  if (n >= 100) return 3;
  if (n >= 10) return 4;
  if (n >= 1) return 5;
  if (n >= 0.1) return 5;
  if (n >= 0.01) return 6;
  return 7;
}

export function formatAxisPrice(price, symbol) {
  const n = Number(price);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(getAxisPrecision(symbol, n));
}

export function buildSeriesPriceFormat(symbol, samplePrice = NaN) {
  const precision = getAxisPrecision(symbol, samplePrice);
  return {
    type: 'price',
    precision,
    minMove: 1 / Math.pow(10, precision),
  };
}

export function getPriceScaleMinWidth(symbol) {
  if (isForexSymbol(symbol)) return 58;
  if (isCryptoSymbol(symbol)) return 58;
  if (isMetalSymbol(symbol)) return 58;
  return 58;
}
