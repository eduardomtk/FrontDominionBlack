/**
 * Mapeia Country Code (ISO-3166-1 alpha-2) -> Locale (BCP-47)
 * Padrão profissional para corretora internacional (26 pares).
 */

const ALL_26 = new Set([
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
]);

function normalizeLocale(v) {
  const raw = String(v || "").trim();
  if (!raw) return null;

  // tolerância: en_GB -> en-GB
  const s = raw.replace(/_/g, "-");

  // garante casing padrão do seu bundle (ex.: en-us -> en-US)
  // Regra simples: ll-CC (2 letras + hífen + 2 letras)
  const m = s.match(/^([a-zA-Z]{2,3})(?:-([a-zA-Z]{2}))$/);
  if (m) {
    const ll = m[1].toLowerCase();
    const CC = m[2].toUpperCase();
    return `${ll}-${CC}`;
  }

  return s;
}

export function localeFromCountry(countryCode) {
  const c = String(countryCode || "").trim().toUpperCase();

  // Português
  if (c === "BR") return "pt-BR";
  if (c === "PT") return "pt-PT";

  // Espanhol (LatAm + Espanha)
  if (c === "ES") return "es-ES";
  if (c === "MX") return "es-MX";
  if (c === "AR") return "es-AR";
  if (c === "CL") return "es-CL";
  if (c === "CO") return "es-CO";
  if (c === "PE") return "es-PE";

  // Francês / Alemão / Italiano
  if (c === "FR") return "fr-FR";
  if (c === "DE") return "de-DE";
  if (c === "IT") return "it-IT";

  // Inglês (regionais)
  if (c === "US") return "en-US";
  if (c === "GB") return "en-GB";
  if (c === "IE") return "en-IE";
  if (c === "CA") return "en-CA";
  if (c === "AU") return "en-AU";
  if (c === "NZ") return "en-NZ";
  if (c === "SG") return "en-SG";

  // Ásia / Oriente Médio (idioma nativo)
  if (c === "AE") return "ar-AE";
  if (c === "IN") return "hi-IN";
  if (c === "ID") return "id-ID";
  if (c === "PH") return "fil-PH";
  if (c === "MY") return "ms-MY";
  if (c === "TH") return "th-TH";
  if (c === "VN") return "vi-VN";
  if (c === "HK") return "zh-HK";

  return "en-US";
}

/**
 * Obtém o locale atual do storage.
 * ✅ Sanitiza e garante que seja um dos 26.
 */
export function getLocale() {
  try {
    const raw = localStorage.getItem("tp_locale");
    const normalized = normalizeLocale(raw);

    if (normalized && ALL_26.has(normalized)) return normalized;

    // fallback forte e previsível
    return "pt-BR";
  } catch {
    return "pt-BR";
  }
}

/**
 * Persiste locale no storage.
 * ✅ Sanitiza e garante 26.
 */
export function setLocale(locale) {
  try {
    const normalized = normalizeLocale(locale);
    localStorage.setItem("tp_locale", ALL_26.has(normalized) ? normalized : "pt-BR");
  } catch {}
}
