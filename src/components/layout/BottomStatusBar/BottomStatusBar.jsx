import React, { useEffect, useMemo, useState } from "react";
import styles from "./BottomStatusBar.module.css";
import { FaExpand, FaCompress, FaVolumeUp, FaVolumeMute } from "react-icons/fa";
import SoundManager from "@/sound/SoundManager.js";
import { useMarketStore } from "@/stores/market.store";
// ✅ i18n
import { useTranslation } from "react-i18next";

export default function BottomStatusBar() {
  // ✅ Hook i18n com namespace primário
  const { t, i18n } = useTranslation("bottomStatusBar");
  const getServerNowMs = useMarketStore((state) => state.getServerNowMs);

  const [nowMs, setNowMs] = useState(() => {
    try {
      const v = Number(getServerNowMs?.());
      return Number.isFinite(v) && v > 0 ? v : Date.now();
    } catch {
      return Date.now();
    }
  });
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem("tp_muted") === "1");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ✅ Formatação com traduções usando o relógio soberano do servidor
  const label = useMemo(() => {
    const now = new Date(nowMs);
    const parts = new Intl.DateTimeFormat(i18n.language || "pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(now);

    const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
    const day = get("day");
    const monthRaw = get("month");

    const monthMap = {
      january: "jan",
      february: "feb",
      march: "mar",
      april: "apr",
      may: "may",
      june: "jun",
      july: "jul",
      august: "aug",
      september: "sep",
      october: "oct",
      november: "nov",
      december: "dec",
      janeiro: "jan",
      fevereiro: "feb",
      março: "mar",
      abril: "apr",
      maio: "may",
      junho: "jun",
      julho: "jul",
      agosto: "aug",
      setembro: "sep",
      outubro: "oct",
      novembro: "nov",
      dezembro: "dec",
    };

    const monthKey = monthMap[monthRaw?.toLowerCase()] || "jan";
    const month = t(`months.${monthKey}`);
    const hour = get("hour");
    const minute = get("minute");
    const second = get("second");

    return `${t("time.prefix", { day, month })}${t("time.time", {
      hour,
      minute,
      second,
    })} ${t("time.suffix")}`;
  }, [nowMs, t, i18n.language]);

  useEffect(() => {
    const syncNow = () => {
      try {
        const v = Number(getServerNowMs?.());
        setNowMs(Number.isFinite(v) && v > 0 ? v : Date.now());
      } catch {
        setNowMs(Date.now());
      }
    };

    syncNow();
    const id = setInterval(syncNow, 250);
    return () => clearInterval(id);
  }, [getServerNowMs]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // ✅ garante que o SoundManager respeite o estado persistido
  useEffect(() => {
    SoundManager.setMuted?.(isMuted);
  }, [isMuted]);

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;

      SoundManager.setMuted?.(next);

      if (next === false) {
        SoundManager.uiClick?.();
      }

      localStorage.setItem("tp_muted", next ? "1" : "0");
      return next;
    });
  };

  const toggleFullscreen = async () => {
    SoundManager.uiClick?.();
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // silencioso
    }
  };

  return (
    <div className={styles.bar}>
      <div className={styles.leftText} aria-label={label}>
        {label}
      </div>

      <div className={styles.actionsWrap}>
        <div className={styles.divider} />

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={toggleMute}
            title={isMuted ? t("actions.sound_on") : t("actions.sound_off")}
            aria-label={isMuted ? t("actions.sound_on") : t("actions.sound_off")}
          >
            {isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
          </button>

          <button
            type="button"
            className={styles.iconBtn}
            onClick={toggleFullscreen}
            title={isFullscreen ? t("actions.fullscreen_exit") : t("actions.fullscreen_enter")}
            aria-label={isFullscreen ? t("actions.fullscreen_exit") : t("actions.fullscreen_enter")}
          >
            {isFullscreen ? <FaCompress /> : <FaExpand />}
          </button>
        </div>
      </div>
    </div>
  );
}
