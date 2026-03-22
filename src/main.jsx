import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";


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
import { AdminAuthProvider } from "./admin/context/AdminAuthContext";

// ===============================
// TRADING
// ===============================
import { TradeProvider } from "./context/TradeContext";
import { TournamentProvider } from "./context/TournamentContext";

// ===============================
// UI DE PAR / TIMEFRAME
// ===============================
import { PairUIProvider } from "./context/PairUIContext";

// ===============================
// ENGINES
// ===============================
import { CandleEngineProvider } from "./context/CandleContext";
import { TradeEngineProvider } from "./engine/TradeEngineProvider";

// ===============================
// CHART VIEW (tipo de gráfico)
// ===============================
import ChartViewProviderWithAuth from "./context/ChartViewProviderWithAuth";

// ===============================
// INDICADORES
// ===============================
import { IndicatorsProvider } from "./context/IndicatorsContext";

// ===============================
// PANE MANAGER
// ===============================
import { PaneManagerProvider } from "./components/Chart/panes/PaneManagerContext";

// ===============================
// ✅ GLOBAL UI LOADING
// ===============================
import { UILoadingProvider } from "./context/UILoadingContext";
import GlobalLoadingOverlay from "./components/GlobalLoadingOverlay";

// ✅ (NOVO) gate central do boot
import BootLoadingGate from "./components/BootLoadingGate";

ReactDOM.createRoot(document.getElementById("root")).render(
  <>
    <UILoadingProvider>
      <GlobalLoadingOverlay />

      <AdminAuthProvider>
        <TradingAuthProvider>
          <LocaleProvider>
            <I18nBridge>
              <AuthProvider>
                <AccountProvider>
                  <BalanceProvider>
                    <PairUIProvider>
                      <TradeProvider>
                        <CandleEngineProvider>
                          <TradeEngineProvider>
                            <TournamentProvider>
                              <ChartViewProviderWithAuth>
                                <IndicatorsProvider>
                                  <PaneManagerProvider persist={true}>
                                    <BootLoadingGate />
                                    <App />
                                  </PaneManagerProvider>
                                </IndicatorsProvider>
                              </ChartViewProviderWithAuth>
                            </TournamentProvider>
                          </TradeEngineProvider>
                        </CandleEngineProvider>
                      </TradeProvider>
                    </PairUIProvider>
                  </BalanceProvider>
                </AccountProvider>
              </AuthProvider>
            </I18nBridge>
          </LocaleProvider>
        </TradingAuthProvider>
      </AdminAuthProvider>
    </UILoadingProvider>
  </>
);
