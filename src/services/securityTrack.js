// src/services/securityTrack.js
import { supabase } from "@/services/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function fnUrl(path) {
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL}/functions/v1/${path}`;
}

async function tryJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text().catch(() => "");
  let parsed = null;

  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const payload = parsed || { raw: text || `HTTP ${res.status}` };
    const msg =
      payload?.error ||
      payload?.message ||
      payload?.detail ||
      payload?.raw ||
      `HTTP ${res.status}`;

    const extra =
      payload?.stage || payload?.request_id
        ? ` (stage=${payload?.stage || "?"} request_id=${payload?.request_id || "?"})`
        : "";

    const err = new Error(`${msg}${extra}`);
    err.payload = payload;
    throw err;
  }

  return parsed ?? (text || null);
}

/**
 * securityTrack(event_type, meta?)
 * - Envia Authorization: Bearer <access_token>
 * - Não quebra o fluxo do app: você decide se vai await ou fire-and-forget
 */
export async function securityTrack(event_type = "heartbeat", meta = {}) {
  const url = fnUrl("security-track");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  if (!token) {
    // Sem sessão => sem rastrear (não é erro fatal)
    return { ok: false, skipped: true, reason: "no_session_token" };
  }

  return await tryJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      event_type: String(event_type || "heartbeat").slice(0, 32),
      meta: meta && typeof meta === "object" ? meta : {},
    }),
  });
}
