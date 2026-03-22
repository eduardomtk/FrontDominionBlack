import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./DrawingQuickToolbar.module.css";

function Dots() {
  return (
    <div className={styles.dots}>
      <span className={styles.dot} /><span className={styles.dot} />
      <span className={styles.dot} /><span className={styles.dot} />
      <span className={styles.dot} /><span className={styles.dot} />
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      className={styles.iconSvg}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M9 3.75h6a1 1 0 0 1 1 1V6h3a.75.75 0 0 1 0 1.5h-1.02l-.84 11.04A2.25 2.25 0 0 1 14.9 20.6H9.1a2.25 2.25 0 0 1-2.24-2.06L6.02 7.5H5a.75.75 0 0 1 0-1.5h3V4.75a1 1 0 0 1 1-1Zm5.5 2.25v-.75h-5V6h5ZM7.52 7.5l.83 10.93c.03.39.36.67.75.67h5.8c.39 0 .72-.28.75-.67l.83-10.93H7.52Zm2.23 2.2a.75.75 0 0 1 .75.75v5.4a.75.75 0 0 1-1.5 0v-5.4a.75.75 0 0 1 .75-.75Zm4.5 0a.75.75 0 0 1 .75.75v5.4a.75.75 0 0 1-1.5 0v-5.4a.75.75 0 0 1 .75-.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

function DuplicateIcon() {
  return (
    <svg
      className={styles.iconSvg}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8.75 3.75h8.5a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-8.5a2 2 0 0 1-2-2v-8.5a2 2 0 0 1 2-2Zm0 1.5a.5.5 0 0 0-.5.5v8.5a.5.5 0 0 0 .5.5h8.5a.5.5 0 0 0 .5-.5v-8.5a.5.5 0 0 0-.5-.5h-8.5ZM5.75 7.25a.75.75 0 0 1 .75.75v9.25a1 1 0 0 0 1 1h9.25a.75.75 0 0 1 0 1.5H7.5A2.5 2.5 0 0 1 5 17.25V8a.75.75 0 0 1 .75-.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

function LockIcon({ locked }) {
  if (locked) {
    return (
      <svg
        className={styles.iconSvg}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M12 3.5a4 4 0 0 1 4 4V10h.75A2.25 2.25 0 0 1 19 12.25v6.5A2.25 2.25 0 0 1 16.75 21h-9.5A2.25 2.25 0 0 1 5 18.75v-6.5A2.25 2.25 0 0 1 7.25 10H8V7.5a4 4 0 0 1 4-4Zm2.5 6.5v-2.5a2.5 2.5 0 0 0-5 0V10h5Zm-2.5 3.1a1.4 1.4 0 0 1 .9 2.48v1.42a.9.9 0 0 1-1.8 0v-1.42a1.4 1.4 0 0 1 .9-2.48Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg
      className={styles.iconSvg}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 3.5a4 4 0 0 1 4 4V10h.75A2.25 2.25 0 0 1 19 12.25v6.5A2.25 2.25 0 0 1 16.75 21h-9.5A2.25 2.25 0 0 1 5 18.75v-6.5A2.25 2.25 0 0 1 7.25 10h7.25V7.5a2.5 2.5 0 0 0-4.93-.58.75.75 0 1 1-1.48-.24A4 4 0 0 1 12 3.5Zm4.75 8h-9.5a.75.75 0 0 0-.75.75v6.5c0 .41.34.75.75.75h9.5c.41 0 .75-.34.75-.75v-6.5a.75.75 0 0 0-.75-.75Zm-4.75 1.6a1.4 1.4 0 0 1 .9 2.48v1.42a.9.9 0 0 1-1.8 0v-1.42a1.4 1.4 0 0 1 .9-2.48Z"
        fill="currentColor"
      />
    </svg>
  );
}

const PRESET_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#ef4444",
  "#f59e0b",
  "#a855f7",
  "#06b6d4",
  "#e11d48",
  "#ffffff",
  "#94a3b8",
  "#111827",
];

function getViewportInfo() {
  if (typeof window === "undefined") {
    return {
      isMobile: false,
      isLandscape: true,
      isMobileLandscape: false,
      toolbarTopBase: 10,
    };
  }

  const width = Math.max(
    0,
    window.innerWidth ||
      document.documentElement?.clientWidth ||
      document.body?.clientWidth ||
      0
  );

  const height = Math.max(
    0,
    window.innerHeight ||
      document.documentElement?.clientHeight ||
      document.body?.clientHeight ||
      0
  );

  const isPortrait = height >= width;
  const isLandscape = !isPortrait;
  const isMobile = width <= 767;
  const isMobileLandscape = isMobile && isLandscape;

  let toolbarTopBase = 10;

  // ✅ desce bem no mobile portrait para fugir do pair selector
  if (isMobile && isPortrait) {
    toolbarTopBase = 44;
  }
  // ✅ desce também no mobile landscape, mas um pouco menos
  else if (isMobileLandscape) {
    toolbarTopBase = 34;
  }

  return {
    isMobile,
    isLandscape,
    isMobileLandscape,
    toolbarTopBase,
  };
}

export default function DrawingQuickToolbar({ apiRef }) {
  const { t } = useTranslation("drawingQuickToolbar");
  const [snap, setSnap] = useState(null);
  const rafRef = useRef(0);

  const [colorOpen, setColorOpen] = useState(false);
  const rootRef = useRef(null);
  const nativeColorRef = useRef(null);

  const [viewportInfo, setViewportInfo] = useState(() => getViewportInfo());

  useEffect(() => {
    let raf = 0;

    const update = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        setViewportInfo(getViewportInfo());
      });
    };

    update();

    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("orientationchange", update, { passive: true });

    const vv = window.visualViewport;
    if (vv?.addEventListener) {
      vv.addEventListener("resize", update, { passive: true });
      vv.addEventListener("scroll", update, { passive: true });
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);

      if (vv?.removeEventListener) {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
      }
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      try {
        const s = apiRef?.current?.getSelectedSnapshot?.();
        setSnap((prev) => {
          const pid = prev?.id;
          const nid = s?.id;

          const same =
            pid === nid &&
            prev?.locked === s?.locked &&
            (prev?.style?.color || prev?.style?.stroke) === (s?.style?.color || s?.style?.stroke) &&
            (prev?.style?.width ?? prev?.style?.strokeWidth) === (s?.style?.width ?? s?.style?.strokeWidth) &&
            prev?.toolbarOffset?.x === s?.toolbarOffset?.x &&
            prev?.toolbarOffset?.y === s?.toolbarOffset?.y;

          return same ? prev : s;
        });
      } catch {}
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [apiRef]);

  useEffect(() => {
    if (!colorOpen) return;

    const onDown = (e) => {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target)) setColorOpen(false);
    };

    const onKey = (e) => {
      if (e.key === "Escape") setColorOpen(false);
    };

    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);

    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [colorOpen]);

  const pos = useMemo(() => {
    if (!snap) return null;

    const ox = Number(snap.toolbarOffset?.x || 0);
    const oy = Number(snap.toolbarOffset?.y || 0);
    const topBase = Number(viewportInfo?.toolbarTopBase || 10);

    return {
      left: `calc(50% + ${ox}px)`,
      top: `calc(${topBase}px + ${oy}px)`,
      transform: "translate(-50%, 0)",
    };
  }, [snap, viewportInfo]);

  const dragRef = useRef({ dragging: false, pid: null, sx: 0, sy: 0, ox: 0, oy: 0 });
  const cleanupWindowDrag = useRef(null);

  const stopWindowDrag = () => {
    if (cleanupWindowDrag.current) {
      try {
        cleanupWindowDrag.current();
      } catch {}
      cleanupWindowDrag.current = null;
    }
  };

  useEffect(() => () => stopWindowDrag(), []);

  const onGripDown = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const cur = apiRef?.current?.getSelectedSnapshot?.();
    if (!cur) return;

    dragRef.current.dragging = true;
    dragRef.current.pid = e.pointerId;
    dragRef.current.sx = e.clientX;
    dragRef.current.sy = e.clientY;
    dragRef.current.ox = Number(cur.toolbarOffset?.x || 0);
    dragRef.current.oy = Number(cur.toolbarOffset?.y || 0);

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {}

    stopWindowDrag();

    const onMove = (ev) => {
      if (!dragRef.current.dragging) return;
      if (dragRef.current.pid != null && ev.pointerId !== dragRef.current.pid) return;

      ev.preventDefault?.();

      const dx = ev.clientX - dragRef.current.sx;
      const dy = ev.clientY - dragRef.current.sy;

      apiRef?.current?.setSelectedToolbarOffset?.({
        x: dragRef.current.ox + dx,
        y: dragRef.current.oy + dy,
      });
    };

    const onUp = (ev) => {
      if (dragRef.current.pid != null && ev.pointerId !== dragRef.current.pid) return;
      dragRef.current.dragging = false;
      dragRef.current.pid = null;
      stopWindowDrag();
    };

    window.addEventListener("pointermove", onMove, { capture: true });
    window.addEventListener("pointerup", onUp, { capture: true });
    window.addEventListener("pointercancel", onUp, { capture: true });

    cleanupWindowDrag.current = () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
    };
  };

  const onGripMove = (e) => {
    if (!dragRef.current.dragging) return;
    if (dragRef.current.pid != null && e.pointerId !== dragRef.current.pid) return;

    e.preventDefault();
    e.stopPropagation();

    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;

    apiRef?.current?.setSelectedToolbarOffset?.({
      x: dragRef.current.ox + dx,
      y: dragRef.current.oy + dy,
    });
  };

  const onGripUp = (e) => {
    if (!dragRef.current.dragging) return;
    if (dragRef.current.pid != null && e.pointerId !== dragRef.current.pid) return;

    e.preventDefault();
    e.stopPropagation();

    dragRef.current.dragging = false;
    dragRef.current.pid = null;
    stopWindowDrag();
  };

  if (!snap || !pos) return null;

  const color = snap.style?.stroke || snap.style?.color || "#3b82f6";
  const width = Number(snap.style?.strokeWidth ?? snap.style?.width ?? 2);
  const isLocked = !!snap.locked;

  const applyStylePatch = (patch) => {
    if (isLocked) return;

    const out = { ...patch };

    if (Object.prototype.hasOwnProperty.call(patch, "color")) {
      out.stroke = patch.color;
      out.color = patch.color;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "width")) {
      out.strokeWidth = patch.width;
      out.width = patch.width;
    }

    apiRef?.current?.setSelectedStyle?.(out);
  };

  const pickPreset = (hex) => {
    applyStylePatch({ color: hex });
    setColorOpen(false);
  };

  const onDuplicate = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLocked) return;
    try {
      apiRef?.current?.duplicateSelected?.();
    } catch {}
    setColorOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.toolbar} ${viewportInfo.isMobile ? styles.toolbarMobile : ""}`}
      style={pos}
    >
      <div
        className={styles.grip}
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
        title={t("toolbar.drag")}
      >
        <Dots />
      </div>

      <div className={styles.colorWrap}>
        <button
          className={styles.btn}
          title={t("toolbar.color")}
          disabled={isLocked}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isLocked) return;
            setColorOpen((v) => !v);
          }}
        >
          <span className={styles.colorDot} style={{ background: color }} />
          <span className={styles.colorLabel}>{t("toolbar.color")}</span>
        </button>

        {colorOpen && !isLocked && (
          <div className={styles.colorPopover} role="dialog" aria-label={t("toolbar.selectColor")}>
            <div className={styles.colorHeader}>
              <div className={styles.colorPreview} style={{ background: color }} />
              <div className={styles.colorHex}>{String(color).toUpperCase()}</div>
              <button
                className={styles.colorClose}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setColorOpen(false);
                }}
                title={t("toolbar.close")}
              >
                ✕
              </button>
            </div>

            <div className={styles.swatches}>
              {PRESET_COLORS.map((hex) => (
                <button
                  key={hex}
                  className={styles.swatch}
                  style={{ background: hex }}
                  title={hex}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    pickPreset(hex);
                  }}
                />
              ))}
            </div>

            <div className={styles.colorFooter}>
              <button
                className={styles.moreBtn}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    nativeColorRef.current?.click?.();
                  } catch {}
                }}
                title={t("toolbar.moreColors")}
              >
                {t("toolbar.moreColors")}
              </button>

              <input
                ref={nativeColorRef}
                className={styles.nativeColor}
                type="color"
                value={color}
                onChange={(e) => applyStylePatch({ color: e.target.value })}
                tabIndex={-1}
              />
            </div>
          </div>
        )}
      </div>

      <select
        className={styles.select}
        value={String(width)}
        disabled={isLocked}
        onChange={(e) => applyStylePatch({ width: Number(e.target.value) })}
        title={isLocked ? t("toolbar.locked") : t("toolbar.thickness")}
      >
        <option value="1">{t("toolbar.width.1")}</option>
        <option value="2">{t("toolbar.width.2")}</option>
        <option value="3">{t("toolbar.width.3")}</option>
        <option value="4">{t("toolbar.width.4")}</option>
      </select>

      <button
        className={styles.btn}
        onClick={onDuplicate}
        disabled={isLocked}
        title={isLocked ? t("toolbar.locked") : t("toolbar.duplicate")}
        aria-label={isLocked ? t("toolbar.locked") : t("toolbar.duplicate")}
      >
        <DuplicateIcon />
      </button>

      <button
        className={`${styles.btn} ${isLocked ? styles.locked : ""}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          apiRef?.current?.toggleSelectedLock?.();
          setColorOpen(false);
        }}
        title={isLocked ? t("toolbar.unlock") : t("toolbar.lock")}
        aria-label={isLocked ? t("toolbar.unlock") : t("toolbar.lock")}
      >
        <LockIcon locked={isLocked} />
      </button>

      <button
        className={`${styles.btn} ${styles.danger} ${styles.deleteBtn}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          apiRef?.current?.deleteSelected?.();
          setColorOpen(false);
        }}
        title={t("toolbar.delete")}
        aria-label={t("toolbar.delete")}
      >
        <TrashIcon />
      </button>
    </div>
  );
}