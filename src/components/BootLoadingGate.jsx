// src/components/BootLoadingGate.jsx
import { useEffect, useRef, useState, useMemo } from "react";
import { useUILoading } from "@/context/UILoadingContext";
import { useTradingAuth } from "@/context/TradingAuthContext";
import { useAccount } from "@/context/AccountContext";
import { useBalance } from "@/context/BalanceContext";

function isTradingPath(pathname) {
  const p = String(pathname || "");
  // ✅ Gate só deve existir para o app de trading (ajuste aqui se você tiver outras rotas de trading)
  return p === "/trade" || p.startsWith("/trade/") || p === "/dashboard";
}

// ✅ tracker de pathname mesmo fora do Router (ou seja: funciona no main.jsx)
function usePathname() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    let alive = true;

    const notify = () => {
      if (!alive) return;
      setPathname(window.location.pathname);
    };

    // popstate (back/forward)
    window.addEventListener("popstate", notify);

    // patch history API para detectar navegação do react-router (pushState/replaceState)
    const _push = history.pushState;
    const _replace = history.replaceState;

    history.pushState = function (...args) {
      const ret = _push.apply(this, args);
      window.dispatchEvent(new Event("tp:locationchange"));
      return ret;
    };

    history.replaceState = function (...args) {
      const ret = _replace.apply(this, args);
      window.dispatchEvent(new Event("tp:locationchange"));
      return ret;
    };

    window.addEventListener("tp:locationchange", notify);

    // cleanup
    return () => {
      alive = false;
      window.removeEventListener("popstate", notify);
      window.removeEventListener("tp:locationchange", notify);

      // restaura history original
      try {
        history.pushState = _push;
        history.replaceState = _replace;
      } catch {}
    };
  }, []);

  return pathname;
}

export default function BootLoadingGate() {
  const { setIsGlobalLoading } = useUILoading();

  const pathname = usePathname();
  const tradingRoute = useMemo(() => isTradingPath(pathname), [pathname]);

  const { loading: authLoading, user, profile, avatarUrl } = useTradingAuth();
  const { accountReady } = useAccount();
  const balanceCtx = useBalance();

  const balanceReady = !!balanceCtx?.ready;

  // ✅ profile "conhecido"
  const profileKnown = !user?.id ? true : typeof profile !== "undefined";

  // ✅ avatar não pode travar
  void avatarUrl;

  // ✅ chart gate (somente para trading)
  const [chartReady, setChartReady] = useState(false);
  const chartFallbackArmedRef = useRef(false);
  const chartFallbackTimerRef = useRef(null);

  useEffect(() => {
    // ✅ fora do trading, NUNCA segurar loading global
    if (!tradingRoute) {
      setIsGlobalLoading(false);

      // limpa estado do chart gate para não vazar quando voltar pro trading
      chartFallbackArmedRef.current = false;
      if (chartFallbackTimerRef.current) {
        clearTimeout(chartFallbackTimerRef.current);
        chartFallbackTimerRef.current = null;
      }
      setChartReady(false);
      return;
    }
  }, [tradingRoute, setIsGlobalLoading]);

  useEffect(() => {
    if (!tradingRoute) return;

    const onChartReady = () => setChartReady(true);

    window.addEventListener("tp:chartReady", onChartReady);
    window.addEventListener("tradepro:chart-ready", onChartReady);
    window.addEventListener("tp:candlesReady", onChartReady);

    return () => {
      window.removeEventListener("tp:chartReady", onChartReady);
      window.removeEventListener("tradepro:chart-ready", onChartReady);
      window.removeEventListener("tp:candlesReady", onChartReady);
    };
  }, [tradingRoute]);

  // ✅ fallback do chart apenas quando for trading
  useEffect(() => {
    if (!tradingRoute) return;

    const baseReady = !authLoading && accountReady && balanceReady && profileKnown;

    if (!baseReady) {
      chartFallbackArmedRef.current = false;
      if (chartFallbackTimerRef.current) {
        clearTimeout(chartFallbackTimerRef.current);
        chartFallbackTimerRef.current = null;
      }
      setChartReady(false);
      return;
    }

    if (chartReady) return;

    if (!chartFallbackArmedRef.current) {
      chartFallbackArmedRef.current = true;
      chartFallbackTimerRef.current = setTimeout(() => {
        setChartReady(true);
      }, 250);
    }
  }, [tradingRoute, authLoading, accountReady, balanceReady, profileKnown, chartReady]);

  // ✅ regra final do gate (somente trading)
  const allReady =
    tradingRoute &&
    !authLoading &&
    accountReady &&
    balanceReady &&
    profileKnown &&
    chartReady;

  // ✅ domina loading global somente quando tradingRoute = true
  useEffect(() => {
    if (!tradingRoute) return;
    setIsGlobalLoading(!allReady);
  }, [tradingRoute, allReady, setIsGlobalLoading]);

  return null;
}