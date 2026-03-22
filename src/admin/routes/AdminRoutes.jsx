import AdminLayout from "../layout/AdminLayout";
import ProtectedAdminRoute from "./ProtectedAdminRoute";

export default function AdminRoutes() {
  return (
    <ProtectedAdminRoute>
      <AdminLayout />
    </ProtectedAdminRoute>
  );
}
