// src/pages/AuthCallback.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/services/supabaseClient";
import BrandLogo from "@/components/BrandLogo/BrandLogo";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Finalizando login...");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // Se estiver usando PKCE, isso finaliza a sessão com o ?code=...
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        if (!alive) return;
        setMsg("Login confirmado. Redirecionando...");
        navigate("/trade", { replace: true });
      } catch (e) {
        if (!alive) return;
        setMsg(`Falha no login: ${String(e?.message || e)}`);
        // fallback
        setTimeout(() => navigate("/login", { replace: true }), 900);
      }
    })();

    return () => {
      alive = false;
    };
  }, [navigate]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#e5e7eb", background: "#070b12" }}>
      <div style={{ width: "min(520px, 92vw)", padding: 18, borderRadius: 14, border: "1px solid #1f2937", background: "#0b1016" }}>
        <div style={{ display: "inline-flex", alignItems: "center", fontSize: 18 }}><BrandLogo /></div>
        <div style={{ marginTop: 10, color: "#9aa4b2", fontWeight: 800 }}>{msg}</div>
      </div>
    </div>
  );
}
