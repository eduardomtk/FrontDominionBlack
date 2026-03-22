// src/components/GlobalLoadingOverlay.jsx
import React from "react";
import { createPortal } from "react-dom";
import LoadingScreen from "./LoadingScreen";
import { useUILoading } from "../context/UILoadingContext";

export default function GlobalLoadingOverlay() {
  const { isGlobalLoading } = useUILoading();
  if (!isGlobalLoading) return null;

  // ✅ Portal: garante fullscreen real, ignorando pais com transform/filter
  return createPortal(<LoadingScreen />, document.body);
}
