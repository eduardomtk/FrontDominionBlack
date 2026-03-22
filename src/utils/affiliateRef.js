function AffiliateRefCapture() {
  const location = useLocation();
  const AFF_REF_LS_KEY = "tp_aff_ref_code";

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const refFromUrl = String(params.get("ref") || "").trim();

      if (refFromUrl) {
        const existing = localStorage.getItem(AFF_REF_LS_KEY);

        // salva apenas se ainda não existir
        if (!existing) {
          localStorage.setItem(AFF_REF_LS_KEY, refFromUrl);
          console.log("✅ REF salvo:", refFromUrl);
        }
      }
    } catch (err) {
      console.error("Erro capturando ref:", err);
    }
  }, [location.pathname, location.search]); // 👈 MUITO IMPORTANTE

  return null;
}