// src/hooks/useNextMinute.js
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Hook profissional:
 * - NÃO bloqueia a UI esperando “virar o minuto”.
 * - Fornece o tempo restante até o próximo minuto para quem precisa (expiração, etc.).
 *
 * Compatibilidade:
 * - Continua retornando { isReady }.
 * - Agora isReady fica true rapidamente (por padrão).
 *
 * Se alguma parte do seu sistema realmente precisar “esperar virar o minuto”,
 * use: useNextMinute({ blockUntilNextMinute: true })
 */
export function useNextMinute(options) {
  const opts = options || {};
  const blockUntilNextMinute = !!opts.blockUntilNextMinute;

  const [isReady, setIsReady] = useState(false);
  const [msToNextMinute, setMsToNextMinute] = useState(0);

  const timerRef = useRef(null);

  const computeMsToNextMinute = () => {
    const now = new Date();
    const sec = now.getSeconds();
    const ms = now.getMilliseconds();
    // tempo restante até o próximo minuto (preciso em ms)
    return Math.max(0, (59 - sec) * 1000 + (1000 - ms));
  };

  useEffect(() => {
    // Limpa timer anterior
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const msLeft = computeMsToNextMinute();
    setMsToNextMinute(msLeft);

    if (blockUntilNextMinute) {
      // Modo antigo: só fica pronto quando virar o minuto
      timerRef.current = setTimeout(() => {
        setIsReady(true);
        setMsToNextMinute(0);
      }, msLeft);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }

    // Modo profissional (default): pronto quase imediato, sem travar carregamento
    // (pequeno delay para evitar “flash” em renders muito rápidos)
    timerRef.current = setTimeout(() => {
      setIsReady(true);
    }, 150);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockUntilNextMinute]);

  const nextMinuteAt = useMemo(() => {
    const now = Date.now();
    return now + msToNextMinute;
  }, [msToNextMinute]);

  return { isReady, msToNextMinute, nextMinuteAt };
}
