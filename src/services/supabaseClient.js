import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL ou ANON KEY não definidos no .env");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// ✅ mantém teu log, mas só em DEV (não vaza em produção)
if (import.meta.env.DEV) {
  console.log("SUPABASE URL:", import.meta.env.VITE_SUPABASE_URL);
}

/**
 * ✅ Avatar padrão (você vai colocar o arquivo em /public)
 * Ex.: public/default-avatar.jpg
 */
export const DEFAULT_AVATAR_URL = "/default-avatar.jpg";

/**
 * ✅ Helper: retorna URL pública do avatar (se bucket for público).
 * Se você deixar o bucket privado, a gente troca isso para signed URL depois,
 * sem mexer em layout, só na lógica aqui.
 */
export function getPublicAvatarUrl(avatarPath) {
  if (!avatarPath) return DEFAULT_AVATAR_URL;

  const { data } = supabase.storage.from("avatars").getPublicUrl(avatarPath);
  const url = data?.publicUrl;
  return url || DEFAULT_AVATAR_URL;
}
