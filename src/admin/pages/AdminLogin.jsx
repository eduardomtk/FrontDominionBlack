import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";
import styles from "./AdminLogin.module.css";

export default function AdminLogin() {
  const { login, loading, isAuthenticated } = useAdminAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isAuthenticated) {
    navigate("/adm", { replace: true });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (submitting) return;

    setSubmitting(true);
    setError("");

    const result = await login(email, password);

    if (result.ok) {
      navigate("/adm", { replace: true });
    } else {
      setError(result.error || "Falha ao autenticar.");
    }

    setSubmitting(false);
  }

  return (
    <div className={styles.container}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Dominion Black Admin</h1>
        <p className={styles.subtitle}>Acesso administrativo restrito</p>

        <input
          className={styles.input}
          type="email"
          placeholder="E-mail administrativo"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className={styles.input}
          type="password"
          placeholder="Senha"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <span className={styles.error}>{error}</span>}

        <button className={styles.button} type="submit" disabled={submitting}>
          {submitting ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}