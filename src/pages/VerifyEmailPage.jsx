import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/services/supabaseClient";
import BrandLogo from "@/components/BrandLogo/BrandLogo";

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [state, setState] = useState("loading"); // loading | success | error
  const [msg, setMsg] = useState("Verificando seu e-mail...");
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);

  const token = useMemo(() => params.get("token"), [params]);

  useEffect(() => {
    function updateViewportMode() {
      const mobilePortrait =
        window.matchMedia("(max-width: 767px) and (orientation: portrait)").matches;
      setIsMobilePortrait(mobilePortrait);
    }

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);

    return () => {
      window.removeEventListener("resize", updateViewportMode);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let redirectTimer;

    (async () => {
      if (!token) {
        if (!alive) return;
        setState("error");
        setMsg("Link inválido. Abra o e-mail novamente e clique no botão de confirmação.");
        return;
      }

      const { data, error } = await supabase.functions.invoke("confirm-email-verification", {
        body: { token },
      });

      if (!alive) return;

      if (error || !data?.ok) {
        setState("error");
        setMsg("Não foi possível confirmar. Esse link pode ter expirado. Peça um novo em Perfil → Enviar confirmação.");
        return;
      }

      setState("success");
      setMsg("E-mail confirmado com sucesso!");

      redirectTimer = setTimeout(() => {
        navigate("/trade", { replace: true });
      }, 1200);
    })();

    return () => {
      alive = false;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [token, navigate]);

  const icon =
    state === "loading" ? "⏳" : state === "success" ? "✓" : "⚠";

  const title =
    state === "loading"
      ? "Verificando..."
      : state === "success"
      ? "Tudo certo!"
      : "Algo deu errado";

  const currentCardStyle = isMobilePortrait
    ? { ...styles.card, ...styles.cardMobilePortrait }
    : styles.card;

  const currentActionsStyle = isMobilePortrait
    ? { ...styles.actions, ...styles.actionsMobilePortrait }
    : styles.actions;

  const currentBtnStyle = isMobilePortrait
    ? { ...styles.btn, ...styles.btnMobilePortrait }
    : styles.btn;

  const currentBtnGhostStyle = isMobilePortrait
    ? { ...styles.btnGhost, ...styles.btnGhostMobilePortrait }
    : styles.btnGhost;

  const currentTitleStyle = isMobilePortrait
    ? { ...styles.title, ...styles.titleMobilePortrait }
    : styles.title;

  const currentMsgStyle = isMobilePortrait
    ? { ...styles.msg, ...styles.msgMobilePortrait }
    : styles.msg;

  const currentSmallStyle = isMobilePortrait
    ? { ...styles.small, ...styles.smallMobilePortrait }
    : styles.small;

  const currentPageStyle = isMobilePortrait
    ? { ...styles.page, ...styles.pageMobilePortrait }
    : styles.page;

  return (
    <div style={currentPageStyle}>
      <div style={styles.backdrop} />

      <div style={currentCardStyle} role="status" aria-live="polite">
        <div style={styles.headerWrap}>
          <style>{`.verify-email-brand{font-size:22px;display:inline-flex;align-items:center;}`}</style>
          <BrandLogo className="verify-email-brand" />
          <div style={styles.subtitle}>Confirmação de e-mail da sua conta</div>
        </div>

        <div style={styles.iconWrap}>
          <div
            style={{
              ...styles.iconCircle,
              ...(state === "loading"
                ? styles.iconCircleLoading
                : state === "success"
                ? styles.iconCircleSuccess
                : styles.iconCircleError),
            }}
          >
            <span style={styles.icon}>{icon}</span>
          </div>
        </div>

        <div style={currentTitleStyle}>{title}</div>
        <div style={currentMsgStyle}>{msg}</div>

        <div style={currentActionsStyle}>
          <button
            type="button"
            style={currentBtnStyle}
            onClick={() => navigate("/trade", { replace: true })}
          >
            Ir para o Trade
          </button>

          {state === "error" && (
            <button
              type="button"
              style={currentBtnGhostStyle}
              onClick={() => navigate("/login", { replace: true })}
            >
              Ir para o login
            </button>
          )}
        </div>

        <div style={styles.supportBox}>
          <div style={styles.supportTitle}>Precisa de ajuda?</div>
          <div style={styles.supportText}>
            Se você não solicitou essa verificação ou tiver qualquer dificuldade, fale com o suporte.
          </div>
          <a href="mailto:support@dominionblack.com" style={styles.supportLink}>
            support@dominionblack.com
          </a>
        </div>

        <div style={currentSmallStyle}>
          Você pode fechar esta tela após a confirmação.
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    width: "100%",
    minHeight: "100vh",
    position: "relative",
    overflow: "hidden",
    background: "#000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    boxSizing: "border-box",
    fontFamily:
      'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial',
  },

  pageMobilePortrait: {
    alignItems: "flex-start",
    padding: "30px 12px 18px",
  },

  backdrop: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(ellipse at top, rgba(59,130,246,0.08), transparent 58%), radial-gradient(ellipse at bottom, rgba(37,99,235,0.07), transparent 60%)",
    opacity: 1,
    pointerEvents: "none",
  },

  card: {
    position: "relative",
    zIndex: 2,
    width: "min(440px, calc(100% - 32px))",
    borderRadius: 16,
    padding: "24px 20px",
    background: "rgba(8, 12, 18, 0.84)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 10px 40px rgba(0,0,0,0.45)",
    backdropFilter: "blur(10px)",
    color: "#e9eef7",
    textAlign: "center",
    boxSizing: "border-box",
  },

  cardMobilePortrait: {
    width: "100%",
    maxWidth: "none",
    background: "transparent",
    border: "none",
    boxShadow: "none",
    backdropFilter: "none",
    padding: "0",
    borderRadius: 0,
  },

  headerWrap: {
    textAlign: "center",
    marginBottom: 18,
  },

  subtitle: {
    color: "rgba(157, 181, 255, 0.82)",
    marginTop: 8,
    fontSize: 13,
    lineHeight: 1.5,
  },

  iconWrap: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 12,
  },

  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(255,255,255,0.08)",
  },

  iconCircleLoading: {
    background: "rgba(59, 130, 246, 0.14)",
    boxShadow: "0 0 0 6px rgba(59,130,246,0.05)",
  },

  iconCircleSuccess: {
    background: "rgba(34, 197, 94, 0.14)",
    boxShadow: "0 0 0 6px rgba(34,197,94,0.05)",
  },

  iconCircleError: {
    background: "rgba(239, 68, 68, 0.14)",
    boxShadow: "0 0 0 6px rgba(239,68,68,0.05)",
  },

  icon: {
    fontSize: 26,
    fontWeight: 900,
    color: "#ffffff",
    lineHeight: 1,
  },

  title: {
    fontSize: 20,
    fontWeight: 900,
    marginBottom: 8,
    color: "#ffffff",
  },

  titleMobilePortrait: {
    fontSize: 18,
  },

  msg: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "rgba(203, 213, 245, 0.92)",
    marginBottom: 18,
  },

  msgMobilePortrait: {
    fontSize: 12,
    marginBottom: 16,
  },

  actions: {
    display: "flex",
    gap: 10,
    justifyContent: "center",
    marginBottom: 16,
    flexWrap: "wrap",
  },

  actionsMobilePortrait: {
    flexDirection: "column",
    gap: 10,
    alignItems: "stretch",
  },

  btn: {
    border: "none",
    cursor: "pointer",
    padding: "11px 16px",
    borderRadius: 12,
    fontWeight: 800,
    fontSize: 13,
    background: "linear-gradient(135deg, #3b82f6, #2563eb)",
    color: "#ffffff",
    minWidth: 148,
    boxShadow: "0 12px 26px rgba(59, 130, 246, 0.16)",
  },

  btnMobilePortrait: {
    width: "100%",
    minWidth: 0,
    height: 42,
    padding: "0 14px",
    fontSize: 12,
    borderRadius: 11,
  },

  btnGhost: {
    border: "1px solid rgba(255,255,255,0.14)",
    cursor: "pointer",
    padding: "11px 16px",
    borderRadius: 12,
    fontWeight: 800,
    fontSize: 13,
    background: "transparent",
    color: "#e9eef7",
    minWidth: 136,
  },

  btnGhostMobilePortrait: {
    width: "100%",
    minWidth: 0,
    height: 42,
    padding: "0 14px",
    fontSize: 12,
    borderRadius: 11,
  },

  supportBox: {
    marginTop: 4,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(30, 41, 59, 0.78)",
    background: "rgba(7, 14, 24, 0.7)",
    textAlign: "center",
  },

  supportTitle: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 6,
  },

  supportText: {
    color: "rgba(157, 181, 255, 0.82)",
    fontSize: 12,
    lineHeight: 1.45,
  },

  supportLink: {
    display: "inline-block",
    marginTop: 8,
    color: "#60a5fa",
    textDecoration: "none",
    fontSize: 12,
    fontWeight: 900,
    wordBreak: "break-word",
  },

  small: {
    marginTop: 14,
    fontSize: 11,
    opacity: 0.6,
    color: "#cbd5f5",
  },

  smallMobilePortrait: {
    marginTop: 12,
    fontSize: 10,
  },

  dominionLogo: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    lineHeight: 1,
    gap: 0,
    userSelect: "none",
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: "0.6px",
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
  },

  dominionMain: {
    display: "inline-flex",
    alignItems: "center",
    lineHeight: 1,
  },

  dominionDWrap: {
    position: "relative",
    display: "inline-block",
    lineHeight: 1,
  },

  dominionD: {
    position: "relative",
    display: "inline-block",
    zIndex: 2,
    background: "linear-gradient(180deg, #ffffff 0%, #e9e9e9 35%, #bdbdbd 70%, #ffffff 100%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextStroke: "0.6px rgba(255, 255, 255, 0.14)",
    textShadow:
      "0 1px 0 rgba(255, 255, 255, 0.08), 0 10px 22px rgba(0, 0, 0, 0.55), 0 0 18px rgba(255, 255, 255, 0.08)",
  },

  dominionRest: {
    background: "linear-gradient(180deg, #ffffff 0%, #e9e9e9 35%, #bdbdbd 70%, #ffffff 100%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextStroke: "0.6px rgba(255, 255, 255, 0.14)",
    textShadow:
      "0 1px 0 rgba(255, 255, 255, 0.08), 0 10px 22px rgba(0, 0, 0, 0.55), 0 0 18px rgba(255, 255, 255, 0.08)",
  },

  iFix: {
    position: "relative",
    display: "inline-block",
    lineHeight: 1,
    background: "linear-gradient(180deg, #ffffff 0%, #e9e9e9 35%, #bdbdbd 70%, #ffffff 100%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextStroke: "0.6px rgba(255, 255, 255, 0.14)",
    textShadow:
      "0 1px 0 rgba(255, 255, 255, 0.08), 0 10px 22px rgba(0, 0, 0, 0.55), 0 0 18px rgba(255, 255, 255, 0.08)",
    isolation: "isolate",
  },

  dominionAccent: {
    color: "#c1121f",
    WebkitTextStroke: "0.6px rgba(255, 255, 255, 0.14)",
    textShadow:
      "0 1px 0 rgba(255, 255, 255, 0.08), 0 10px 22px rgba(0, 0, 0, 0.55), 0 0 18px rgba(255, 255, 255, 0.08), 0 0 8px rgba(193, 18, 31, 0.35), 0 0 18px rgba(193, 18, 31, 0.25)",
    marginLeft: 8,
  },

  dominionCrownContainer: {
    position: "absolute",
    top: "-0.57em",
    left: "-0.62em",
    transformOrigin: "98% 92%",
    transform: "rotate(-43deg) translate(0.08em, 0.48em) scale(0.82)",
    pointerEvents: "none",
    zIndex: 10,
  },

  dominionCrown: {
    position: "relative",
    width: "0.62em",
    height: "0.44em",
    background: "#ffcc00",
    clipPath: "polygon(0% 100%, 0% 20%, 25% 60%, 50% 0%, 75% 60%, 100% 20%, 100% 100%)",
    filter:
      "drop-shadow(0 0 0.16em rgba(255, 220, 80, 0.85)) drop-shadow(0 0 0.34em rgba(255, 204, 0, 0.45)) drop-shadow(0 0.18em 0.30em rgba(0, 0, 0, 0.45))",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-end",
    paddingBottom: "0.06em",
    zIndex: 3,
    overflow: "hidden",
  },

  dominionDiamond: {
    width: "0.09em",
    height: "0.09em",
    margin: "0 0.03em",
    borderRadius: "50%",
    boxShadow: "0 0 0.18em currentColor",
  },

  dominionBlue: { background: "#00d4ff", color: "#00d4ff" },
  dominionRed: { background: "#ff0000", color: "#ff0000" },
  dominionGreen: { background: "#00ff44", color: "#00ff44" },

  dominionParticles: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: "0.95em",
    height: "0.95em",
    transform: "translate(-50%, -50%)",
    background: "radial-gradient(circle, rgba(255,204,0,0.14) 0%, transparent 70%)",
    zIndex: 2,
    borderRadius: 999,
  },
};