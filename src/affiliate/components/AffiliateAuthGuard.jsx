// src/affiliate/components/AffiliateAuthGuard.jsx
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/services/supabaseClient";

// ✅ usa o MESMO loading global (visual idêntico)
import LoadingScreen from "@/components/LoadingScreen";

function isActiveStatus(status) {
  const s = String(status || "").trim().toUpperCase();
  return s === "ACTIVE" || s === "ATIVO";
}

async function checkAffiliateAccess(userId) {
  // ✅ Autoridade: affiliate_settings
  try {
    const { data, error } = await supabase
      .from("affiliate_settings")
      .select("affiliate_id,status")
      .eq("affiliate_id", userId)
      .maybeSingle();

    if (!error && data?.affiliate_id && isActiveStatus(data.status)) {
      return { ok: true };
    }
  } catch {}

  return { ok: false };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withTimeout(promise, ms, label = "timeout") {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(label)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}

export default function AffiliateAuthGuard({ children }) {
  const location = useLocation();

  // ✅ UX: mostra loading por pelo menos 1.5s (ajusta para 2000 se quiser)
  const MIN_LOADING_MS = 1500;

  // ✅ Segurança: nunca trava infinito
  const HARD_TIMEOUT_MS = 8000;

  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let alive = true;

    async function run() {
      const t0 = Date.now();
      setChecking(true);

      try {
        // ✅ 1) sessão (com timeout)
        const sessRes = await withTimeout(
          supabase.auth.getSession(),
          HARD_TIMEOUT_MS,
          "getSession timeout"
        );
        if (!alive) return;

        const session = sessRes?.data?.session || null;
        const uid = session?.user?.id || null;

        if (!uid) {
          setAllowed(false);
          return;
        }

        // ✅ 2) valida afiliado ativo (com timeout)
        const access = await withTimeout(
          checkAffiliateAccess(uid),
          HARD_TIMEOUT_MS,
          "checkAffiliateAccess timeout"
        );
        if (!alive) return;

        setAllowed(!!access?.ok);
      } catch (err) {
        // 🔒 em erro/timeout, evita estado zumbi
        try {
          await supabase.auth.signOut();
        } catch {}

        setAllowed(false);

        if (import.meta.env.DEV) {
          console.error("[AffiliateAuthGuard] FAIL:", err?.message || err);
        }
      } finally {
        // ✅ mínimo de tempo na tela
        const elapsed = Date.now() - t0;
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
        if (remaining) await sleep(remaining);

        if (!alive) return;
        setChecking(false);
      }
    }

    run();

    return () => {
      alive = false;
    };
  }, []);

  // ✅ Loading bonito (igual global)
  if (checking) {
    return <LoadingScreen />;
  }

  if (!allowed) {
    return (
      <Navigate
        to="/affiliate/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return children;
}