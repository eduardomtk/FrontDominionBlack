import { useAdminAuth } from "../context/AdminAuthContext";
import "./Topbar.css";

export default function Topbar() {
  const { admin, logout } = useAdminAuth();

  return (
    <header className="admin-topbar">
      <div className="admin-topbar-left">
        <span className="admin-title">Painel Administrativo</span>
      </div>

      <div className="admin-topbar-right">
        <span className="admin-user">
          {admin?.username || "Administrador"}
        </span>

        <button className="admin-logout" onClick={logout}>
          Sair
        </button>
      </div>
    </header>
  );
}
