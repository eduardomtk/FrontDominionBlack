// src/services/supabaseErrorPT.js

function norm(s) {
  return String(s || "").trim();
}

// ✅ traduções por "message" (mais comum) e por "status" quando necessário
const PT_BR = [
  { match: /invalid login credentials/i, text: "E-mail ou senha inválidos." },
  { match: /email not confirmed/i, text: "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada." },
  { match: /user already registered/i, text: "Este e-mail já está cadastrado." },
  { match: /signup is disabled/i, text: "Cadastro desativado no momento." },
  { match: /password should be at least/i, text: "A senha é muito curta. Use pelo menos 6 caracteres." },
  { match: /token has expired/i, text: "O link expirou. Solicite um novo." },
  { match: /invalid or expired/i, text: "Link inválido ou expirado. Solicite um novo." },
  { match: /too many requests/i, text: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
  { match: /email rate limit exceeded/i, text: "Limite de envio atingido. Aguarde e tente novamente." },
  { match: /network|fetch/i, text: "Falha de conexão. Verifique sua internet e tente novamente." },
];

export function supabaseErrorToUserMessage(error, locale = "pt-BR") {
  if (!error) return null;

  // Supabase geralmente fornece error.message
  const msg = norm(error.message || error.error_description || error.error || "");

  if (!msg) return "Ocorreu um erro. Tente novamente.";

  // Se no futuro você tiver en-US, es-ES etc, pode trocar a tabela por locale aqui.
  if (locale === "pt-BR") {
    for (const r of PT_BR) {
      if (r.match.test(msg)) return r.text;
    }
  }

  // fallback: não expor stack/objeto, mas pode exibir msg se quiser
  return msg;
}
