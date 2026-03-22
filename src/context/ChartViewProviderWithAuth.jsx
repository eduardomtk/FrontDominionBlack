// src/context/ChartViewProviderWithAuth.jsx
import React from "react";
import { ChartViewProvider } from "@/context/ChartViewContext";
import { useTradingAuth } from "@/context/TradingAuthContext";

export default function ChartViewProviderWithAuth({ children }) {
  const { user } = useTradingAuth();

  return (
    <ChartViewProvider userId={user?.id}>
      {children}
    </ChartViewProvider>
  );
}
