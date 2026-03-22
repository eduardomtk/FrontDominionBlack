// src/App.jsx
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { useEffect, useRef, useState } from "react";

import TradingPage from "./pages/TradingPage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

// ✅ Recuperação de senha
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

import SoundManager from "./sound/SoundManager";

// ✅ TRADING AUTH
import { useTradingAuth } from "./context/TradingAuthContext";

// ✅ ADMIN AUTH
import { useAdminAuth } from "./admin/context/AdminAuthContext";

// ✅ ADMIN
import AdminLogin from "./admin/pages/AdminLogin";
import AdminLayout from "./admin/Layout/AdminLayout";

// ✅ Admin pages
import AdminDashboard from "./admin/pages/AdminDashboard";
import AdminUsersWallets from "./admin/pages/AdminUsersWallets";
import AdminKyc from "./admin/pages/AdminKyc";
import AdminUsers from "./admin/pages/AdminUsers";
import AdminMarkets from "./admin/pages/AdminMarkets";
import AdminDeposits from "./admin/pages/AdminDeposits";
import AdminWithdraws from "./admin/pages/AdminWithdraws";
import AdminOperations from "./admin/pages/OperationsPage";
import AdminBonuses from "./admin/pages/BonusesPage";
import AdminSettings from "./admin/pages/AdminSettings";
import AffiliatesPage from "./admin/pages/AffiliatesPage";
import AdminSupport from "./admin/pages/AdminSupport";

// ✅ NOVO: Admin Ranking
import AdminRanking from "./admin/pages/AdminRanking";

import VerifyEmailPage from "./pages/VerifyEmailPage";
import { MarketConfigProvider } from "./context/MarketConfigContext";

// ✅ Referral binder
import AffiliateReferralBinder from "./components/affiliates/AffiliateReferralBinder";

// ===================================
// ✅ NOVO: PORTAL AFILIADOS
// ===================================
import AffiliateLoginPage from "./affiliate/pages/AffiliateLoginPage";
import AffiliateDashboard from "./affiliate/pages/AffiliateDashboard";
import AffiliateAuthGuard from "./affiliate/components/AffiliateAuthGuard";

// ✅ NOVO: Support Modal (overlay)
import SupportModal from "./components/SupportModal/SupportModal";

// ✅ eventos globais usados pelos overlays
const OVERLAY_OPEN_EVENT = "tradepro:overlay-open";
const OVERLAY_CLOSE_EVENT = "tradepro:overlay-close";

const AFF_REF_LS_KEY = "tp_aff_ref_code";

function AffiliateRefCapture() {
  const location = useLocation();

  useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search || "");
      const ref = String(sp.get("ref") || "").trim();
      if (ref) {
        localStorage.setItem(AFF_REF_LS_KEY, ref);
      }
    } catch {}
  }, [location.search]);

  return null;
}

// ===================================
// Guards
// ===================================

function ProtectedRoute({ children }) {
  const { loading, isAuthenticated } = useTradingAuth();
  if (loading) return null;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function PublicOnlyRoute({ children }) {
  const { loading, isAuthenticated } = useTradingAuth();
  if (loading) return null;
  return isAuthenticated ? <Navigate to="/trade" replace /> : children;
}

function AdminGuard({ children }) {
  const { isAuthenticated } = useAdminAuth();
  return isAuthenticated ? children : <Navigate to="/admin/login" replace />;
}

export default function App() {
  const unlockedRef = useRef(false);

  /**
   * ✅ Overlay Manager (mutual exclusion)
   * - Um overlay ativo por vez
   * - Compatível com o barramento tradepro:overlay-open/close
   */
  const [activeOverlay, setActiveOverlay] = useState(null);
  // activeOverlay: 'support' | 'wallet' | 'profile' | ... | null

  useEffect(() => {
    const unlock = async () => {
      if (unlockedRef.current) return;
      unlockedRef.current = true;

      await SoundManager.unlockFromUserGesture?.();
      await SoundManager.init();

      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("mousedown", unlock, true);
      window.removeEventListener("touchstart", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };

    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("mousedown", unlock, true);
    window.addEventListener("touchstart", unlock, true);
    window.addEventListener("keydown", unlock, true);

    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("mousedown", unlock, true);
      window.removeEventListener("touchstart", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, []);

  // ✅ Listener global do barramento tradepro:overlay-open/close
  useEffect(() => {
    const onOverlayOpen = (e) => {
      const id = e?.detail?.id;
      if (!id) return;

      // ✅ Mutual exclusion: abrir 1 => substitui o anterior
      setActiveOverlay(id);
    };

    const onOverlayClose = (e) => {
      const id = e?.detail?.id;

      // se fechar sem id: fecha tudo (fallback seguro)
      if (!id) {
        setActiveOverlay(null);
        return;
      }

      // fecha apenas se for o overlay atual
      setActiveOverlay((curr) => (curr === id ? null : curr));
    };

    window.addEventListener(OVERLAY_OPEN_EVENT, onOverlayOpen);
    window.addEventListener(OVERLAY_CLOSE_EVENT, onOverlayClose);

    return () => {
      window.removeEventListener(OVERLAY_OPEN_EVENT, onOverlayOpen);
      window.removeEventListener(OVERLAY_CLOSE_EVENT, onOverlayClose);
    };
  }, []);

  const closeSupport = () => {
    // ✅ fecha via manager
    setActiveOverlay((curr) => (curr === "support" ? null : curr));
    try {
      window.dispatchEvent(
        new CustomEvent(OVERLAY_CLOSE_EVENT, { detail: { id: "support" } })
      );
    } catch {}
  };

  return (
    <MarketConfigProvider>
      <BrowserRouter>
        <AffiliateRefCapture />
        <AffiliateReferralBinder />

        {/* ✅ Support Overlay (Portal -> #trading-overlay-host quando existir) */}
        <SupportModal isOpen={activeOverlay === "support"} onClose={closeSupport} />

        <div style={{ width: "100%", height: "100%", overflow: "auto" }}>
          <Routes>
            {/* ===== PUBLIC ===== */}
            <Route
              path="/"
              element={
                <PublicOnlyRoute>
                  <LandingPage />
                </PublicOnlyRoute>
              }
            />

            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <LoginPage />
                </PublicOnlyRoute>
              }
            />

            <Route
              path="/register"
              element={
                <PublicOnlyRoute>
                  <RegisterPage />
                </PublicOnlyRoute>
              }
            />

            <Route
              path="/forgot-password"
              element={
                <PublicOnlyRoute>
                  <ForgotPasswordPage />
                </PublicOnlyRoute>
              }
            />

            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />

            {/* ===== TRADING ===== */}
            <Route
              path="/trade"
              element={
                <ProtectedRoute>
                  <TradingPage />
                </ProtectedRoute>
              }
            />

            <Route path="/dashboard" element={<Navigate to="/trade" replace />} />

            {/* =================================== */}
            {/* ===== PORTAL AFILIADOS ===== */}
            {/* =================================== */}

            <Route path="/affiliate/login" element={<AffiliateLoginPage />} />

            <Route
              path="/affiliate/dashboard"
              element={
                <AffiliateAuthGuard>
                  <AffiliateDashboard />
                </AffiliateAuthGuard>
              }
            />

            {/* ===== ADMIN LOGIN ===== */}
            <Route path="/admin/login" element={<AdminLogin />} />

            {/* ===== ADMIN APP ===== */}
            <Route
              path="/adm"
              element={
                <AdminGuard>
                  <AdminLayout />
                </AdminGuard>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="users-wallets" element={<AdminUsersWallets />} />
              <Route path="kyc" element={<AdminKyc />} />
              <Route path="markets" element={<AdminMarkets />} />
              <Route path="deposits" element={<AdminDeposits />} />
              <Route path="withdraws" element={<AdminWithdraws />} />
              <Route path="trades" element={<AdminOperations />} />
              <Route path="bonuses" element={<AdminBonuses />} />
              <Route path="affiliates" element={<AffiliatesPage />} />
              <Route path="support" element={<AdminSupport />} />
              <Route path="settings" element={<AdminSettings />} />

              {/* ✅ NOVO: Ranking */}
              <Route path="ranking" element={<AdminRanking />} />

              <Route path="*" element={<Navigate to="/adm" replace />} />
            </Route>

            {/* fallback geral */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </MarketConfigProvider>
  );
}