import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "./ForgotPasswordPage.module.css";
import AuthLayout from "../layouts/AuthLayout";
import { useTradingAuth } from "../context/TradingAuthContext";

import { supabaseErrorToUserMessage } from "@/services/supabaseErrorPT";
import { getLocale } from "@/i18n/locale";
import { useTranslation } from "react-i18next";
import useTradingViewport from "@/hooks/useTradingViewport";
import BrandLogo from "@/components/BrandLogo/BrandLogo";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function ForgotPasswordPage() {
  const { t } = useTranslation(["common", "forgotPassword"]);
  const { requestPasswordReset } = useTradingAuth();
  const { layoutMode } = useTradingViewport();

  const isMobilePortrait = layoutMode === "mobile-portrait";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    const cleanEmail = String(email || "").trim();
    const { error } = await requestPasswordReset(cleanEmail);

    setLoading(false);

    if (error) {
      alert(
        supabaseErrorToUserMessage(error, getLocale()) ||
          t("forgotPassword:messages.error")
      );
      return;
    }

    alert(t("forgotPassword:messages.success"));
  }

  return (
    <AuthLayout
      className={cn(
        styles.compactAuth,
        isMobilePortrait && styles.mobilePortraitLayout
      )}
    >
      <div className={styles.authStage}>
        <div className={styles.authBackdrop} aria-hidden="true" />

        <div
          className={cn(
            styles.authContent,
            isMobilePortrait && styles.authContentMobilePortrait
          )}
        >
          <div className={styles.header}>
            <BrandLogo className={styles.dominionLogo} />
            <p className={styles.affiliateSubtitle}>{t("forgotPassword:subtitle")}</p>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.formMain}>
              <div className={styles.field}>
                <label>{t("forgotPassword:form.email_label")}</label>
                <input
                  type="email"
                  placeholder={t("forgotPassword:form.email_placeholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <button className={styles.primary} type="submit" disabled={loading}>
                {loading ? <span className={styles.loader} /> : t("forgotPassword:form.submit")}
              </button>

              <div className={styles.bottom}>
                <Link to="/login" className={styles.bottomLink}>
                  {t("forgotPassword:links.back_to_login")}
                </Link>
              </div>
            </div>

            <div className={styles.supportBox}>
              <div className={styles.supportTitle}>Não lembra o e-mail?</div>
              <div className={styles.supportText}>
                Se preferir, entre em contato com o suporte e nós ajudaremos você a recuperar o acesso.
              </div>
              <a
                className={styles.supportLink}
                href="mailto:support@dominionblack.com"
              >
                support@dominionblack.com
              </a>
            </div>
          </form>
        </div>
      </div>
    </AuthLayout>
  );
}