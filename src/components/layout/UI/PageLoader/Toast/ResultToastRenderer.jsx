import { useEffect, useRef, useState } from "react";
import { useTrade } from "../../../../../context/TradeContext";
import Toast from "./Toast";
import SoundManager from "../../../../../sound/SoundManager";

export default function ResultToastRenderer() {
  const trade = useTrade();
  const lastResult = trade?.lastResult;
  const clearLastResult = trade?.clearLastResult;

  const [toast, setToast] = useState(null);

  // 🔒 Blindagens absolutas
  const lockRef = useRef(false);
  const mountedRef = useRef(false);
  const lastResultIdRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      lockRef.current = false;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mountedRef.current) return;
    if (!lastResult) return;

    // 🔒 impede duplicação absoluta
    if (lockRef.current) return;
    if (lastResultIdRef.current === lastResult.id) return;

    lockRef.current = true;
    lastResultIdRef.current = lastResult.id;

    const isWin = lastResult.result === "WIN";
    const value = Number(lastResult.profit || 0);

    // 🔊 Som (1 única vez garantida)
    try {
      isWin ? SoundManager.playWin() : SoundManager.playLoss();
    } catch (_) {}

    const duration = isWin ? 4000 : 1600;

    setToast({
      type: isWin ? "win" : "loss",
      message: isWin ? "WIN" : "LOSS",
      subMessage: isWin
        ? `+ R$ ${value.toFixed(2)}`
        : `- R$ ${Math.abs(value).toFixed(2)}`,
      duration,
    });

    // 🧹 limpa contexto apenas se existir
    if (typeof clearLastResult === "function") {
      clearLastResult();
    }

    // ⏱ reset absoluto (fallback; o Toast fecha e chama onClose)
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      lockRef.current = false;
      setToast(null);
    }, duration + 400); // folga pra animação de saída
  }, [lastResult, clearLastResult]);

  if (!toast) return null;

  return (
    <Toast
      type={toast.type}
      message={toast.message}
      subMessage={toast.subMessage}
      duration={toast.duration}
      onClose={() => {
        lockRef.current = false;
        setToast(null);
      }}
    />
  );
}
