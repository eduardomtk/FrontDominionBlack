import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "./LoginPage.module.css";
import AuthLayout from "../layouts/AuthLayout";
import { useTradingAuth } from "../context/TradingAuthContext";
import { securityTrack } from "@/services/securityTrack";
import { supabaseErrorToUserMessage } from "@/services/supabaseErrorPT";
import { getLocale } from "@/i18n/locale";
import { useTranslation } from "react-i18next";
import useTradingViewport from "@/hooks/useTradingViewport";
import BrandLogo from "@/components/BrandLogo/BrandLogo";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function EyeIcon({ open = false }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.24 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4c-7.682 0-14.347 4.337-17.694 10.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.142 35.091 26.715 36 24 36c-5.219 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.5 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.791 2.237-2.231 4.166-4.084 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, signInWithGoogle } = useTradingAuth();
  const { t } = useTranslation(["common", "login"]);
  const { layoutMode } = useTradingViewport();

  const isMobilePortrait = layoutMode === "mobile-portrait";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);

    const { error } = await signIn(email, password);

    setLoading(false);

    if (error) {
      alert(supabaseErrorToUserMessage(error, getLocale()) || t("login:invalid_credentials"));
      return;
    }

    securityTrack("login", { where: "LoginPage" })
      .then((r) => {
        if (import.meta.env.DEV) console.log("[securityTrack] ok:", r);
      })
      .catch((err) => {
        if (import.meta.env.DEV) {
          console.error("[securityTrack] FAIL:", err?.message || err);
          console.error("[securityTrack] payload:", err?.payload || null);
        }
      });

    try {
      localStorage.setItem("tp_remember", remember ? "1" : "0");
    } catch {}

    navigate("/trade", { replace: true });
  }

  async function handleGoogle() {
    try {
      setGoogleBusy(true);
      const { error } = await signInWithGoogle();
      if (error) {
        alert(supabaseErrorToUserMessage(error, getLocale()) || t("login:google_error"));
      }
    } finally {
      setGoogleBusy(false);
    }
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

        <div className={cn(styles.authContent, isMobilePortrait && styles.authContentMobilePortrait)}>
          <div className={styles.header}>
            <BrandLogo className={styles.dominionLogo} />
            <p className={styles.affiliateSubtitle}>{t("login:subtitle")}</p>
          </div>

          <div className={styles.googleWrap}>
            <button
              type="button"
              className={styles.googleOnlyBtn}
              onClick={handleGoogle}
              disabled={googleBusy || loading}
              aria-label={googleBusy ? t("common:connecting") : t("common:continue_with_google")}
              title={googleBusy ? t("common:connecting") : t("common:continue_with_google")}
            >
              <GoogleLogo />
            </button>

            <div className={styles.divider}>
              <span>{t("common:or")}</span>
            </div>
          </div>

          <form className={styles.form} onSubmit={handleLogin}>
            <div className={styles.field}>
              <label>{t("common:email")}</label>
              <input
                type="email"
                placeholder="seuemail@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className={styles.field}>
              <label>{t("common:password")}</label>

              <div className={styles.passwordWrap}>
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                >
                  <EyeIcon open={showPass} />
                </button>
              </div>
            </div>

            <div className={styles.row}>
              <label className={styles.check}>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span>{t("login:remember_me")}</span>
              </label>

              <Link to="/forgot-password" className={styles.linkBtn}>
                {t("login:forgot_password")}
              </Link>
            </div>

            <button className={styles.primary} type="submit" disabled={loading}>
              {loading ? <span className={styles.loader} /> : t("common:login")}
            </button>

            <div className={styles.bottom}>
              <span>{t("login:no_account")}</span>{" "}
              <Link to="/register" className={styles.bottomLink}>
                {t("login:create_account")}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </AuthLayout>
  );
}