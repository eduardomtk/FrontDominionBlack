import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAdminAuth } from "./admin/context/AdminAuthContext";

import AdminLogin from "./admin/pages/AdminLogin";
import AdminLayout from "./admin/Layout/AdminLayout";

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
import AdminRanking from "./admin/pages/AdminRanking";

function AdminGuard({ children }) {
  const { isAuthenticated, loading } = useAdminAuth();

  if (loading) return null;

  return isAuthenticated ? children : <Navigate to="/admin/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />

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
          <Route path="ranking" element={<AdminRanking />} />
          <Route path="*" element={<Navigate to="/adm" replace />} />
        </Route>

        <Route path="/" element={<Navigate to="/adm" replace />} />
        <Route path="*" element={<Navigate to="/adm" replace />} />
      </Routes>
    </BrowserRouter>
  );
}