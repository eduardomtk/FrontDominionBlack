import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/services/supabaseClient";

const AdminAuthContext = createContext(null);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function buildAdminFromUser(user) {
  const email = normalizeEmail(user?.email);
  const role = user?.app_metadata?.role;

  if (!user || !email || role !== "admin") return null;

  return {
    id: user.id,
    email,
    name:
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      "Administrador",
    role,
  };
}

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) throw error;

        const user = session?.user ?? null;
        const parsedAdmin = buildAdminFromUser(user);

        if (!mounted) return;

        if (parsedAdmin) {
          setAdmin(parsedAdmin);
        } else {
          setAdmin(null);

          if (user) {
            await supabase.auth.signOut();
          }
        }
      } catch {
        if (mounted) setAdmin(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null;
      const parsedAdmin = buildAdminFromUser(user);

      if (parsedAdmin) {
        setAdmin(parsedAdmin);
      } else {
        setAdmin(null);

        if (user) {
          await supabase.auth.signOut();
        }
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function login(email, password) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedPassword = String(password || "");

    if (!normalizedEmail || !normalizedPassword) {
      return {
        ok: false,
        error: "Informe e-mail e senha.",
      };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: normalizedPassword,
    });

    if (error) {
      return {
        ok: false,
        error: error.message || "Falha ao autenticar.",
      };
    }

    const user = data?.user ?? null;
    const parsedAdmin = buildAdminFromUser(user);

    if (!parsedAdmin) {
      await supabase.auth.signOut();

      return {
        ok: false,
        error: "Acesso administrativo não autorizado.",
      };
    }

    setAdmin(parsedAdmin);
    return { ok: true };
  }

  async function logout() {
    await supabase.auth.signOut();
    setAdmin(null);
  }

  return (
    <AdminAuthContext.Provider
      value={{
        admin,
        loading,
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
    throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  }

  return context;
}