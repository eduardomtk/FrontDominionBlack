// src/components/chart/panes/PaneSplitter.jsx

import React, { useCallback, useRef } from "react";
import styles from "./PaneSplitter.module.css";

/**
 * Splitter profissional (row-resize).
 * Ele não decide regra de layout; apenas emite deltaY com pointer capture.
 *
 * ✅ Emissão por frame (RAF) + delta inteiro (px).
 * Sem throttle temporal para não criar “ghosting”.
 */
export default function PaneSplitter({
  onDragDelta,
  onDragStart,
  onDragEnd,
  disabled = false,
  ariaLabel = "Resize panel",
}) {
  const lastYRef = useRef(null);
  const draggingRef = useRef(false);

  const pendingDeltaRef = useRef(0);
  const rafRef = useRef(0);

  const flush = useCallback(() => {
    rafRef.current = 0;
    const d = Math.trunc(pendingDeltaRef.current);
    pendingDeltaRef.current = 0;
    if (d !== 0) onDragDelta?.(d);
  }, [onDragDelta]);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(flush);
  }, [flush]);

  const onPointerDown = useCallback(
    (e) => {
      if (disabled) return;
      draggingRef.current = true;
      lastYRef.current = e.clientY;

      pendingDeltaRef.current = 0;
      if (rafRef.current) {
        try { cancelAnimationFrame(rafRef.current); } catch {}
        rafRef.current = 0;
      }

      e.currentTarget.setPointerCapture?.(e.pointerId);
      onDragStart?.();
      e.preventDefault();
    },
    [disabled, onDragStart]
  );

  const onPointerMove = useCallback(
    (e) => {
      if (disabled) return;
      if (!draggingRef.current) return;

      const lastY = lastYRef.current;
      if (!Number.isFinite(lastY)) {
        lastYRef.current = e.clientY;
        return;
      }

      const raw = e.clientY - lastY;
      const deltaY = raw > 0 ? Math.floor(raw) : Math.ceil(raw);
      lastYRef.current = e.clientY;

      if (deltaY !== 0) {
        pendingDeltaRef.current += deltaY;
        scheduleFlush();
      }

      e.preventDefault();
    },
    [disabled, scheduleFlush]
  );

  const endDrag = useCallback(
    (e) => {
      if (disabled) return;
      if (!draggingRef.current) return;

      draggingRef.current = false;
      lastYRef.current = null;

      if (rafRef.current) {
        try { cancelAnimationFrame(rafRef.current); } catch {}
        rafRef.current = 0;
      }

      flush();
      onDragEnd?.();
      e.preventDefault();
    },
    [disabled, flush, onDragEnd]
  );

  return (
    <div
      className={styles.splitter}
      role="separator"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      tabIndex={disabled ? -1 : 0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      data-disabled={disabled ? "1" : "0"}
    />
  );
}
