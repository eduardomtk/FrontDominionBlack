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

    // 🔐 CREDENCIAIS MOCKADAS (FASE 2)
    if (user === "admin" && pass === "admin123") {
      const data = { username: "admin" };

      setAdmin(data);
      localStorage.setItem("admin-auth", JSON.stringify(data));

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
        isAuthenticated: admin !== null,
        login,
        logout,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  }
  return ctx;
}
