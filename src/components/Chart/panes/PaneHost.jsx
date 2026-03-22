// src/chart/panes/PaneHost.jsx
import React, { useLayoutEffect, useMemo, useRef } from "react";

/**
 * PaneHost é um container neutro para panes.
 * Ele só entrega um ref de DOM estável para o “sub-chart” do indicador.
 *
 * ✅ IMPORTANTE:
 * Panes precisam ser transparentes para a imagem de fundo do chart aparecer.
 * Então aqui a gente força fundo transparente (override mínimo e seguro).
 */
export default function PaneHost({ style, className, children, onSize }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    if (!ref.current) return;

    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const cr = entry.contentRect;
      onSize?.({ width: cr.width, height: cr.height });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [onSize]);

  // ✅ força transparência mesmo que venha background via className/CSS ou style externo
  const mergedStyle = useMemo(() => {
    const s = style && typeof style === "object" ? style : {};
    return {
      ...s,
      background: "transparent",
      backgroundColor: "transparent",
      backgroundImage: "none",
    };
  }, [style]);

  return (
    <div ref={ref} className={className} style={mergedStyle}>
      {typeof children === "function" ? children(ref) : children}
    </div>
  );
}
