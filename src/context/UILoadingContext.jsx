// src/context/UILoadingContext.jsx
import React, { createContext, useContext, useMemo, useState, useCallback } from "react";

const UILoadingContext = createContext(null);

export function UILoadingProvider({ children }) {
  // ✅ boot gate (ex: BootLoadingGate)
  const [bootLoading, setBootLoading] = useState(false);

  // ✅ manual locks (ex: uploads, transitions) — tem prioridade sobre o boot gate
  const [manualLocks, setManualLocks] = useState(0);

  const isGlobalLoading = bootLoading || manualLocks > 0;

  const pushGlobalLoading = useCallback(() => {
    setManualLocks((c) => c + 1);
  }, []);

  const popGlobalLoading = useCallback(() => {
    setManualLocks((c) => (c > 0 ? c - 1 : 0));
  }, []);

  const value = useMemo(
    () => ({
      isGlobalLoading,
      // ✅ compat: BootLoadingGate continua chamando setIsGlobalLoading
      // Agora isso controla apenas o boot gate.
      setIsGlobalLoading: setBootLoading,
      // ✅ API nova: locks manuais (não sofre override do BootLoadingGate)
      pushGlobalLoading,
      popGlobalLoading,
    }),
    [isGlobalLoading, pushGlobalLoading, popGlobalLoading]
  );

  return <UILoadingContext.Provider value={value}>{children}</UILoadingContext.Provider>;
}

export function useUILoading() {
  const ctx = useContext(UILoadingContext);
  if (!ctx) {
    throw new Error("useUILoading must be used within UILoadingProvider");
  }
  return ctx;
}
