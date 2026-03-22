import { supabase } from "@/services/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// TEMPORÁRIO / MODO LOCAL-ONLY
const ADMIN_SECRET = import.meta.env.VITE_ADMIN_PANEL_SECRET || "";

async function getAuthHeaders() {
  const base = {};

  if (SUPABASE_ANON_KEY) {
    base.apikey = SUPABASE_ANON_KEY;
  }

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    const token = data?.session?.access_token;

    if (token) {
      base.Authorization = `Bearer ${token}`;
    }
  } catch {
    // segue sem bearer se não houver sessão
  }

  // TEMPORÁRIO:
  // Mantém compatibilidade com Edge Functions antigas
  if (ADMIN_SECRET) {
    base["x-admin-secret"] = ADMIN_SECRET;
  }

  return base;
}

function fnUrl(path) {
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL}/functions/v1/${path}`;
}

async function tryJson(url, options = {}) {
  const authHeaders = await getAuthHeaders();

  const hasBody = options.body !== undefined && options.body !== null;
  const contentTypeHeader =
    hasBody && !(options.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {};

  const headers = {
    ...contentTypeHeader,
    ...authHeaders,
    ...(options.headers || {}),
  };

  const res = await fetch(url, {
    ...options,
    headers,
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

    console.error("[ADMIN.API] error", {
      url,
      status: res.status,
      payload,
    });

    const msg =
<<<<<<< HEAD
      payload?.error ||
      payload?.message ||
      payload?.detail ||
      payload?.raw ||
      `HTTP ${res.status}`;
=======
    payload?.db || payload?.error || payload?.message || payload?.detail || payload?.raw || `HTTP ${res.status}`;
>>>>>>> ed20978fa59d8c83f31bfc8e5d66009bb13e31be

    const extra =
      payload?.stage || payload?.request_id
        ? ` (stage=${payload?.stage || "?"} request_id=${payload?.request_id || "?"})`
        : "";

    throw new Error(`${msg}${extra}`);
  }

  return parsed ?? (text || null);
}

// ===== Dashboard/Admin =====
export async function fetchAdminDashboard() {
  const url = fnUrl("admin-dashboard");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");
  return await tryJson(url, { method: "GET" });
}

export async function fetchAdminUsers() {
  const url = fnUrl("admin-users");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");
  return await tryJson(url, { method: "GET" });
}

// ===== Trade History / Trades =====
export async function fetchAdminTradeHistoryAggREAL({ from, to } = {}) {
  let url = fnUrl("admin-trade-history-agg");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  const qs = [];
  if (from) qs.push(`from=${encodeURIComponent(String(from))}`);
  if (to) qs.push(`to=${encodeURIComponent(String(to))}`);
  if (qs.length) url += `?${qs.join("&")}`;

  return await tryJson(url, { method: "GET" });
}

export async function fetchAdminUserTradesREAL({
  user_id,
  cursor = null,
  limit = 200,
} = {}) {
  const url = fnUrl("admin-user-trades");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({
      user_id,
      cursor,
      limit,
      account_type: "REAL",
    }),
  });
}

export async function adjustUserBalance({
  user_id,
  account_type,
  delta,
  reason,
  show_in_history = false,
}) {
  const url = fnUrl("admin-adjust-balance");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({
      user_id,
      account_type,
      delta,
      reason,
      show_in_history: Boolean(show_in_history),
    }),
  });
}

// ===== Usuários (Admin) =====
export async function adminUpdateUser({
  request_id,
  user_id,
  profile_patch,
  auth_email,
}) {
  const url = fnUrl("admin-user-update");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  const rid =
    (request_id && String(request_id).trim()) ||
    `ui_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({
      request_id: rid,
      user_id,
      profile_patch: profile_patch || {},
      auth_email: auth_email
        ? String(auth_email).trim().toLowerCase()
        : null,
    }),
  });
}

export async function adminDeleteUser({
  request_id,
  user_id,
  confirm_text,
}) {
  const url = fnUrl("admin-user-delete");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  const rid =
    (request_id && String(request_id).trim()) ||
    `ui_del_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({
      request_id: rid,
      user_id: String(user_id || "").trim(),
      confirm_text: String(confirm_text || "").trim().toLowerCase(),
    }),
  });
}

// ===== KYC Admin =====
export async function fetchAdminKycRequests({
  status = "pending",
  limit = 200,
  offset = 0,
} = {}) {
  const url = fnUrl(
    `admin-kyc?status=${encodeURIComponent(status)}&limit=${limit}&offset=${offset}`
  );
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");
  return await tryJson(url, { method: "GET" });
}

export async function fetchAdminKycDetail({ request_id }) {
  const url = fnUrl(
    `admin-kyc-detail?request_id=${encodeURIComponent(request_id)}`
  );
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");
  return await tryJson(url, { method: "GET" });
}

export async function reviewAdminKyc({ request_id, action, message }) {
  const url = fnUrl("admin-kyc-review");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({ request_id, action, message }),
  });
}

// ===== SETTINGS + SECURITY BAN =====
export async function fetchAdminSecuritySettings() {
  const url = fnUrl("admin-security-settings");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");
  return await tryJson(url, { method: "GET" });
}

export async function saveAdminSecuritySettings({ request_id, value }) {
  const url = fnUrl("admin-security-settings");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  const rid =
    (request_id && String(request_id).trim()) ||
    `ui_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({
      request_id: rid,
      value: value || {},
    }),
  });
}

export async function fetchAdminMaintenanceSettings() {
  const url = fnUrl("admin-maintenance-settings");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");
  return await tryJson(url, { method: "GET" });
}

export async function saveAdminMaintenanceSettings({ request_id, value }) {
  const url = fnUrl("admin-maintenance-settings");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  const rid =
    (request_id && String(request_id).trim()) ||
    `ui_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({
      request_id: rid,
      value: value || {},
    }),
  });
}

export async function adminBanUser({
  request_id,
  user_id,
  mode,
  minutes,
  reason,
  note,
  block_email = true,
}) {
  const url = fnUrl("admin-user-ban");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  const rid =
    (request_id && String(request_id).trim()) ||
    `ui_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({
      request_id: rid,
      user_id,
      mode,
      minutes,
      reason,
      note: note ? String(note).trim() : null,
      block_email: Boolean(block_email),
    }),
  });
}

// ===== AFILIADOS =====
export async function fetchAdminAffiliatesOverview({
  preset = "7d",
  from = null,
  to = null,
  q = null,
} = {}) {
  let url = fnUrl("admin-affiliates-overview");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  const qs = [];
  if (preset) qs.push(`preset=${encodeURIComponent(String(preset))}`);
  if (from) qs.push(`from=${encodeURIComponent(String(from))}`);
  if (to) qs.push(`to=${encodeURIComponent(String(to))}`);
  if (q) qs.push(`q=${encodeURIComponent(String(q))}`);
  if (qs.length) url += `?${qs.join("&")}`;

  return await tryJson(url, { method: "GET" });
}

export async function fetchAdminAffiliateResolve({ affiliate_id }) {
  const url = fnUrl("admin-affiliate-resolve");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({
      affiliate_id: String(affiliate_id || "").trim(),
    }),
  });
}

export async function adminAffiliateCreate({ email, password }) {
  const url = fnUrl("admin-affiliate-create");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({
      email: String(email || "").trim().toLowerCase(),
      password: String(password || ""),
    }),
  });
}

export async function adminAffiliateAttach({ user_id, affiliate_id }) {
  const url = fnUrl("admin-affiliate-attach");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({
      user_id: String(user_id || "").trim(),
      affiliate_id: String(affiliate_id || "").trim(),
    }),
  });
}

export async function adminAffiliateUpdate({
  affiliate_id,
  payout_pct_percent,
  destination_email,
  status,
}) {
  const url = fnUrl("admin-affiliate-update");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({
      affiliate_id: String(affiliate_id || "").trim(),
      payout_pct_percent,
      destination_email,
      status,
    }),
  });
}

export async function adminAffiliateDelete({
  request_id,
  affiliate_id,
  delete_auth_user = true,
}) {
  const url = fnUrl("admin-affiliate-delete");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  const rid =
    (request_id && String(request_id).trim()) ||
    `ui_del_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({
      request_id: rid,
      affiliate_id: String(affiliate_id || "").trim(),
      delete_auth_user: Boolean(delete_auth_user),
    }),
  });
}

export async function fetchAdminAffiliatePayouts({
  affiliate_id = null,
  status = null,
  from = null,
  to = null,
  limit = 200,
  offset = 0,
} = {}) {
  let url = fnUrl("admin-affiliate-payouts");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  const qs = [];
  if (affiliate_id) qs.push(`affiliate_id=${encodeURIComponent(String(affiliate_id))}`);
  if (status) qs.push(`status=${encodeURIComponent(String(status))}`);
  if (from) qs.push(`from=${encodeURIComponent(String(from))}`);
  if (to) qs.push(`to=${encodeURIComponent(String(to))}`);
  if (Number.isFinite(Number(limit))) qs.push(`limit=${encodeURIComponent(String(limit))}`);
  if (Number.isFinite(Number(offset))) qs.push(`offset=${encodeURIComponent(String(offset))}`);
  if (qs.length) url += `?${qs.join("&")}`;

  return await tryJson(url, { method: "GET" });
}

export async function adminAffiliateRetryPayouts({
  action,
  affiliate_id = null,
  ids = [],
} = {}) {
  const url = fnUrl("admin-affiliate-payouts");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({
      action: String(action || "").trim(),
      affiliate_id: affiliate_id ? String(affiliate_id).trim() : null,
      ids: Array.isArray(ids) ? ids : [],
    }),
  });
}

export async function fetchAdminAffiliatePayoutReport({
  affiliate_id = null,
  period = "weekly",
  from = null,
  to = null,
  tz = "America/Recife",
} = {}) {
  const url = fnUrl("admin-affiliate-report");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({
      affiliate_id: affiliate_id ? String(affiliate_id).trim() : null,
      period: String(period || "weekly").trim(),
      from: from ? String(from) : null,
      to: to ? String(to) : null,
      tz: String(tz || "America/Recife"),
    }),
  });
}

export async function fetchAdminAffiliateReferrals({
  affiliate_id,
  limit = 500,
  offset = 0,
} = {}) {
  let url = fnUrl("admin-affiliate-referrals");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  const qs = [];
  if (affiliate_id) qs.push(`affiliate_id=${encodeURIComponent(String(affiliate_id))}`);
  if (Number.isFinite(Number(limit))) qs.push(`limit=${encodeURIComponent(String(limit))}`);
  if (Number.isFinite(Number(offset))) qs.push(`offset=${encodeURIComponent(String(offset))}`);
  if (qs.length) url += `?${qs.join("&")}`;

  return await tryJson(url, { method: "GET" });
}

export async function fetchAdminAffiliateWeeklyPreview({
  affiliate_id,
  week_end,
} = {}) {
  let url = fnUrl("admin-affiliate-payouts");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  const qs = [];
  qs.push("mode=weekly_preview");
  if (affiliate_id) qs.push(`affiliate_id=${encodeURIComponent(String(affiliate_id))}`);
  if (week_end) qs.push(`week_end=${encodeURIComponent(String(week_end))}`);

  url += `?${qs.join("&")}`;
  return await tryJson(url, { method: "GET" });
}

export async function adminAffiliateWeeklyPay({
  affiliate_id,
  week_end,
  request_id = null,
} = {}) {
  const url = fnUrl("admin-affiliate-payouts");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  const rid =
    (request_id && String(request_id).trim()) ||
    `weekly_pay_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({
      action: "weekly_pay",
      affiliate_id: affiliate_id ? String(affiliate_id).trim() : null,
      week_end: week_end ? String(week_end).trim() : null,
      request_id: rid,
    }),
  });
}

export async function fetchAdminAffiliateWeeklyPayouts({
  affiliate_id = null,
  status = null,
  from = null,
  to = null,
  limit = 200,
  offset = 0,
} = {}) {
  let url = fnUrl("admin-affiliate-payouts");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  const qs = [];
  qs.push("mode=weekly_list");
  if (affiliate_id) qs.push(`affiliate_id=${encodeURIComponent(String(affiliate_id))}`);
  if (status) qs.push(`status=${encodeURIComponent(String(status))}`);
  if (from) qs.push(`from=${encodeURIComponent(String(from))}`);
  if (to) qs.push(`to=${encodeURIComponent(String(to))}`);
  if (Number.isFinite(Number(limit))) qs.push(`limit=${encodeURIComponent(String(limit))}`);
  if (Number.isFinite(Number(offset))) qs.push(`offset=${encodeURIComponent(String(offset))}`);

  url += `?${qs.join("&")}`;
  return await tryJson(url, { method: "GET" });
}

// ===== Ranking =====
export async function fetchAdminRankingConfig() {
  const url = fnUrl("admin-ranking-config");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");
  const res = await tryJson(url, { method: "GET" });
  return res?.data ?? null;
}

export async function saveAdminRankingConfig(patch) {
  const url = fnUrl("admin-ranking-config");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  const res = await tryJson(url, {
    method: "POST",
    body: JSON.stringify(patch || {}),
  });

  return res?.data ?? null;
}

export async function adminRunRankingGenerateToday(payload = null) {
  const url = fnUrl("ranking-generate-today");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");

  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export async function adminResetRankingTodayFn() {
  const url = fnUrl("admin-ranking-reset-today");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");
  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function adminSeedRankingFakesFn() {
  const url = fnUrl("admin-ranking-seed-fakes");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");
  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// ===== Support (Admin) =====
export async function fetchAdminSupportThreads({
  status = "all",
  q = "",
  limit = 50,
} = {}) {
  let url = fnUrl(
    `admin-support-threads?status=${encodeURIComponent(status)}&limit=${Number(limit || 50)}`
  );
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");
  if (q) url += `&q=${encodeURIComponent(String(q))}`;
  return await tryJson(url, { method: "GET" });
}

export async function fetchAdminSupportThread({ thread_id }) {
  const url = fnUrl(
    `admin-support-thread?thread_id=${encodeURIComponent(String(thread_id || ""))}`
  );
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");
  return await tryJson(url, { method: "GET" });
}

export async function sendAdminSupportReply({
  thread_id,
  template_key,
  subject,
  message_text,
}) {
  const url = fnUrl("admin-support-send");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");
  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({
      thread_id,
      template_key,
      subject,
      message_text,
    }),
  });
}

export async function updateAdminSupportThreadStatus({
  thread_id,
  status,
}) {
  const url = fnUrl("admin-support-thread-status");
  if (!url) throw new Error("VITE_SUPABASE_URL não definido no .env");
  return await tryJson(url, {
    method: "POST",
    body: JSON.stringify({
      thread_id,
      status,
    }),
  });
}