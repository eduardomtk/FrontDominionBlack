import React, { useEffect, useMemo, useRef } from "react";
import styles from "./TradingLayout.module.css";

export default function TradingLayout({
  header,
  leftPanel,
  chart,
  rightPanel,
  bottomPanel,
  viewport,
}) {
  const rootRef = useRef(null);

  const layoutMode = String(viewport?.layoutMode || "desktop");
  const isMobilePortrait = layoutMode === "mobile-portrait";
  const isMobileLandscape = layoutMode === "mobile-landscape";
  const isTabletPortrait = layoutMode === "tablet-portrait";
  const isTabletLandscape = layoutMode === "tablet-landscape";

  const rootClassName = useMemo(() => {
    const classes = [styles.root];

    if (isMobilePortrait) classes.push(styles.rootMobilePortrait);
    else if (isMobileLandscape) classes.push(styles.rootMobileLandscape);
    else if (isTabletPortrait) classes.push(styles.rootTabletPortrait);
    else if (isTabletLandscape) classes.push(styles.rootTabletLandscape);
    else classes.push(styles.rootDesktop);

    return classes.join(" ");
  }, [isMobilePortrait, isMobileLandscape, isTabletPortrait, isTabletLandscape]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const headerEl = root.querySelector("#trading-header");
    const leftEl = root.querySelector("#trading-left");
    const footerEl = root.querySelector("#trading-footer-fixed");

    if (!headerEl || !leftEl) return;

    const applyVars = () => {
      const hr = headerEl.getBoundingClientRect();
      const lr = leftEl.getBoundingClientRect();
      const fr = footerEl ? footerEl.getBoundingClientRect() : null;

      const headerH = Math.max(0, Math.round(hr.height));
      const leftW = Math.max(0, Math.round(lr.width));
      const footerH = fr ? Math.max(0, Math.round(fr.height)) : 0;

      root.style.setProperty("--trading-header-h", `${headerH}px`);
      root.style.setProperty("--trading-left-w", `${leftW}px`);
      root.style.setProperty("--trading-footer-h", `${footerH}px`);
    };

    applyVars();

    const ro = new ResizeObserver(() => applyVars());
    try {
      ro.observe(headerEl);
      ro.observe(leftEl);
      if (footerEl) ro.observe(footerEl);
    } catch {}

    window.addEventListener("resize", applyVars);

    return () => {
      try {
        ro.disconnect();
      } catch {}
      window.removeEventListener("resize", applyVars);
    };
  }, [bottomPanel, layoutMode]);

  return (
    <div
      className={rootClassName}
      id="trading-root"
      ref={rootRef}
      data-layout-mode={layoutMode}
    >
      <div className={styles.header} id="trading-header">
        {header}
      </div>

      <div
        className={`${styles.body} ${bottomPanel ? styles.bodyWithFooter : ""}`}
        id="trading-body"
      >
        <div className={styles.left} id="trading-left">
          {leftPanel}
        </div>

        <div className={styles.mainArea} id="trading-main-area">
          <div className={styles.center} id="trading-center">
            <div className={styles.chart} id="trading-chart">
              {chart}
            </div>
          </div>

          <div className={styles.right} id="trading-right">
            {rightPanel}
          </div>
        </div>
      </div>

      {bottomPanel && (
        <div className={styles.footerFixed} id="trading-footer-fixed">
          {bottomPanel}
        </div>
      )}

      <div
        id="trading-overlay-host"
        style={{
          position: "fixed",
          top: "var(--trading-header-h, 0px)",
          left: "var(--trading-left-w, 0px)",
          right: 0,
          bottom: "var(--trading-footer-h, 0px)",
          zIndex: 2500,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}