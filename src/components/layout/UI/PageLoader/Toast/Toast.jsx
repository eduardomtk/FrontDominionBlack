import React, { useEffect, useRef, useState } from "react";
import styles from "./Toast.module.css";

export default function Toast({
  type,
  message,
  subMessage,
  duration = 3500,
  onClose,
}) {
  const [exiting, setExiting] = useState(false);
  const closedRef = useRef(false);

  // tempo da animação de saída (tem que casar com o CSS)
  const EXIT_MS = 300;

  useEffect(() => {
    // 🔒 HARD LIMIT
    const safeDuration = Math.min(Number(duration) || 0, 4000);

    // ✅ começa a sair ANTES de acabar (pra não ficar "seco")
    const startExitIn = Math.max(0, safeDuration - EXIT_MS);

    const t1 = setTimeout(() => {
      beginExit();
    }, startExitIn);

    // fallback defensivo: se algo falhar, fecha no limite
    const t2 = setTimeout(() => {
      forceClose();
    }, safeDuration);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // ⚠️ dependências vazias → NÃO reinicia
  }, []);

  const beginExit = () => {
    if (closedRef.current) return;
    setExiting(true);

    // no fim da animação, fecha de vez
    setTimeout(() => {
      forceClose();
    }, 300);
  };

  const forceClose = () => {
    if (closedRef.current) return;
    closedRef.current = true;

    onClose && onClose();
  };

  return (
    <div
      className={`${styles.toast} ${styles[type]} ${
        exiting ? styles.exitLeft : ""
      }`}
    >
      <div className={styles.content}>
        <strong>{message}</strong>
        {subMessage && <span>{subMessage}</span>}
      </div>

      {/* barra visual apenas decorativa */}
      <div className={styles.progress} />
    </div>
  );
}
