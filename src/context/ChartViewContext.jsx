// src/context/ChartViewContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const ChartViewContext = createContext(null);

export function ChartViewProvider({ children, userId }) {
  const storageKey = useMemo(() => {
    const uid = String(userId || "anon");
    return `tp_chartType:${uid}`;
  }, [userId]);

  const [chartType, setChartType] = useState("candles"); // candles | line | bars | heikin

  // ✅ carrega preferencia sempre que userId (storageKey) mudar
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setChartType("candles");
        return;
      }

      const t = String(raw).toLowerCase();
      if (t === "candles" || t === "line" || t === "bars" || t === "heikin") {
        setChartType(t);
      } else {
        setChartType("candles");
      }
    } catch {
      setChartType("candles");
    }
  }, [storageKey]);

  // ✅ persiste sempre que mudar
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(chartType || "candles"));
    } catch {}
  }, [storageKey, chartType]);

  const value = useMemo(
    () => ({
      chartType,
      setChartType,
    }),
    [chartType]
  );

  return <ChartViewContext.Provider value={value}>{children}</ChartViewContext.Provider>;
}

export function useChartView() {
  const ctx = useContext(ChartViewContext);

  // ✅ Nunca explode (mesmo se você esquecer o Provider)
  if (!ctx) {
    return {
      chartType: "candles",
      setChartType: () => {},
    };
  }

  return ctx;
}
