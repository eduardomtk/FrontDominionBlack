import { createContext, useContext, useState } from "react";

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    try {
      const saved = localStorage.getItem("admin-auth");
      return saved ? JSON.parse(saved) : null;
    } catch {
      localStorage.removeItem("admin-auth");
      return null;
    }
  });

  function login(username, password) {
    const user = String(username).trim();
    const pass = String(password).trim();

    // 🔐 MOCK – FASE 2
    if (user === "admin" && pass === "admin123") {
      const adminData = {
        id: 1,
        name: "Administrador",
        role: "admin",
      };

      setAdmin(adminData);
      localStorage.setItem("admin-auth", JSON.stringify(adminData));

      return true;
    }

    return false;
  }

  function logout() {
    setAdmin(null);
    localStorage.removeItem("admin-auth");
  }

  return (
    <AdminAuthContext.Provider
      value={{
        admin,
        isAuthenticated: !!admin,
        login,
        logout,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);

  if (!context) {
    throw new Error(
      "useAdminAuth must be used within an AdminAuthProvider"
    );
  }

  return context;
}
