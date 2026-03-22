import { useEffect, useMemo, useState } from "react";

function getViewportState() {
  if (typeof window === "undefined") {
    return {
      width: 1440,
      height: 900,
      isPortrait: false,
      isLandscape: true,
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      layoutMode: "desktop",
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
  const isTablet = width >= 768 && width <= 1024;
  const isDesktop = width > 1024;

  let layoutMode = "desktop";

  if (isMobile && isPortrait) layoutMode = "mobile-portrait";
  else if (isMobile && isLandscape) layoutMode = "mobile-landscape";
  else if (isTablet && isPortrait) layoutMode = "tablet-portrait";
  else if (isTablet && isLandscape) layoutMode = "tablet-landscape";

  return {
    width,
    height,
    isPortrait,
    isLandscape,
    isMobile,
    isTablet,
    isDesktop,
    layoutMode,
  };
}

export default function useTradingViewport() {
  const [viewport, setViewport] = useState(() => getViewportState());

  useEffect(() => {
    let raf = 0;

    const update = () => {
      if (raf) cancelAnimationFrame(raf);

      raf = requestAnimationFrame(() => {
        raf = 0;
        setViewport(getViewportState());
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

  return useMemo(() => viewport, [viewport]);
}