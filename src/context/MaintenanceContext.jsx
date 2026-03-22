// src/context/MaintenanceContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchPublicMaintenanceSettings } from "@/services/maintenance.api";

const MaintenanceContext = createContext(null);

function unwrapValue(resp) {
  if (!resp) return {};
  if (resp?.value && typeof resp.value === "object") return resp.value;
  if (typeof resp === "object") return resp;
  return {};
}

function pickMaintEnabled(mVal) {
  return Boolean(mVal?.enabled ?? mVal?.maintenanceEnabled ?? false);
}
function pickMaintViewOnly(mVal) {
  return Boolean(mVal?.view_only ?? mVal?.maintenanceViewOnly ?? true);
}
function pickMaintBlockTrading(mVal) {
  return Boolean(mVal?.block_trading ?? mVal?.maintenanceBlockTrading ?? true);
}
function pickMaintMessage(mVal, fallback) {
  return String(mVal?.message ?? mVal?.maintenanceMessage ?? fallback ?? "");
}

const DEFAULT_MSG =
  "Estamos em manutenção no momento. O gráfico permanece disponível, mas novas operações estão temporariamente bloqueadas.";

export function MaintenanceProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [viewOnly, setViewOnly] = useState(true);
  const [blockTrading, setBlockTrading] = useState(true);
  const [message, setMessage] = useState(DEFAULT_MSG);

  const pollRef = useRef(null);
  const inFlightRef = useRef(false);

  const load = async ({ silent = false } = {}) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    if (!silent) {
      setError("");
      setLoading(true);
    }

    try {
      const resp = await fetchPublicMaintenanceSettings();
      const val = unwrapValue(resp);

      setEnabled(pickMaintEnabled(val));
      setViewOnly(pickMaintViewOnly(val));
      setBlockTrading(pickMaintBlockTrading(val));
      setMessage(pickMaintMessage(val, DEFAULT_MSG));

      if (!silent) setError("");
    } catch (e) {
      // ⚠️ se a function pública não existir ainda, não quebra o trade
      const msg = e?.message || "Falha ao carregar manutenção";
      setError(msg);
    } finally {
      if (!silent) setLoading(false);
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
    load({ silent: false });

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => load({ silent: true }), 10_000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({
      loading,
      error,
      enabled,
      viewOnly,
      blockTrading,
      message,
      reload: () => load({ silent: false }),
      // 🔒 regra central:
      tradingLocked: Boolean(enabled && blockTrading),
      overlayVisible: Boolean(enabled),
    }),
    [loading, error, enabled, viewOnly, blockTrading, message]
  );

  return <MaintenanceContext.Provider value={value}>{children}</MaintenanceContext.Provider>;
}

export function useMaintenance() {
  const ctx = useContext(MaintenanceContext);
  if (!ctx) {
    return {
      loading: false,
      error: "",
      enabled: false,
      viewOnly: true,
      blockTrading: true,
      message: DEFAULT_MSG,
      reload: () => {},
      tradingLocked: false,
      overlayVisible: false,
    };
  }
  return ctx;
}
