// src/context/TradingAuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase, getPublicAvatarUrl } from "../services/supabaseClient";
import { getCountriesSorted } from "@/data/countries";
import { normalizeCurrency } from "@/utils/currency";

// ✅ locale helpers
import { getLocale as getStoredLocale, setLocale as setStoredLocale, localeFromCountry } from "@/i18n/locale";

const TradingAuthContext = createContext(null);

const PROFILE_POLL_MS = 5000;

const PROFILE_CACHE_VERSION = "v1";
const profileCacheKey = (uid) => `profile_cache:${PROFILE_CACHE_VERSION}:${uid}`;

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

function buildProfileBootstrap(input = {}) {
  const countryCode = String(input.country_code || input.countryCode || "").trim().toUpperCase() || null;
  const locale = normalizeLocale(input.locale || (countryCode ? localeFromCountry(countryCode) : null), "pt-BR");
  const currency = normalizeCurrency(input.currency, "BRL");
  const country = String(input.country || "").trim() || null;

  return {
    ...(country ? { country } : {}),
    ...(countryCode ? { country_code: countryCode } : {}),
    ...(currency ? { currency } : {}),
    ...(locale ? { locale } : {}),
  };
}

// ✅ NOVO: resolve countryName ("Brasil") -> countryCode ("BR")
function countryCodeFromCountryName(countryName) {
  const name = String(countryName || "").trim().toLowerCase();
  if (!name) return null;

  try {
    const countries = getCountriesSorted({ prioritizeBR: true });
    const found = countries.find((c) => String(c?.name || "").trim().toLowerCase() === name);
    return found?.code ? String(found.code).toUpperCase() : null;
  } catch {
    return null;
  }
}

export function TradingAuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const profileSeqRef = useRef(0);
  const [profileBooted, setProfileBooted] = useState(false);

  const realtimeRef = useRef(null);
  const pollRef = useRef(null);

  const user = session?.user ?? null;

  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const lastUidRef = useRef(null);

  // ✅ evita loop de persist locale (polling/realtime)
  const localePersistRef = useRef({ uid: null, locale: null });

  const persistBootstrapPrefs = useCallback((bootstrap = {}) => {
    const countryCode = String(bootstrap?.country_code || bootstrap?.countryCode || "").trim().toUpperCase();
    const currency = normalizeCurrency(bootstrap?.currency, "BRL");
    if (!countryCode && !currency) return;
    try {
      const prev = safeJsonParse(localStorage.getItem("tp_prefs")) || {};
      localStorage.setItem("tp_prefs", JSON.stringify({
        ...prev,
        ...(countryCode ? { country: countryCode } : {}),
        ...(currency ? { currency } : {}),
      }));
    } catch {}
  }, []);

  const mergeAuthEmailIntoProfile = useCallback((profileRow, authEmail) => {
    if (!profileRow) return null;
    const e = authEmail ? String(authEmail).trim().toLowerCase() : null;
    if (!e) return profileRow;
    return { ...profileRow, email: e };
  }, []);

  const writeProfileCache = useCallback((uid, row) => {
    if (!uid || !row) return;
    try {
      localStorage.setItem(profileCacheKey(uid), JSON.stringify(row));
    } catch {}
  }, []);


  const upsertProfileByUid = useCallback(async (uid, partial, authEmail = null) => {
    if (!uid) return { data: null, error: new Error("Missing uid") };

    try {
      const payload = { id: uid, ...partial };
      if ("email" in payload) delete payload.email;

      const { data, error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .maybeSingle();

      if (error) return { data: null, error };

      const merged = mergeAuthEmailIntoProfile(data ?? null, authEmail);
      if (merged?.locale) {
        try {
          setStoredLocale(normalizeLocale(merged.locale, "pt-BR"));
        } catch {}
      }
      if (uid === user?.id) {
        setProfile(merged);
        writeProfileCache(uid, merged);
      }
      return { data: merged, error: null };
    } catch (e) {
      return { data: null, error: e };
    }
  }, [mergeAuthEmailIntoProfile, user?.id, writeProfileCache]);

  const readProfileCache = useCallback((uid) => {
    if (!uid) return null;
    try {
      return safeJsonParse(localStorage.getItem(profileCacheKey(uid)));
    } catch {
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const uid = user?.id;

    if (!uid) {
      setProfile(null);
      setProfileBooted(true);
      return { data: null, error: null };
    }

    const seq = ++profileSeqRef.current;
    setProfileLoading(true);

    try {
      let authEmail = user?.email || null;

      try {
        const { data: uData } = await supabase.auth.getUser();
        if (uData?.user?.email) {
          authEmail = uData.user.email;
        }
      } catch {}

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", uid)
        .maybeSingle();

      if (seq !== profileSeqRef.current) return { data: null, error: null };

      if (error) return { data: null, error };

      // 🚀 BOOTSTRAP COM PREFS DO GOOGLE
      if (!data) {
        let countryName = null;
        let countryCode = null;
        let currency = null;

        // ✅ locale (derivado do prefs.country code)
        let locale = null;

        try {
          const prefs = safeJsonParse(localStorage.getItem("tp_prefs"));
          if (prefs?.country) {
            countryCode = String(prefs.country).trim().toUpperCase();
            const countries = getCountriesSorted({ prioritizeBR: true });
            countryName = countries.find((c) => c.code === countryCode)?.name || null;
            locale = normalizeLocale(localeFromCountry(countryCode), null);
          }
          currency = prefs?.currency ? normalizeCurrency(prefs.currency, null) : null;
        } catch {}

        const userMeta = user?.user_metadata || {};
        if (!countryCode && userMeta?.country_code) countryCode = String(userMeta.country_code).trim().toUpperCase();
        if (!countryName && userMeta?.country) countryName = String(userMeta.country).trim() || null;
        if (!currency && userMeta?.currency) currency = normalizeCurrency(userMeta.currency, null);
        if (!locale && userMeta?.locale) locale = normalizeLocale(userMeta.locale, null);
        if (!locale && countryCode) locale = normalizeLocale(localeFromCountry(countryCode), null);

        // ✅ fallback final para locale
        if (!locale) {
          locale = normalizeLocale(getStoredLocale(), "pt-BR");
        }

        // ✅ garante storage alinhado já no primeiro login
        try {
          setStoredLocale(locale);
        } catch {}

        const payload = {
          id: uid,
          email: authEmail,
          ...(countryName ? { country: countryName } : {}),
          ...(countryCode ? { country_code: countryCode } : {}),
          ...(currency ? { currency } : {}),
          ...(locale ? { locale } : {}),
        };

        const { data: upserted } = await supabase
          .from("profiles")
          .upsert(payload, { onConflict: "id" })
          .select("*")
          .maybeSingle();

        const merged = mergeAuthEmailIntoProfile(upserted ?? null, authEmail);
        setProfile(merged);
        writeProfileCache(uid, merged);

        return { data: merged, error: null };
      }

      const merged = mergeAuthEmailIntoProfile(data, authEmail);

      // ✅ SYNC LOCALE (profile -> storage) | e persist se faltar
      try {
        const stored = normalizeLocale(getStoredLocale(), "pt-BR");
        const profileLocale = merged?.locale ? normalizeLocale(merged.locale, null) : null;

        let desired = profileLocale || null;

        // ✅ NOVO: fallback forte pelo país salvo no PROFILE (nome -> code -> locale)
        // Isso resolve a troca de conta (Brasil) mesmo que tp_prefs esteja "UAE".
        if (!desired) {
          const code = countryCodeFromCountryName(merged?.country);
          if (code) {
            desired = normalizeLocale(localeFromCountry(code), null);
          }
        }

        if (!desired) {
          // tenta prefs locais (country code) como fallback
          const prefs = safeJsonParse(localStorage.getItem("tp_prefs"));
          if (prefs?.country) desired = normalizeLocale(localeFromCountry(prefs.country), null);
        }

        if (!desired) desired = stored || "pt-BR";

        // aplica storage alinhado
        if (desired && desired !== stored) {
          try {
            setStoredLocale(desired);
          } catch {}
        }

        // se profile não tem locale, persistimos 1x (sem loop)
        if (!profileLocale && desired) {
          const last = localePersistRef.current;
          const already = last.uid === uid && last.locale === desired;
          if (!already) {
            localePersistRef.current = { uid, locale: desired };
            // não bloquear refreshProfile (mas é uma única query)
            supabase
              .from("profiles")
              .update({ locale: desired })
              .eq("id", uid)
              .then(() => {})
              .catch(() => {});
          }
        }
      } catch {}

      setProfile(merged);
      writeProfileCache(uid, merged);
      return { data: merged, error: null };
    } catch (e) {
      return { data: null, error: e };
    } finally {
      if (seq === profileSeqRef.current) setProfileLoading(false);
      setProfileBooted(true);
    }
  }, [user?.id, user?.email, mergeAuthEmailIntoProfile, writeProfileCache]);

  const upsertProfile = useCallback(
    async (partial) => {
      const uid = user?.id;
      if (!uid) return { data: null, error: new Error("Not authenticated") };

      try {
        const payload = { id: uid, ...partial };
        if ("email" in payload) delete payload.email;

        const { data, error } = await supabase
          .from("profiles")
          .upsert(payload, { onConflict: "id" })
          .select("*")
          .maybeSingle();

        if (error) return { data: null, error };

        const authEmail = user?.email || null;
        const merged = mergeAuthEmailIntoProfile(data ?? null, authEmail);

        // ✅ se veio locale, alinha storage
        if (merged?.locale) {
          try {
            setStoredLocale(normalizeLocale(merged.locale, "pt-BR"));
          } catch {}
        }

        setProfile(merged);
        writeProfileCache(uid, merged);
        return { data: merged, error: null };
      } catch (e) {
        return { data: null, error: e };
      }
    },
    [user?.id, user?.email, mergeAuthEmailIntoProfile, writeProfileCache]
  );

  useEffect(() => {
    let subscription = null;

    async function boot() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.warn("[TradingAuth] getSession error:", error.message);
        setSession(data?.session ?? null);
      } finally {
        setLoading(false);
      }

      const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession ?? null);
      });

      subscription = listener?.subscription ?? null;
    }

    boot();

    return () => {
      subscription?.unsubscribe?.();
    };
  }, []);

  // ✅ quando autentica, hidrata profile imediatamente (cache) e revalida (refresh)
  // ✅ FIX DEFINITIVO: reset do latch somente quando user.id muda
  useEffect(() => {
    if (loading) return;

    const uid = user?.id ?? null;
    const prevUid = lastUidRef.current;

    // ✅ Detecta troca real de usuário (login/logout/troca conta)
    const uidChanged = prevUid !== uid;
    if (uidChanged) {
      lastUidRef.current = uid;
      setProfileBooted(false);

      // reset do persist de locale por usuário
      localePersistRef.current = { uid: null, locale: null };

      if (!uid) {
        setProfile(null);
        setProfileBooted(true);
        return;
      }

      // ✅ hydrate do cache instantâneo (zero flicker)
      const cached = readProfileCache(uid);
      if (cached) {
        const mergedCached = mergeAuthEmailIntoProfile(cached, user?.email || null);
        setProfile(mergedCached);
        setProfileBooted(true);

        // ✅ se cache já tem locale, alinha storage
        if (mergedCached?.locale) {
          try {
            setStoredLocale(normalizeLocale(mergedCached.locale, "pt-BR"));
          } catch {}
        } else {
          // ✅ NOVO: se cache não tem locale, tenta derivar pelo country do cache
          const code = countryCodeFromCountryName(mergedCached?.country);
          if (code) {
            try {
              setStoredLocale(normalizeLocale(localeFromCountry(code), "pt-BR"));
            } catch {}
          }
        }
      }

      // ✅ revalida em background
      refreshProfile();
      return;
    }

    // ✅ Se NÃO mudou uid, não derruba latch.
    if (uid && profileBooted) {
      refreshProfile();
    }
  }, [loading, user?.id, user?.email, readProfileCache, mergeAuthEmailIntoProfile, refreshProfile, profileBooted]);

  // ✅ Realtime no profiles + polling fallback
  useEffect(() => {
    const uid = user?.id;

    // cleanup anterior
    if (realtimeRef.current) {
      try {
        supabase.removeChannel(realtimeRef.current);
      } catch {}
      realtimeRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (!uid) return;

    pollRef.current = setInterval(() => {
      refreshProfile();
    }, PROFILE_POLL_MS);

    const ch = supabase
      .channel(`profiles:${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${uid}` }, (payload) => {
        const next = payload?.new || null;
        if (next) {
          const authEmail = user?.email || null;
          setProfile((prev) => {
            const merged = prev ? { ...prev, ...next } : next;
            const finalRow = mergeAuthEmailIntoProfile(merged, authEmail);

            // ✅ se veio locale via realtime, alinha storage
            if (finalRow?.locale) {
              try {
                setStoredLocale(normalizeLocale(finalRow.locale, "pt-BR"));
              } catch {}
            } else {
              // ✅ NOVO: se não veio locale, tenta derivar pelo country do profile
              const code = countryCodeFromCountryName(finalRow?.country);
              if (code) {
                try {
                  setStoredLocale(normalizeLocale(localeFromCountry(code), "pt-BR"));
                } catch {}
              }
            }

            // ✅ persiste snapshot bom
            try {
              localStorage.setItem(profileCacheKey(uid), JSON.stringify(finalRow));
            } catch {}
            return finalRow;
          });
        } else {
          refreshProfile();
        }
      })
      .subscribe((status) => {
        if (import.meta.env.DEV) console.log("[TradingAuth] profiles realtime:", status);
      });

    realtimeRef.current = ch;

    return () => {
      if (realtimeRef.current) {
        try {
          supabase.removeChannel(realtimeRef.current);
        } catch {}
        realtimeRef.current = null;
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [user?.id, user?.email, refreshProfile, mergeAuthEmailIntoProfile]);

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  }

  async function signUp(emailOrObj, passwordMaybe, optionsMaybe) {
    const isObj = emailOrObj && typeof emailOrObj === "object";
    const email = isObj ? emailOrObj.email : emailOrObj;
    const password = isObj ? emailOrObj.password : passwordMaybe;

    const options = (isObj ? passwordMaybe : optionsMaybe) || {};
    const autoSignIn = options.autoSignIn !== false;
    const bootstrapProfile = buildProfileBootstrap(options.profile || options.bootstrapProfile || {});

    persistBootstrapPrefs(bootstrapProfile);

    const signUpPayload = {
      email,
      password,
      options: {
        data: {
          ...bootstrapProfile,
        },
      },
    };

    const { data, error } = await supabase.auth.signUp(signUpPayload);
    if (error) return { data: null, error };

    const authUser = data?.user ?? null;
    if (authUser?.id) {
      await upsertProfileByUid(authUser.id, bootstrapProfile, authUser?.email || email || null);
    }

    if (!autoSignIn) return { data, error: null };

    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr) return { data, error: signInErr };

    const signedUser = signInData?.user ?? signInData?.session?.user ?? authUser;
    if (signedUser?.id) {
      await upsertProfileByUid(signedUser.id, bootstrapProfile, signedUser?.email || email || null);
      await refreshProfile();
    }
    return { data: signInData, error: null };
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    return { error };
  }

  async function signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/trade`,
      },
    });

    return { data, error };
  }

  // ✅ NOVO: solicita e-mail de recuperação
  async function requestPasswordReset(email) {
    const redirectTo = `${window.location.origin}/reset-password`;

    const { data, error } = await supabase.auth.resetPasswordForEmail(String(email || "").trim(), {
      redirectTo,
    });

    return { data, error };
  }

  // ✅ NOVO: define nova senha (quando usuário abre o link do e-mail)
  async function updatePassword(newPassword) {
    const { data, error } = await supabase.auth.updateUser({
      password: String(newPassword || ""),
    });

    return { data, error };
  }

  const avatarUrl = useMemo(() => getPublicAvatarUrl(profile?.avatar_path), [profile?.avatar_path]);

  // ✅ agora profileReady NÃO oscila com profileLoading
  const profileReady = useMemo(() => {
    if (loading) return false;
    if (!user?.id) return true;
    return profileBooted === true;
  }, [loading, user?.id, profileBooted]);

  const value = useMemo(() => {
    return {
      session,
      user,
      loading,
      isAuthenticated: Boolean(session),

      signIn,
      signUp,
      signOut,
      signInWithGoogle,

      // ✅ NOVO: reset de senha
      requestPasswordReset,
      updatePassword,

      profile,
      profileLoading,
      profileReady,
      refreshProfile,
      upsertProfile,

      avatarUrl,
    };
  }, [
    session,
    user,
    loading,
    profile,
    profileLoading,
    profileReady,
    refreshProfile,
    upsertProfile,
    avatarUrl,
  ]);

  return <TradingAuthContext.Provider value={value}>{children}</TradingAuthContext.Provider>;
}

export function useTradingAuth() {
  const ctx = useContext(TradingAuthContext);
  if (!ctx) throw new Error("useTradingAuth must be used inside TradingAuthProvider");
  return ctx;
}
