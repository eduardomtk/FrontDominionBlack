import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

<<<<<<< HEAD
=======

// ===============================
// AUTENTICAÇÃO / CONTA
// ===============================
import { AuthProvider } from "./context/AuthContext";
import { TradingAuthProvider } from "./context/TradingAuthContext";
import { AccountProvider } from "./context/AccountContext";
import { BalanceProvider } from "./context/BalanceContext";

// ✅ LOCALE
import { LocaleProvider } from "./context/LocaleContext";

// ✅ i18n bridge
import I18nBridge from "./i18n/I18nBridge";

// ✅ ADMIN AUTH (mock)
>>>>>>> ed20978fa59d8c83f31bfc8e5d66009bb13e31be
import { AdminAuthProvider } from "./admin/context/AdminAuthContext";
import { TournamentProvider } from "./context/TournamentContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AdminAuthProvider>
      <TournamentProvider>
        <App />
      </TournamentProvider>
    </AdminAuthProvider>
  </React.StrictMode>
);