// src/context/LocaleContext.jsx
import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTradingAuth } from "@/context/TradingAuthContext";
import { getLocale as getStoredLocale, setLocale as setStoredLocale, localeFromCountry } from "@/i18n/locale";

const LocaleContext = createContext(null);

function safeJsonParse(v) {
  try {
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

function normalizeLocale(v, fallback = "pt-BR") {
  const s = String(v || "").trim();
  return s || fallback;
}

export function LocaleProvider({ children }) {
  const { user, profile, profileReady, upsertProfile } = useTradingAuth();

  // ✅ hydrate instantâneo: sempre parte do localStorage (zero flicker)
  const [locale, setLocaleState] = useState(() => normalizeLocale(getStoredLocale(), "pt-BR"));

  // ✅ latch: nunca volta pra "não bootado"
  const [localeBooted, setLocaleBooted] = useState(false);

  const lastUidRef = useRef(null);
  const upsertedLocaleRef = useRef({ uid: null, locale: null });

  // ✅ troca de usuário: mantém comportamento previsível
  useEffect(() => {
    const uid = user?.id ?? null;
    if (lastUidRef.current === uid) return;

    lastUidRef.current = uid;

    // sempre inicia do storage (instantâneo)
    const stored = normalizeLocale(getStoredLocale(), "pt-BR");
    setLocaleState(stored);
    setLocaleBooted(true);

    // reseta trava de upsert por usuário
    upsertedLocaleRef.current = { uid: null, locale: null };
  }, [user?.id]);

  // ✅ resolve a fonte de verdade quando profile estiver pronto
  useEffect(() => {
    if (!profileReady) return;

    const uid = user?.id ?? null;

    // sem auth: garante pelo menos storage ok
    if (!uid) {
      const stored = normalizeLocale(getStoredLocale(), "pt-BR");
      setLocaleState(stored);
      setLocaleBooted(true);
      return;
    }

    // 1) profile.locale (fonte soberana)
    const profileLocale = profile?.locale ? normalizeLocale(profile.locale, null) : null;

    // 2) prefs locais (fallback)
    let prefsLocale = null;
    try {
      const prefs = safeJsonParse(localStorage.getItem("tp_prefs"));
      if (prefs?.country) {
        prefsLocale = normalizeLocale(localeFromCountry(prefs.country), null);
      }
    } catch {}

    // 3) storage (fallback)
    const stored = normalizeLocale(getStoredLocale(), "pt-BR");

    const desired = profileLocale || prefsLocale || stored || "pt-BR";

    // aplica no runtime + storage
    if (desired && desired !== stored) {
      try {
        setStoredLocale(desired);
      } catch {}
    }

    if (desired && desired !== locale) {
      setLocaleState(desired);
    }

    setLocaleBooted(true);

    // ✅ persistir no profile se ainda não existe
    if (!profileLocale && desired) {
      const last = upsertedLocaleRef.current;
      const alreadyUpserted = last.uid === uid && last.locale === desired;
      if (alreadyUpserted) return;

      upsertedLocaleRef.current = { uid, locale: desired };

      // não bloquear UI — fire and forget (mas sem prometer background)
      Promise.resolve()
        .then(() => upsertProfile?.({ locale: desired }))
        .catch(() => {});
    }
  }, [profileReady, user?.id, profile?.locale, locale, upsertProfile]);

  // ✅ API pública do contexto (runtime switch futuramente)
  const setLocale = useCallback(
    async (nextLocale, opts = {}) => {
      const { persistProfile = true } = opts || {};
      const normalized = normalizeLocale(nextLocale, "pt-BR");

      // runtime + storage
      try {
        setStoredLocale(normalized);
      } catch {}
      setLocaleState(normalized);
      setLocaleBooted(true);

      // persistir no profile (se autenticado)
      const uid = user?.id ?? null;
      if (persistProfile && uid && upsertProfile) {
        upsertedLocaleRef.current = { uid, locale: normalized };
        const res = await upsertProfile({ locale: normalized });
        return res;
      }

      return { data: null, error: null };
    },
    [user?.id, upsertProfile]
  );

  const value = useMemo(() => {
    return {
      locale,
      localeBooted,
      setLocale,
    };
  }, [locale, localeBooted, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside LocaleProvider");
  return ctx;
}
