import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export default function ChartLoadingOverlay({
  visible = false,
  label = "Sincronizando dados do mercado",
  sublabel = "Aguarde um instante",
  blockInteraction = true,
  portalTargetSelector = "",
}) {
  const [portalTarget, setPortalTarget] = useState(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!visible) {
      setPortalTarget(null);
      return;
    }

    if (!portalTargetSelector) {
      setPortalTarget(null);
      return;
    }

    let raf = 0;
    let tries = 0;
    const maxTries = 24;

    const resolveTarget = () => {
      const el = document.querySelector(portalTargetSelector);
      if (el) {
        setPortalTarget(el);
        return;
      }

      tries += 1;
      if (tries < maxTries) {
        raf = requestAnimationFrame(resolveTarget);
      }
    };

    resolveTarget();

    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [visible, portalTargetSelector]);

  const content = useMemo(() => {
    if (!visible) return null;

    return (
      <div
        style={{
          ...styles.root,
          pointerEvents: blockInteraction ? "auto" : "none",
          cursor: blockInteraction ? "progress" : "default",
        }}
        aria-live="polite"
        aria-busy="true"
      >
        <div style={styles.backdrop} />
        <div style={styles.vignette} />
        <div style={styles.topGlow} />

        <div style={styles.center}>
          <div style={styles.statusWrap}>
            <span style={styles.statusDot} />
            <span style={styles.statusText}>AO VIVO</span>
          </div>

          <div style={styles.spinnerStage}>
            <div style={styles.spinnerHalo} />
            <div style={styles.spinnerRing} />
            <div style={styles.spinnerRingSoft} />
            <div style={styles.spinnerCore} />
          </div>

          <div style={styles.textBlock}>
            <div style={styles.label}>{label}</div>
            {!!sublabel && <div style={styles.sublabel}>{sublabel}</div>}
          </div>
        </div>
      </div>
    );
  }, [visible, blockInteraction, label, sublabel]);

  if (!visible || !content) return null;

  if (portalTarget && typeof document !== "undefined") {
    return createPortal(content, portalTarget);
  }

  return content;
}

const styles = {
  root: {
    position: "absolute",
    inset: 0,
    zIndex: 40000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    background: "#000000",
  },

  backdrop: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(circle at center, rgba(10,14,18,0.14) 0%, rgba(0,0,0,0.96) 48%, rgba(0,0,0,1) 100%)",
  },

  vignette: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(circle at center, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.00) 30%, rgba(0,0,0,0.00) 50%, rgba(0,0,0,0.42) 100%)",
    pointerEvents: "none",
  },

  topGlow: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 320,
    height: 180,
    transform: "translate(-50%, -62%)",
    background:
      "radial-gradient(circle at center, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.018) 28%, rgba(255,255,255,0.00) 72%)",
    filter: "blur(18px)",
    pointerEvents: "none",
  },

  center: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: "28px 24px",
    textAlign: "center",
    pointerEvents: "none",
    userSelect: "none",
    transform: "translateY(-10px)",
  },

  statusWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.02)",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.015) inset",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "rgba(0,255,163,0.95)",
    boxShadow: "0 0 10px rgba(0,255,163,0.55)",
    animation: "chartLoadingPulse 1.4s ease-in-out infinite",
    flex: "0 0 auto",
  },

  statusText: {
    fontSize: 10,
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: "0.16em",
    color: "rgba(255,255,255,0.68)",
    textTransform: "uppercase",
  },

  spinnerStage: {
    position: "relative",
    width: 56,
    height: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  spinnerHalo: {
    position: "absolute",
    inset: -10,
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 24%, rgba(255,255,255,0.00) 72%)",
    filter: "blur(8px)",
    animation: "chartLoadingBreath 2.2s ease-in-out infinite",
  },

  spinnerRing: {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    boxSizing: "border-box",
    border: "2px solid rgba(255,255,255,0.10)",
    borderTopColor: "rgba(255,255,255,0.96)",
    borderRightColor: "rgba(255,255,255,0.36)",
    animation: "chartLoadingSpin 0.95s linear infinite",
  },

  spinnerRingSoft: {
    position: "absolute",
    inset: 6,
    borderRadius: "50%",
    boxSizing: "border-box",
    border: "1.5px solid rgba(0,255,163,0.10)",
    borderBottomColor: "rgba(0,255,163,0.72)",
    borderLeftColor: "rgba(0,255,163,0.28)",
    animation: "chartLoadingSpinReverse 1.15s linear infinite",
  },

  spinnerCore: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.92)",
    boxShadow:
      "0 0 12px rgba(255,255,255,0.28), 0 0 24px rgba(0,255,163,0.12)",
    animation: "chartLoadingCorePulse 1.6s ease-in-out infinite",
  },

  textBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },

  label: {
    color: "rgba(255,255,255,0.97)",
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: "0.01em",
    textShadow: "0 1px 0 rgba(0,0,0,0.45)",
  },

  sublabel: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.25,
    letterSpacing: "0.015em",
  },
};

if (
  typeof document !== "undefined" &&
  !document.getElementById("chart-loading-overlay-keyframes")
) {
  const style = document.createElement("style");
  style.id = "chart-loading-overlay-keyframes";
  style.textContent = `
    @keyframes chartLoadingSpin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes chartLoadingSpinReverse {
      from { transform: rotate(360deg); }
      to { transform: rotate(0deg); }
    }

    @keyframes chartLoadingPulse {
      0%, 100% {
        opacity: 0.75;
        transform: scale(0.92);
      }
      50% {
        opacity: 1;
        transform: scale(1.08);
      }
    }

    @keyframes chartLoadingBreath {
      0%, 100% {
        opacity: 0.55;
        transform: scale(0.96);
      }
      50% {
        opacity: 1;
        transform: scale(1.04);
      }
    }

    @keyframes chartLoadingCorePulse {
      0%, 100% {
        opacity: 0.82;
        transform: scale(0.92);
      }
      50% {
        opacity: 1;
        transform: scale(1.14);
      }
    }
  `;
  document.head.appendChild(style);
}