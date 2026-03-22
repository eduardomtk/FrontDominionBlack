import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./SupportModal.module.css";
import SoundManager from "@/sound/SoundManager.js";
import { FiSend, FiMail } from "react-icons/fi";

// ✅ Brand logo (topo)
import BrandLogo from "@/components/BrandLogo/BrandLogo.jsx";

function clampNonNeg(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

/**
 * SupportModal (OnBroker-like)
 * - Respeita header/sidebar/footer usando o mesmo modelo do WalletModal:
 *   - Preferência: #trading-overlay-host (recorte perfeito)
 *   - Fallback: bounds calculados via #trading-header, #trading-left, #trading-footer-fixed
 */
export default function SupportModal({
  isOpen,
  onClose,
  usePortal = true,
  portalContainer = null,
}) {
  const [overlayVars, setOverlayVars] = useState({
    "--sm-top": "0px",
    "--sm-left": "0px",
    "--sm-right": "0px",
    "--sm-bottom": "0px",
  });

  const computeBounds = useCallback(() => {
    if (typeof document === "undefined") return;

    const headerEl = document.getElementById("trading-header");
    const leftEl = document.getElementById("trading-left");
    const footerEl = document.getElementById("trading-footer-fixed");

    const headerRect = headerEl?.getBoundingClientRect?.();
    const leftRect = leftEl?.getBoundingClientRect?.();
    const footerRect = footerEl?.getBoundingClientRect?.();

    const top = clampNonNeg(Math.round(headerRect?.bottom || 0));
    const left = clampNonNeg(Math.round(leftRect?.right || 0));
    const bottom = footerRect
      ? clampNonNeg(Math.round(window.innerHeight - footerRect.top))
      : 0;

    setOverlayVars({
      "--sm-top": `${top}px`,
      "--sm-left": `${left}px`,
      "--sm-right": "0px",
      "--sm-bottom": `${bottom}px`,
    });
  }, []);

  const portalTarget = useMemo(() => {
    if (!usePortal) return null;
    if (typeof document === "undefined") return null;

    // ✅ prioriza o host oficial do TradingLayout
    const host = document.getElementById("trading-overlay-host");
    return portalContainer || host || document.body;
  }, [usePortal, portalContainer]);

  const isTradingHost = useMemo(() => {
    return Boolean(
      usePortal && portalTarget && portalTarget.id === "trading-overlay-host"
    );
  }, [usePortal, portalTarget]);

  useEffect(() => {
    if (!isOpen) return;
    if (!usePortal) return;

    // ✅ se estiver no host, o recorte é natural via CSS (absolute inset:0)
    if (isTradingHost) return;

    computeBounds();
    const onResize = () => computeBounds();
    window.addEventListener("resize", onResize);

    const t0 = setTimeout(() => computeBounds(), 0);
    const t1 = setTimeout(() => computeBounds(), 50);

    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      window.removeEventListener("resize", onResize);
    };
  }, [isOpen, usePortal, isTradingHost, computeBounds]);

  // ESC fecha
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        SoundManager.uiClick();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  // trava scroll do body enquanto aberto (somente quando estiver no body)
  useEffect(() => {
    if (!isOpen) return;
    if (!usePortal) return;
    if (isTradingHost) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen, usePortal, isTradingHost]);

  const overlayStyle = useMemo(() => {
    if (isTradingHost) return undefined;
    return overlayVars;
  }, [isTradingHost, overlayVars]);

  if (!isOpen) return null;

  const email = "support@dominionblack.com";

  const content = (
    <div
      className={styles.overlayArea}
      style={overlayStyle}
      role="dialog"
      aria-modal="false"
      aria-label="Suporte"
      onMouseDown={(e) => {
        // clicar no fundo fecha (igual UX padrão)
        if (e.target === e.currentTarget) {
          SoundManager.uiClick();
          onClose?.();
        }
      }}
    >
      <div className={styles.panel}>
        <div className={styles.modalFill}>
          {/* ✅ OnBroker: só o X no topo, sem “barra” */}
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => {
              SoundManager.uiClick();
              onClose?.();
            }}
            aria-label="Fechar"
            title="Fechar"
          >
            ✕
          </button>

          <div className={styles.body}>
            {/* ✅ card invisível (só área de layout), igual “tela única” */}
            <div className={styles.card}>
              {/* ✅ TOP: linha única "Suporte DominionBlack" sem espaçamento estranho */}
              <div className={styles.title}>
                <span className={styles.titlePrefix}>Suporte</span>
                <BrandLogo className={styles.titleBrand} />
              </div>

              <div className={styles.subtitle}>Ajude-nos a melhorar!</div>

              <div className={styles.textBlock}>
                <p>
                  Valorizamos sua experiência em nossa plataforma e agradecemos
                  qualquer feedback que possa nos ajudar a nos tornar a melhor
                  corretora do mercado.
                </p>

                <p>
                  Se você encontrar algum bug ou erro, por favor, entre em
                  contato conosco imediatamente.
                </p>

                <p>
                  Além disso, estamos sempre abertos a receber sugestões e
                  críticas construtivas sobre nossos serviços.
                  <br />
                  Sua opinião é fundamental para aprimorar a experiência de
                  nossos usuários.
                </p>

                <p className={styles.contactLine}>
                  Para entrar em contato, envie um email para{" "}
                  <a
                    className={styles.emailLink}
                    href={`mailto:${email}`}
                    onClick={() => SoundManager.uiClick()}
                  >
                    {email}
                  </a>
                </p>

                <p>
                  Muito obrigado por sua ajuda e, mais uma vez, seja bem-vindo à
                  revolução.
                </p>
              </div>

              {/* ✅ Rodapé: remove logo/bolinha — deixa SOMENTE os ícones */}
              <div className={styles.bottomRow}>
                <div className={styles.actions} aria-hidden>
                  <FiSend className={styles.actionIcon} size={18} />
                  <FiMail className={styles.actionIcon} size={18} />
                </div>
              </div>
            </div>

            <div className={styles.safeSpacer} />
          </div>
        </div>
      </div>
    </div>
  );

  if (usePortal) {
    if (!portalTarget) return null;
    return createPortal(content, portalTarget);
  }

  return content;
}