// src/admin/services/markets.api.js
import { supabase } from "@/services/supabaseClient";

const ADMIN_MARKETS_TOKEN = import.meta.env.VITE_ADMIN_MARKETS_TOKEN || "";

function getFunctionsUrl() {
  const url = supabase?.supabaseUrl;
  if (!url) throw new Error("supabaseUrl não disponível");
  return `${url}/functions/v1/admin-markets-upsert`;
}

export async function adminUpsertMarkets(rows) {
  if (!ADMIN_MARKETS_TOKEN) {
    throw new Error("VITE_ADMIN_MARKETS_TOKEN está vazio no .env (reinicie o Vite).");
  }

  const endpoint = getFunctionsUrl();
  const anonKey = supabase?.supabaseKey;
  if (!anonKey) throw new Error("supabaseKey não disponível");

  // ✅ pega JWT REAL do Supabase (se verify_jwt=true, isso é obrigatório)
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) {
    throw new Error(sessionErr.message || "Falha ao obter sessão do Supabase");
  }

  const accessToken = sessionData?.session?.access_token || "";
  if (!accessToken) {
    throw new Error("Sem sessão Supabase: faça login no app (Supabase Auth) antes de salvar mercados.");
  }

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`,
      "x-admin-token": ADMIN_MARKETS_TOKEN,
    },
    body: JSON.stringify({ rows }),
  });

  const text = await resp.text().catch(() => "");
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!resp.ok) {
    throw new Error(data?.error || data?.message || data?.raw || `HTTP ${resp.status}`);
  }

  return data;
}
