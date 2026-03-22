import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import TradingLayout from "../components/layout/TradingLayout";
import Sidebar from "../components/layout/Sidebar/LeftSidebar";
import Header from "../components/layout/Header";

import ChartWorkspace from "../components/Chart/ChartWorkspace";

import RightTradePanel from "../components/Trading/RightPanel/RightTradePanel";
import RankingPanel from "../components/ranking/RankingPanel";
import TradeHistory from "../components/Trading/TradeHistory";
import TournamentPanel from "../components/Trading/Tournament/TournamentPanel";

import ResultToastRenderer from "../components/layout/UI/PageLoader/Toast/ResultToastRenderer";
import LoadingScreen from "../components/LoadingScreen";

import BottomStatusBar from "../components/layout/BottomStatusBar/BottomStatusBar";

import WalletModal from "../components/WalletModal/WalletModal";

// ✅ CopyTrade overlay
import CopyTradePanel from "@/components/copytrade/CopyTradePanel";

// ✅ manutenção
import { MaintenanceProvider } from "@/context/MaintenanceContext";
import MaintenanceOverlay from "@/components/Maintenance/MaintenanceOverlay";

// ✅ boot gates
import { useTradingAuth } from "@/context/TradingAuthContext";
import { useAccount } from "@/context/AccountContext";
import { useBalance } from "@/context/BalanceContext";

// ✅ viewport soberano
import useTradingViewport from "@/hooks/useTradingViewport";

const LOADING_MIN_MS = 120;

// ✅ eventos globais usados pelos overlays (mesmo barramento do App.jsx)
const OVERLAY_OPEN_EVENT = "tradepro:overlay-open";
const OVERLAY_CLOSE_EVENT = "tradepro:overlay-close";

export default function TradingPage() {
  const [activePanel, setActivePanel] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [bigPanel, setBigPanel] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const minOkRef = useRef(false);

  // ✅ (NOVO) latch do boot: depois que liberou, não relock por refresh de background
  const bootUnlockedRef = useRef(false);
  const lastBootUserIdRef = useRef(null);

  const [walletInitialTab, setWalletInitialTab] = useState("deposit");
  const [walletInitialHistoryKind, setWalletInitialHistoryKind] = useState("ops");

  const { loading: authLoading, user, profileReady } = useTradingAuth();
  const { accountReady } = useAccount();
  const balanceCtx = useBalance();
  const balanceReady = !!balanceCtx?.ready;

  const [chartReady, setChartReady] = useState(false);
  const chartFallbackTimerRef = useRef(null);
  const chartFallbackArmedRef = useRef(false);

  // ✅ viewport/layout mode
  const tradingViewport = useTradingViewport();

  const overlayHost = useMemo(() => {
    if (typeof document === "undefined") return null;
    return document.getElementById("trading-overlay-host") || null;
  }, []);

  // ============================
  // ✅ helpers: barramento global
  // ============================
  const emitOverlayOpen = (id) => {
    try {
      window.dispatchEvent(new CustomEvent(OVERLAY_OPEN_EVENT, { detail: { id } }));
    } catch {}
  };

  const emitOverlayClose = (id) => {
    try {
      window.dispatchEvent(new CustomEvent(OVERLAY_CLOSE_EVENT, { detail: { id } }));
    } catch {}
  };

  // ======================================================
  // ✅ Mutual exclusion real:
  // Quando Support abrir, TradingPage fecha seus painéis
  // ======================================================
  useEffect(() => {
    const onOverlayOpen = (e) => {
      const id = e?.detail?.id;
      if (id !== "support") return;

      // ✅ fecha TUDO que o TradingPage gerencia localmente
      setActivePanel(null);
      setHistoryOpen(false);
      setBigPanel(null);
    };

    window.addEventListener(OVERLAY_OPEN_EVENT, onOverlayOpen);
    return () => window.removeEventListener(OVERLAY_OPEN_EVENT, onOverlayOpen);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const host = document.getElementById("trading-overlay-host");
    if (!host) return;

    const STYLE_ID = "tp-trading-overlay-host-sovereign";
    let st = document.getElementById(STYLE_ID);
    if (!st) {
      st = document.createElement("style");
      st.id = STYLE_ID;
      st.textContent = `
        #trading-overlay-host{
          position: fixed !important;
          top: var(--trading-header-h, 60px) !important;
          left: var(--trading-left-w, 64px) !important;
          right: 0 !important;
          bottom: var(--trading-footer-h, 0px) !important;

          z-index: 2147483647 !important;
          pointer-events: none !important;
        }
        #trading-overlay-host > *{
          pointer-events: auto !important;
        }
      `;
      document.head.appendChild(st);
    }

    const overlayRoot = document.getElementById("overlay-root");
    if (overlayRoot && overlayRoot.parentNode) {
      const parent = overlayRoot.parentNode;
      const desiredNext = overlayRoot.nextSibling;
      if (desiredNext !== host) {
        if (desiredNext) parent.insertBefore(host, desiredNext);
        else parent.appendChild(host);
      }
    } else {
      if (document.body && host.parentNode !== document.body) {
        document.body.appendChild(host);
      } else if (document.body && document.body.lastChild !== host) {
        document.body.appendChild(host);
      }
    }

    return () => {};
  }, []);

  // ✅ reinicia boot latch apenas quando troca user (inclui logout/login)
  useEffect(() => {
    const curUid = user?.id || null;

    if (lastBootUserIdRef.current !== curUid) {
      lastBootUserIdRef.current = curUid;
      bootUnlockedRef.current = false;
      setIsLoading(true);

      // reset min delay
      minOkRef.current = false;
      const tMin = setTimeout(() => {
        minOkRef.current = true;
      }, LOADING_MIN_MS);

      // reset chart gating
      setChartReady(false);
      chartFallbackArmedRef.current = false;
      if (chartFallbackTimerRef.current) {
        clearTimeout(chartFallbackTimerRef.current);
        chartFallbackTimerRef.current = null;
      }

      return () => clearTimeout(tMin);
    }
  }, [user?.id]);

  useEffect(() => {
    const onChartReady = () => setChartReady(true);

    window.addEventListener("tp:chartReady", onChartReady);
    window.addEventListener("tradepro:chart-ready", onChartReady);
    window.addEventListener("tp:candlesReady", onChartReady);

    return () => {
      window.removeEventListener("tp:chartReady", onChartReady);
      window.removeEventListener("tradepro:chart-ready", onChartReady);
      window.removeEventListener("tp:candlesReady", onChartReady);
    };
  }, []);

  // ✅ arma fallback do chart só depois dos gates principais
  useEffect(() => {
    const baseReady =
      authLoading === false &&
      accountReady === true &&
      balanceReady === true &&
      (user?.id ? profileReady === true : true);

    if (!baseReady) {
      chartFallbackArmedRef.current = false;
      if (chartFallbackTimerRef.current) {
        clearTimeout(chartFallbackTimerRef.current);
        chartFallbackTimerRef.current = null;
      }
      return;
    }

    if (chartReady) return;

    if (!chartFallbackArmedRef.current) {
      chartFallbackArmedRef.current = true;
      chartFallbackTimerRef.current = setTimeout(() => {
        setChartReady(true);
      }, 250);
    }
  }, [authLoading, accountReady, balanceReady, profileReady, user?.id, chartReady]);

  // ✅ gate final: só libera UMA vez por boot (não relock em refresh de background)
  useEffect(() => {
    if (bootUnlockedRef.current) return;

    const baseReady =
      authLoading === false &&
      accountReady === true &&
      balanceReady === true &&
      (user?.id ? profileReady === true : true);

    const allReady = baseReady && chartReady === true;

    if (allReady && minOkRef.current) {
      bootUnlockedRef.current = true;
      setIsLoading(false);
    }
  }, [authLoading, accountReady, balanceReady, profileReady, user?.id, chartReady]);

  const openBigPanel = (panel) => {
    const next = panel || null;

    // ✅ ao abrir qualquer overlay local, avisa o manager global
    if (next) emitOverlayOpen(next);
    else emitOverlayClose("wallet"); // fallback (não quebra nada se não for wallet)
    // Obs: vamos disparar close específico nos handlers reais abaixo

    setBigPanel(next);
  };

  const openWallet = (tab = "deposit") => {
    setWalletInitialTab(tab);
    emitOverlayOpen("wallet"); // ✅ fecha support via App.jsx
    setBigPanel("wallet");
  };

  const openOpsReport = () => {
    setWalletInitialTab("history");
    setWalletInitialHistoryKind("ops");
    emitOverlayOpen("wallet"); // ✅ fecha support via App.jsx
    setBigPanel("wallet");
  };

  useEffect(() => {
    const onCloseWallet = () => {
      setBigPanel((cur) => {
        const willClose = cur === "wallet";
        if (willClose) emitOverlayClose("wallet");
        return willClose ? null : cur;
      });
    };

    window.addEventListener("tp:closeWalletModal", onCloseWallet);
    return () => window.removeEventListener("tp:closeWalletModal", onCloseWallet);
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  const rankingNode =
    activePanel === "ranking" ? (
      <RankingPanel
        onClose={() => {
          setActivePanel(null);
          emitOverlayClose("ranking");
        }}
      />
    ) : null;

  const rankingRender =
    rankingNode && overlayHost ? createPortal(rankingNode, overlayHost) : rankingNode;

  const tournamentNode =
    bigPanel === "tournament" ? (
      <TournamentPanel
        onClose={() => {
          setBigPanel(null);
          emitOverlayClose("tournament");
        }}
      />
    ) : null;

  const tournamentRender =
    tournamentNode && overlayHost ? createPortal(tournamentNode, overlayHost) : tournamentNode;

  return (
    <MaintenanceProvider>
      <MaintenanceOverlay />

      <TradingLayout
        viewport={tradingViewport}
        header={<Header onOpenWallet={openWallet} />}
        leftPanel={
          <Sidebar
            activePanel={activePanel}
            setActivePanel={(panel) => {
              // ✅ History também entra no mutual exclusion
              if (panel !== "history" && historyOpen) {
                setHistoryOpen(false);
                emitOverlayClose("history");
              }

              if (panel === "history") {
                // ✅ ao abrir history, fecha support via App
                emitOverlayOpen("history");
                setHistoryOpen(true);
                return;
              }

              if (panel === "copytrade") {
                // ✅ ao abrir copytrade, fecha support via App
                emitOverlayOpen("copytrade");
                setBigPanel("copytrade");
                return;
              }

              if (panel === "tournament") {
                // ✅ ao abrir tournament, fecha support via App
                emitOverlayOpen("tournament");
                setBigPanel("tournament");
                return;
              }

              if (panel === "ranking") {
                // ✅ ao abrir ranking, fecha support via App
                emitOverlayOpen("ranking");
                setActivePanel("ranking");
                return;
              }

              setActivePanel(panel);
            }}
          />
        }
        chart={<ChartWorkspace />}
        rightPanel={<RightTradePanel />}
        bottomPanel={<BottomStatusBar />}
      />

      <ResultToastRenderer />

      {rankingRender}
      {tournamentRender}

      {historyOpen && (
        <TradeHistory
          onClose={() => {
            setHistoryOpen(false);
            emitOverlayClose("history");
          }}
          onOpenSummary={openOpsReport}
        />
      )}

      <CopyTradePanel
        isOpen={bigPanel === "copytrade"}
        onClose={() => {
          setBigPanel(null);
          emitOverlayClose("copytrade");
        }}
      />

      <WalletModal
        isOpen={bigPanel === "wallet"}
        initialTab={walletInitialTab}
        initialHistoryKind={walletInitialHistoryKind}
        onClose={() => {
          setBigPanel(null);
          emitOverlayClose("wallet");
        }}
        onGoProfile={(initialProfileTab) => {
          // ✅ ao ir pro profile, fecha suporte via App
          emitOverlayOpen("profile");
          try {
            window.dispatchEvent(
              new CustomEvent("tp:openProfileModal", {
                detail: { tab: initialProfileTab || "perfil" },
              })
            );
          } catch {}
        }}
        profileComplete={false}
        usePortal={true}
        portalContainer={null}
      />
    </MaintenanceProvider>
  );
}