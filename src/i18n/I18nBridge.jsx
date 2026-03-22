// src/i18n/I18nBridge.jsx
import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import { useLocale } from "@/context/LocaleContext";

function normalizeLng(lng) {
  const raw = String(lng || "").trim();
  if (!raw) return "pt-BR";

  // tolerância: en_GB -> en-GB
  const s = raw.replace(/_/g, "-");

  // mantém como está se já vier no padrão correto
  return s || "pt-BR";
}

export default function I18nBridge({ children }) {
  const { locale } = useLocale();

  useEffect(() => {
    const desired = normalizeLng(locale);
    if (i18n.language !== desired) {
      i18n.changeLanguage(desired);
    }
  }, [locale]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
