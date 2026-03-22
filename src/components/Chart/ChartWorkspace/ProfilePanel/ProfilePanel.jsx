import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./ProfilePanel.module.css";
import SoundManager from "@/sound/SoundManager.js";
// ✅ i18n
import { useTranslation } from "react-i18next";

// ✅ mesmos eventos globais usados pelos overlays
const OVERLAY_OPEN_EVENT = "tradepro:overlay-open";

function shortId(id, head = 8, tail = 4) {
  const s = String(id || "");
  if (!s) return "";
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function getOverlayRoot() {
  if (typeof document === "undefined") return null;

  // ✅ Preferencial: #overlay-root no HTML
  const el = document.getElementById("overlay-root");
  if (el) return el;

  // ✅ Fallback: body (não quebra)
  return document.body;
}

// ✅ helper: abrir overlays via evento global
function emitOverlayOpen(id) {
  try {
    window.dispatchEvent(new CustomEvent(OVERLAY_OPEN_EVENT, { detail: { id } }));
  } catch {
    // noop: fallback silencioso
  }
}

export default function ProfilePanel({
  open,
  anchorRef,
  onClose,
  onAction, // (key) => void
  user, // opcional: { name, email, id, avatarUrl }
}) {
  // ✅ i18n hook
  const { t } = useTranslation(["common", "profilePanel"]);

  const panelRef = useRef(null);

  const items = useMemo(
    () => [
      { key: "trade", label: t("profilePanel:items.trade"), icon: "📈" },
      { key: "profile", label: t("profilePanel:items.profile"), icon: "👤" },
      { key: "deposit", label: t("profilePanel:items.deposit"), icon: "💳" },
      { key: "withdraw", label: t("profilePanel:items.withdraw"), icon: "🏦" },
      { key: "support", label: t("profilePanel:items.support", "Suporte"), icon: "🎧" },
    ],
    [t]
  );

  // ESC fecha (sem som)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // clique fora fecha (sem som)
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e) => {
      const panel = panelRef.current;
      if (!panel) return;

      if (panel.contains(e.target)) return;

      const anchorEl = anchorRef?.current;
      if (anchorEl && anchorEl.contains(e.target)) return;

      onClose?.();
    };

    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () =>
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [open, onClose, anchorRef]);

  const anchorRect = anchorRef?.current?.getBoundingClientRect?.();

  const stylePos = useMemo(() => {
    if (!anchorRect || typeof window === "undefined") return {};

    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      const mobilePanelWidth = Math.min(132, window.innerWidth - 16);
      const top = Math.round(anchorRect.bottom + 8);
      const left = Math.round(
        Math.max(8, Math.min(anchorRect.left, window.innerWidth - mobilePanelWidth - 8))
      );

      return {
        top: `${top}px`,
        left: `${left}px`,
        right: "auto",
      };
    }

    const top = Math.round(anchorRect.bottom + 10);
    const right = Math.round(window.innerWidth - anchorRect.right);

    return {
      top: `${top}px`,
      right: `${Math.max(10, right)}px`,
      left: "auto",
    };
  }, [anchorRect]);

  if (!open) return null;

  const click = (fn) => {
    SoundManager.uiClick();
    fn?.();
  };

  const handleItemAction = (key) => {
    if (key === "support") {
      emitOverlayOpen("support");
      onClose?.();
      return;
    }

    onAction?.(key);
  };

  const displayName = user?.name || t("profilePanel:user.default_name");
  const userId = user?.id || "";
  const avatarUrl = user?.avatarUrl || "";

  const portalTarget = getOverlayRoot();
  if (!portalTarget) return null;

  return createPortal(
    <div
      className={styles.layer}
      aria-hidden={!open}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 30000,
        pointerEvents: "none",
        background: "transparent",
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        style={{
          ...stylePos,
          pointerEvents: "auto",
        }}
        role="menu"
        aria-label={t("profilePanel:aria.menu_label")}
      >
        <div className={styles.header}>
          <div className={styles.avatar} aria-hidden="true">
            {avatarUrl ? (
              <img className={styles.avatarImg} src={avatarUrl} alt="" />
            ) : (
              <span className={styles.avatarInner}>👤</span>
            )}
          </div>

          <div className={styles.userBlock}>
            <div className={styles.userName}>{displayName}</div>

            <div className={styles.userMeta}>
              {userId
                ? `${t("profilePanel:user.id_prefix")}${shortId(userId, 8, 4)}`
                : t("profilePanel:user.manage_account")}
            </div>
          </div>

          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => click(() => onClose?.())}
            aria-label={t("profilePanel:actions.close")}
            title={t("profilePanel:actions.close")}
          >
            ✕
          </button>
        </div>

        <div className={styles.divider} />

        <div className={styles.menu}>
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              className={styles.item}
              onClick={() => click(() => handleItemAction(it.key))}
              role="menuitem"
            >
              <span className={styles.itemIcon} aria-hidden="true">
                {it.icon}
              </span>
              <span className={styles.itemLabel}>{it.label}</span>
              <span className={styles.itemArrow} aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>

        <div className={styles.divider} />

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.logout}
            onClick={() => click(() => onAction?.("logout"))}
          >
            <span className={styles.itemIcon} aria-hidden="true">
              🚪
            </span>
            <span className={styles.itemLabel}>{t("profilePanel:actions.logout")}</span>
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}