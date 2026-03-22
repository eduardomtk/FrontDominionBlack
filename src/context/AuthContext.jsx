import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  // 🔁 Recupera sessão admin
  useEffect(() => {
    const stored = localStorage.getItem("auth_admin");
    if (stored) {
      setUser(JSON.parse(stored));
    }
  }, []);

  // 🔐 Login admin (mock frontend)
  function login(username, password) {
    if (username === "admin" && password === "admin123") {
      const adminUser = {
        name: "Admin",
        email: "admin@email.com",
        role: "admin",
      };

      localStorage.setItem("auth_admin", JSON.stringify(adminUser));
      setUser(adminUser);
      return true;
    }

    return false;
  }

  // 🚪 Logout
  function logout() {
    localStorage.removeItem("auth_admin");
    setUser(null);
  }

  // 🛡️ Helper
  const isAdmin = user?.role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
