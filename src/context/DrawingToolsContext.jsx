// src/context/DrawingToolsContext.jsx
import React, { createContext, useContext, useMemo, useRef, useState, useCallback } from "react";

const DrawingToolsContext = createContext(null);

function uid() {
  return `dw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_STYLE = Object.freeze({
  color: "#00ff9d",
  width: 2,
  dash: "solid", // solid | dashed
  opacity: 1,
  fillColor: "#00ff9d",
  fillOpacity: 0.12,
});

const DEFAULT_FIB_LEVELS = Object.freeze([
  { v: 0, label: "0.0" },
  { v: 0.236, label: "0.236" },
  { v: 0.382, label: "0.382" },
  { v: 0.5, label: "0.5" },
  { v: 0.618, label: "0.618" },
  { v: 0.786, label: "0.786" },
  { v: 1, label: "1.0" },
]);

export function DrawingToolsProvider({ children }) {
  const [activeTool, setActiveTool] = useState(null);
  const [drawings, setDrawings] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const lastPointerRef = useRef({ x: 0, y: 0, clientX: 0, clientY: 0 });

  const api = useMemo(() => {
    const byId = new Map(drawings.map((d) => [d.id, d]));

    return {
      activeTool,
      setActiveTool,

      drawings,
      setDrawings,

      selectedId,
      setSelectedId,

      getSelected() {
        return selectedId ? byId.get(selectedId) || null : null;
      },

      setLastPointer(p) {
        if (!p) return;
        lastPointerRef.current = {
          x: Number(p.x) || 0,
          y: Number(p.y) || 0,
          clientX: Number(p.clientX) || 0,
          clientY: Number(p.clientY) || 0,
        };
      },

      getLastPointer() {
        return lastPointerRef.current;
      },

      clearAll() {
        setDrawings([]);
        setSelectedId(null);
      },

      remove(id) {
        setDrawings((prev) => prev.filter((d) => d.id !== id));
        setSelectedId((cur) => (cur === id ? null : cur));
      },

      addDrawing(d) {
        setDrawings((prev) => [...prev, d]);
        setSelectedId(d?.id || null);
      },

      updateDrawing(id, patch) {
        setDrawings((prev) =>
          prev.map((d) => {
            if (d.id !== id) return d;
            return { ...d, ...(patch || {}), style: { ...(d.style || {}), ...(patch?.style || {}) } };
          })
        );
      },

      createBaseDrawing(type, p1, p2) {
        const now = Date.now();
        const base = {
          id: uid(),
          type,
          createdAt: now,
          updatedAt: now,
          style: { ...DEFAULT_STYLE },
          p1: p1 || null, // { time, price }
          p2: p2 || null,
        };

        if (type === "horizontal") {
          return { ...base, p1: null, p2: null, price: Number(p1?.price) };
        }
        if (type === "vertical") {
          return { ...base, p1: null, p2: null, time: Number(p1?.time) };
        }
        if (type === "fibonacci") {
          return { ...base, levels: [...DEFAULT_FIB_LEVELS] };
        }
        if (type === "rectangle") {
          return base;
        }
        // line/trend
        return base;
      },
    };
  }, [activeTool, drawings, selectedId]);

  return <DrawingToolsContext.Provider value={api}>{children}</DrawingToolsContext.Provider>;
}

export function useDrawingTools() {
  const ctx = useContext(DrawingToolsContext);
  if (!ctx) throw new Error("useDrawingTools must be used within DrawingToolsProvider");
  return ctx;
}

// Helpers exportados (úteis no overlay)
export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function normalizeWidth(w) {
  const n = Number(w);
  if (!Number.isFinite(n)) return 2;
  return clamp(Math.round(n), 1, 6);
}

export function normalizeOpacity(o) {
  const n = Number(o);
  if (!Number.isFinite(n)) return 1;
  return clamp(n, 0, 1);
}
