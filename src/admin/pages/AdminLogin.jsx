import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";
import styles from "./AdminLogin.module.css";

export default function AdminLogin() {
  const { login } = useAdminAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    setError("");

    // 🔒 NORMALIZAÇÃO
    const user = username.trim();
    const pass = password.trim();

    const success = login(user, pass);

    if (success) {
      // ✅ admin app real está em /adm
      navigate("/adm", { replace: true });
    } else {
      setError("Usuário ou senha inválidos");
    }
  }

  return (
    <div className={styles.container}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Painel Administrativo</h1>
        <p className={styles.subtitle}>Acesso restrito</p>

        <input
          className={styles.input}
          placeholder="Usuário"
          autoComplete="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          className={styles.input}
          type="password"
          placeholder="Senha"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <span className={styles.error}>{error}</span>}

        <button className={styles.button} type="submit">
          Entrar
        </button>
      </form>
    </div>
  );
}
