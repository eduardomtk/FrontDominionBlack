// src/services/maintenance.api.js
import { supabase } from "@/services/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const PUBLIC_FN = import.meta.env.VITE_MAINTENANCE_PUBLIC_FN || "public-maintenance-settings";

function fnUrl(path) {
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL}/functions/v1/${path}`;
}

async function tryJson(url, options = {}) {
  // ✅ user normal: pode ter token, mas NÃO manda x-admin-secret
  let authHeaders = {};
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    authHeaders = {};
  }

  const hasBody = options.body !== undefined && options.body !== null;
  const contentTypeHeader =
    hasBody && !(options.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {};

  const res = await fetch(url, {
    ...options,
    headers: {
      ...contentTypeHeader,
      ...authHeaders,
      ...(options.headers || {}),
    },
  });

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
    throw new Error(msg);
  }

  return parsed ?? (text || null);
}

export async function fetchPublicMaintenanceSettings() {
  const url = fnUrl(PUBLIC_FN);
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");
  return await tryJson(url, { method: "GET" });
}
