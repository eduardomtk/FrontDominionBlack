// src/i18n/i18n.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { resources } from "./resources";
import { getLocale } from "./locale";

const initialLng = getLocale() || "pt-BR";

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: initialLng,
    fallbackLng: "en-US",

    ns: [
      "common",
      "register",
      "login",
      "landing",
      "trade",
      "header",
      "sidebar",
      "wallet",
      "profile",
      "profilePanel",
      "chartFooterBar",
      "bottomStatusBar",
      "tradeHistory",
      "forgotPassword",
      "resetPassword",
      "timeframePanel",
      "pairSelectorPanel",
      "indicatorsPanel",
      "drawingToolsPanel",
      "chartTypePanel",
      "activeTradesPanel",
      "chartWorkspace",
      "indicatorSettingsModal",
      "drawingQuickToolbar",
      "indicators" // ✅ NOVO
    ],
    defaultNS: "common",

    interpolation: {
      escapeValue: false,
    },

    returnEmptyString: false,

    react: {
      useSuspense: false,
    },
  });
}

export default i18n;