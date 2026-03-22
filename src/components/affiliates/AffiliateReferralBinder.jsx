import { useEffect, useRef } from "react";
import { supabase } from "@/services/supabaseClient";

const AFF_REF_LS_KEY = "tp_aff_ref_code";

export default function AffiliateReferralBinder() {
  const processingRef = useRef(false);

  useEffect(() => {
    const bindReferral = async (session) => {
      if (!session?.user?.id) return;
      if (processingRef.current) return;

      processingRef.current = true;

      const userId = session.user.id;
      const ref = localStorage.getItem(AFF_REF_LS_KEY);

      if (!ref) {
        processingRef.current = false;
        return;
      }

      console.log("🔎 Tentando vincular referral:", ref);

      // já existe?
      const { data: existing } = await supabase
        .from("affiliate_referrals")
        .select("id")
        .eq("referred_user_id", userId)
        .maybeSingle();

      if (existing?.id) {
        console.log("ℹ️ Referral já existe");
        localStorage.removeItem(AFF_REF_LS_KEY);
        processingRef.current = false;
        return;
      }

      // resolve código
      const { data: codeRow } = await supabase
        .from("affiliate_codes")
        .select("affiliate_id")
        .eq("code", ref)
        .maybeSingle();

      if (!codeRow?.affiliate_id) {
        console.log("❌ Código inválido");
        processingRef.current = false;
        return;
      }

      if (codeRow.affiliate_id === userId) {
        console.log("⚠️ Auto-ref bloqueado");
        processingRef.current = false;
        return;
      }

      const { error } = await supabase.from("affiliate_referrals").insert([
        {
          affiliate_id: codeRow.affiliate_id,
          referred_user_id: userId,
          ref_code: ref,
        },
      ]);

      if (error) {
        console.error("❌ Erro ao inserir:", error);
        processingRef.current = false;
        return;
      }

      console.log("✅ Referral criado");
      localStorage.removeItem(AFF_REF_LS_KEY);
      processingRef.current = false;
    };

    // roda se já estiver logado
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) bindReferral(data.session);
    });

    // escuta mudanças de login
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) bindReferral(session);
      }
    );

    return () => {
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  return null;
}