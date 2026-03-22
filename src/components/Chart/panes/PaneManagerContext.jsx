// src/components/chart/panes/PaneManagerContext.jsx

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PANE_CONFIG, isPaneType, makePaneId } from "./paneTypes";
import { loadPanesFromStorage, savePanesToStorage } from "./paneStorage";

/**
 * Pane model:
 * {
 *   id: string,
 *   type: string,
 *   height: number,
 *   minHeight: number,
 *   maxHeight: number,
 *   isVisible: boolean
 * }
 */

const PaneManagerContext = createContext(null);

// ✅ garante números inteiros (elimina jitter de subpixel no resize)
function toIntPx(n, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  // arredonda para o pixel mais próximo (comportamento “corretora”)
  return Math.round(x);
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function normalizePane(pane) {
  const minHeight = Number.isFinite(pane.minHeight) ? pane.minHeight : DEFAULT_PANE_CONFIG.minHeight;
  const maxHeight = Number.isFinite(pane.maxHeight) ? pane.maxHeight : DEFAULT_PANE_CONFIG.maxHeight;

  const rawH = Number.isFinite(pane.height) ? pane.height : DEFAULT_PANE_CONFIG.height;
  const height = clamp(toIntPx(rawH, minHeight), minHeight, maxHeight);

  return {
    id: String(pane.id),
    type: typeof pane.type === "string" ? pane.type : "",
    height,
    minHeight,
    maxHeight,
    isVisible: typeof pane.isVisible === "boolean" ? pane.isVisible : true,
  };
}

export function PaneManagerProvider({ children, persist = true, initialPanes = null }) {
  const didHydrateRef = useRef(false);

  const [panes, setPanes] = useState(() => {
    if (Array.isArray(initialPanes)) return initialPanes.map(normalizePane);

    const stored = loadPanesFromStorage();
    if (stored && Array.isArray(stored)) return stored.map(normalizePane);

    return [];
  });

  useEffect(() => {
    if (!persist) return;

    if (!didHydrateRef.current) {
      didHydrateRef.current = true;
      return;
    }
    savePanesToStorage(panes);
  }, [panes, persist]);

  const upsertPane = useCallback((type, config = {}) => {
    if (!isPaneType(type)) return;

    const id = makePaneId(type);

    setPanes((prev) => {
      const next = [...prev];
      const idx = next.findIndex((p) => p.id === id);

      const merged = normalizePane({
        id,
        type,
        height: config.height ?? DEFAULT_PANE_CONFIG.height,
        minHeight: config.minHeight ?? DEFAULT_PANE_CONFIG.minHeight,
        maxHeight: config.maxHeight ?? DEFAULT_PANE_CONFIG.maxHeight,
        isVisible: true,
      });

      if (idx >= 0) {
        const existing = next[idx];
        next[idx] = normalizePane({
          ...existing,
          ...config,
          isVisible: true,
          height: config.height ?? existing.height,
        });
        return next;
      }

      next.push(merged);
      return next;
    });
  }, []);

  const removePane = useCallback((type) => {
    if (!isPaneType(type)) return;
    const id = makePaneId(type);
    setPanes((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const setPaneVisible = useCallback((type, isVisible) => {
    if (!isPaneType(type)) return;
    const id = makePaneId(type);
    setPanes((prev) => prev.map((p) => (p.id === id ? { ...p, isVisible: Boolean(isVisible) } : p)));
  }, []);

  const setPaneHeight = useCallback((type, height) => {
    if (!isPaneType(type)) return;
    const id = makePaneId(type);

    setPanes((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;

        const h = toIntPx(height, p.minHeight);
        return { ...p, height: clamp(h, p.minHeight, p.maxHeight) };
      })
    );
  }, []);

  /**
   * Ajusta duas áreas em conjunto (efeito corretora):
   * - paneType: pane inferior que você está redimensionando
   * - deltaY: + aumenta o pane; - diminui o pane
   * - mainHeightRef: altura atual do main pane
   * - minMainHeight: limite para não “sumir” o gráfico principal
   */
  const resizePaneWithConstraints = useCallback(
    ({ paneType, deltaY, mainHeightRef, minMainHeight = 120 }) => {
      if (!isPaneType(paneType)) return;

      const id = makePaneId(paneType);

      setPanes((prev) => {
        const next = prev.map((p) => ({ ...p }));

        const idx = next.findIndex((p) => p.id === id);
        if (idx < 0) return prev;

        const pane = next[idx];

        const maxGrowByMain = Number.isFinite(mainHeightRef)
          ? Math.max(0, toIntPx(mainHeightRef, 0) - toIntPx(minMainHeight, 0))
          : Infinity;

        // ✅ sempre calcula altura em inteiro
        const target = toIntPx(pane.height, pane.minHeight) + toIntPx(deltaY, 0);

        const maxAllowed = Number.isFinite(maxGrowByMain)
          ? Math.min(pane.maxHeight, pane.height + maxGrowByMain)
          : pane.maxHeight;

        next[idx] = {
          ...pane,
          height: clamp(toIntPx(target, pane.minHeight), pane.minHeight, maxAllowed),
        };

        return next;
      });
    },
    []
  );

  const reorderPanes = useCallback((newOrderIds) => {
    if (!Array.isArray(newOrderIds)) return;
    setPanes((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]));
      const ordered = [];
      for (const id of newOrderIds) {
        if (map.has(id)) ordered.push(map.get(id));
      }
      for (const p of prev) {
        if (!newOrderIds.includes(p.id)) ordered.push(p);
      }
      return ordered;
    });
  }, []);

  const resetPanes = useCallback(() => {
    setPanes([]);
  }, []);

  const api = useMemo(
    () => ({
      panes,
      upsertPane,
      removePane,
      setPaneVisible,
      setPaneHeight,
      resizePaneWithConstraints,
      reorderPanes,
      resetPanes,
    }),
    [panes, upsertPane, removePane, setPaneVisible, setPaneHeight, resizePaneWithConstraints, reorderPanes, resetPanes]
  );

  return <PaneManagerContext.Provider value={api}>{children}</PaneManagerContext.Provider>;
}

export function usePaneManager() {
  const ctx = useContext(PaneManagerContext);
  if (!ctx) {
    throw new Error("usePaneManager must be used within PaneManagerProvider");
  }
  return ctx;
}
