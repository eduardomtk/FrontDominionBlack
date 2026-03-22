import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "./RegisterPage.module.css";
import AuthLayout from "../layouts/AuthLayout";
import { useTradingAuth } from "../context/TradingAuthContext";
import { supabaseErrorToUserMessage } from "@/services/supabaseErrorPT";
import { getLocale, setLocale as setStoredLocale, localeFromCountry } from "@/i18n/locale";
import { useLocale } from "@/context/LocaleContext";
import { useTranslation } from "react-i18next";
import useTradingViewport from "@/hooks/useTradingViewport";

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

/**
 * ✅ Dominion Black (padrão premium)
 */
function DominionBrand() {
  return (
    <div className={styles.dominionLogo} aria-label="Dominion Black">
      <span className={styles.dominionMain}>
        <span className={styles.dominionDWrap}>
          <span className={styles.dominionD}>D</span>

          <span className={styles.dominionCrownContainer} aria-hidden="true">
            <span className={styles.dominionParticles} />
            <span className={styles.dominionCrown}>
              <span className={`${styles.dominionDiamond} ${styles.dominionBlue}`} />
              <span className={`${styles.dominionDiamond} ${styles.dominionRed}`} />
              <span className={`${styles.dominionDiamond} ${styles.dominionGreen}`} />
            </span>
          </span>
        </span>

        <span className={styles.dominionRest}>
          om<span className={styles.iFix}>i</span>n<span className={styles.iFix}>i</span>on
        </span>
      </span>

      <span className={styles.dominionAccent}>Black</span>
    </div>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CustomSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Selecionar",
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);

  const selectedOption = options.find((item) => item.code === value);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (!rootRef.current?.contains(document.activeElement)) return;

      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (open && listRef.current) {
      const selectedEl = listRef.current.querySelector('[data-selected="true"]');
      selectedEl?.scrollIntoView({ block: "nearest" });
    }
  }, [open]);

  const handleToggle = () => setOpen((prev) => !prev);

  const handleSelect = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div className={styles.field}>
      <label>{label}</label>

      <div
        className={cn(styles.customSelect, open && styles.customSelectOpen)}
        ref={rootRef}
      >
        <button
          ref={buttonRef}
          type="button"
          className={styles.customSelectTrigger}
          onClick={handleToggle}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={styles.customSelectValue}>
            {selectedOption?.name || placeholder}
          </span>

          <span className={styles.customSelectChevron} aria-hidden="true">
            <ChevronDownIcon />
          </span>
        </button>

        {open && (
          <div className={styles.customSelectDropdown}>
            <ul
              ref={listRef}
              className={styles.customSelectList}
              role="listbox"
              aria-label={label}
            >
              {options.map((item) => {
                const isSelected = item.code === value;

                return (
                  <li key={item.code} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      className={cn(
                        styles.customSelectOption,
                        isSelected && styles.customSelectOptionActive
                      )}
                      data-selected={isSelected ? "true" : "false"}
                      onClick={() => handleSelect(item.code)}
                    >
                      {item.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const { signUp, signIn, signInWithGoogle, upsertProfile } = useTradingAuth();
  const { t } = useTranslation(["common", "register"]);
  const { setLocale } = useLocale();
  const { layoutMode } = useTradingViewport();

  const isMobilePortrait = layoutMode === "mobile-portrait";

  const countries = useMemo(
    () => [
      { code: "BR", name: "Brasil" },
      { code: "US", name: "Estados Unidos" },
      { code: "CA", name: "Canadá" },
      { code: "MX", name: "México" },
      { code: "AR", name: "Argentina" },
      { code: "CL", name: "Chile" },
      { code: "CO", name: "Colômbia" },
      { code: "PE", name: "Peru" },
      { code: "PT", name: "Portugal" },
      { code: "ES", name: "Espanha" },
      { code: "FR", name: "França" },
      { code: "DE", name: "Alemanha" },
      { code: "IT", name: "Itália" },
      { code: "GB", name: "Reino Unido" },
      { code: "IE", name: "Irlanda" },
      { code: "AE", name: "Emirados Árabes Unidos" },
      { code: "IN", name: "Índia" },
      { code: "ID", name: "Indonésia" },
      { code: "PH", name: "Filipinas" },
      { code: "MY", name: "Malásia" },
      { code: "TH", name: "Tailândia" },
      { code: "VN", name: "Vietnã" },
      { code: "SG", name: "Singapura" },
      { code: "HK", name: "Hong Kong" },
      { code: "AU", name: "Austrália" },
      { code: "NZ", name: "Nova Zelândia" },
    ],
    []
  );

  const currencies = useMemo(
    () => [
      { code: "BRL", name: "BRL (R$)" },
      { code: "USD", name: "USD ($)" },
      { code: "EUR", name: "EUR (€)" },
    ],
    []
  );

  const [country, setCountry] = useState("BR");
  const [currency, setCurrency] = useState("BRL");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [agree18, setAgree18] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const handleOpenTerms = () => {
    navigate("/", { replace: false });
  };

  async function handleRegister(e) {
    e.preventDefault();

    if (password !== confirm) {
      alert(t("register:password_mismatch"));
      return;
    }

    if (!agree18 || !agreeTerms) {
      alert(t("register:must_accept_terms"));
      return;
    }

    const countryName = countries.find((c) => c.code === country)?.name || "Brasil";
    const locale = localeFromCountry(country);

    setLoading(true);
    const { error } = await signUp(email, password, { autoSignIn: false });
    setLoading(false);

    if (error) {
      alert(supabaseErrorToUserMessage(error, getLocale()) || t("common:error_generic"));
      return;
    }

    try {
      localStorage.setItem("tp_prefs", JSON.stringify({ country, currency }));
    } catch {}

    try {
      await setLocale(locale, { persistProfile: false });
    } catch {
      try {
        setStoredLocale(locale);
      } catch {}
    }

    alert(t("register:success_created"));

    setLoading(true);
    const { error: signInErr } = await signIn(email, password);
    setLoading(false);

    if (signInErr) {
      alert(
        supabaseErrorToUserMessage(signInErr, getLocale()) ||
          t("register:created_but_login_failed")
      );
      navigate("/login", { replace: true });
      return;
    }

    try {
      await upsertProfile?.({
        country: countryName,
        currency,
        locale,
      });
    } catch {}

    navigate("/trade", { replace: true });
  }

  async function handleGoogle() {
    try {
      setGoogleBusy(true);

      try {
        localStorage.setItem("tp_prefs", JSON.stringify({ country, currency }));
      } catch {}

      try {
        await setLocale(localeFromCountry(country), { persistProfile: false });
      } catch {
        try {
          setStoredLocale(localeFromCountry(country));
        } catch {}
      }

      const { error } = await signInWithGoogle();
      if (error) {
        alert(supabaseErrorToUserMessage(error, getLocale()) || t("common:error_generic"));
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
      <div className={styles.pageWrap}>
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
              <div className={styles.subtitle}>Crie sua conta para operar</div>
            </div>

            <div className={styles.googleWrap}>
              <button
                type="button"
                className={styles.googleOnlyBtn}
                onClick={handleGoogle}
                disabled={googleBusy || loading}
                aria-label={
                  googleBusy ? t("common:connecting") : t("common:continue_with_google")
                }
                title={
                  googleBusy ? t("common:connecting") : t("common:continue_with_google")
                }
              >
                <GoogleLogo />
              </button>

              <div className={styles.divider}>
                <span>{t("common:or")}</span>
              </div>
            </div>

            <form className={styles.form} onSubmit={handleRegister}>
              <div className={styles.grid2}>
                <CustomSelect
                  label={t("common:country")}
                  value={country}
                  onChange={setCountry}
                  options={countries}
                  placeholder={t("common:country")}
                />

                <CustomSelect
                  label={t("common:currency")}
                  value={currency}
                  onChange={setCurrency}
                  options={currencies}
                  placeholder={t("common:currency")}
                />
              </div>

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
                    type={showPasswords ? "text" : "password"}
                    placeholder={t("common:password")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowPasswords((v) => !v)}
                    aria-label={showPasswords ? "Ocultar senha" : "Mostrar senha"}
                  >
                    <EyeIcon open={showPasswords} />
                  </button>
                </div>
              </div>

              <div className={styles.field}>
                <label>{t("common:confirm_password")}</label>

                <div className={styles.passwordWrap}>
                  <input
                    type={showPasswords ? "text" : "password"}
                    placeholder={t("common:confirm_password")}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowPasswords((v) => !v)}
                    aria-label={showPasswords ? "Ocultar senha" : "Mostrar senha"}
                  >
                    <EyeIcon open={showPasswords} />
                  </button>
                </div>
              </div>

              <div className={styles.checks}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={agree18}
                    onChange={(e) => setAgree18(e.target.checked)}
                  />
                  <span>{t("register:agree_18")}</span>
                </label>

                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                  />
                  <span>
                    {t("register:agree_terms_prefix")}{" "}
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={handleOpenTerms}
                    >
                      {t("register:agree_terms_btn")}
                    </button>
                    .
                  </span>
                </label>
              </div>

              <button className={styles.primary} type="submit" disabled={loading}>
                {loading ? (
                  <span className={styles.loader}></span>
                ) : (
                  t("common:create_account")
                )}
              </button>

              <div className={styles.bottom}>
                <span>{t("common:already_have_account")}</span>{" "}
                <Link to="/login" className={styles.bottomLink}>
                  {t("common:login")}
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}