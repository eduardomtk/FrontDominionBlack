import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "./ResetPasswordPage.module.css";
import AuthLayout from "../layouts/AuthLayout";
import { useTradingAuth } from "../context/TradingAuthContext";
import { supabase } from "../services/supabaseClient";

import { supabaseErrorToUserMessage } from "@/services/supabaseErrorPT";
import { getLocale } from "@/i18n/locale";
import { useTranslation } from "react-i18next";
import useTradingViewport from "@/hooks/useTradingViewport";
import BrandLogo from "@/components/BrandLogo/BrandLogo";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function DominionBrand() {
  return <BrandLogo className={styles.authBrandLogo} />;
}

export default function ResetPasswordPage() {
  const { t } = useTranslation(["common", "resetPassword"]);
  const navigate = useNavigate();
  const { updatePassword } = useTradingAuth();
  const { layoutMode } = useTradingViewport();

  const isMobilePortrait = layoutMode === "mobile-portrait";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;

    async function boot() {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setReady(Boolean(data?.session));
    }

    boot();

    return () => {
      alive = false;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();

    if (password.length < 6) {
      alert(t("resetPassword:messages.password_min_length"));
      return;
    }

    if (password !== confirm) {
      alert(t("resetPassword:messages.password_mismatch"));
      return;
    }

    setLoading(true);
    const { error } = await updatePassword(password);
    setLoading(false);

    if (error) {
      alert(
        supabaseErrorToUserMessage(error, getLocale()) ||
          t("resetPassword:messages.error")
      );
      return;
    }

    alert(t("resetPassword:messages.success"));
    navigate("/login", { replace: true });
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
            <DominionBrand />
            <p className={styles.affiliateSubtitle}>{t("resetPassword:subtitle")}</p>
          </div>

          {!ready ? (
            <div className={styles.noticeWrap}>
              <div className={styles.notice}>
                <p className={styles.noticeText}>
                  {t("resetPassword:messages.invalid_link")}
                </p>

                <Link to="/forgot-password" className={styles.noticeLink}>
                  {t("resetPassword:links.request_new")}
                </Link>
              </div>

              <div className={styles.supportBox}>
                <div className={styles.supportTitle}>Não encontrou sua conta?</div>
                <div className={styles.supportText}>
                  Se você não lembrar o e-mail cadastrado, entre em contato com o suporte:
                </div>
                <a
                  className={styles.supportLink}
                  href="mailto:support@dominionblack.com"
                >
                  support@dominionblack.com
                </a>
              </div>

              <div className={styles.bottomAlt}>
                <Link to="/login" className={styles.bottomLink}>
                  {t("resetPassword:links.back_to_login")}
                </Link>
              </div>
            </div>
          ) : (
            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.formMain}>
                <div className={styles.field}>
                  <label>{t("resetPassword:form.new_password_label")}</label>
                  <input
                    type="password"
                    placeholder={t("resetPassword:form.new_password_placeholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>

                <div className={styles.field}>
                  <label>{t("resetPassword:form.confirm_password_label")}</label>
                  <input
                    type="password"
                    placeholder={t("resetPassword:form.confirm_password_placeholder")}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>

                <button className={styles.primary} type="submit" disabled={loading}>
                  {loading ? (
                    <span className={styles.loader} />
                  ) : (
                    t("resetPassword:form.submit")
                  )}
                </button>
              </div>

              <div className={styles.supportBox}>
                <div className={styles.supportTitle}>Não encontrou sua conta?</div>
                <div className={styles.supportText}>
                  Se você não lembrar o e-mail cadastrado, entre em contato com o suporte:
                </div>
                <a
                  className={styles.supportLink}
                  href="mailto:support@dominionblack.com"
                >
                  support@dominionblack.com
                </a>
              </div>

              <div className={styles.bottom}>
                <Link to="/login" className={styles.bottomLink}>
                  {t("resetPassword:links.back_to_login")}
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}