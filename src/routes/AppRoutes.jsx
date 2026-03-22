import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import TradingPage from "../pages/TradingPage";

import AdminLogin from "../admin/pages/AdminLogin";
import AdminLayout from "../admin/layout/AdminLayout";
import { useAdminAuth } from "../admin/context/AdminAuthContext";

// Páginas admin existentes (do seu explorer)
import AdminDashboard from "../admin/pages/AdminDashboard";
import AdminUsers from "../admin/pages/AdminUsers";
import AdminMarkets from "../admin/pages/AdminMarkets";
import AdminDeposits from "../admin/pages/AdminDeposits";
import AdminWithdraws from "../admin/pages/AdminWithdraws";
import AdminTrades from "../admin/pages/AdminTrades";
import AdminBonuses from "../admin/pages/AdminBonuses";
import AdminAffiliates from "../admin/pages/AdminAffiliates";
import AdminSettings from "../admin/pages/AdminSettings";
import AdminTournaments from "../admin/pages/AdminTournaments";

// ✅ NOVA página (a que eu te mandei)
import AdminUsersWallets from "../admin/pages/AdminUsersWallets";

function AdminRoute({ children }) {
  const { isAuthenticated } = useAdminAuth();
  return isAuthenticated ? children : <Navigate to="/admin/login" replace />;
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Trading normal */}
        <Route path="/" element={<TradingPage />} />

        {/* Admin login */}
        <Route path="/admin/login" element={<AdminLogin />} />

        {/* Admin app (layout + sidebar + topbar + outlet) */}
        <Route
          path="/adm"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          {/* Default do /adm */}
          <Route index element={<AdminDashboard />} />

          {/* Rotas do menu */}
          <Route path="users" element={<AdminUsers />} />
          <Route path="users-wallets" element={<AdminUsersWallets />} />
          <Route path="markets" element={<AdminMarkets />} />
          <Route path="deposits" element={<AdminDeposits />} />
          <Route path="withdraws" element={<AdminWithdraws />} />
          <Route path="trades" element={<AdminTrades />} />
          <Route path="bonuses" element={<AdminBonuses />} />
          <Route path="affiliates" element={<AdminAffiliates />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="tournaments" element={<AdminTournaments />} />

          {/* Fallback dentro do admin */}
          <Route path="*" element={<Navigate to="/adm" replace />} />
        </Route>

        {/* Fallback geral */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
