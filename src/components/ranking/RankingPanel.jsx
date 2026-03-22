// src/components/RankingPanel/RankingPanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./RankingPanel.module.css";
import { getRankingState, tickRanking } from "./rankingEngine";
import { ensureDailySnapshot } from "./rankingHistory";
import SoundManager from "@/sound/SoundManager.js";

// ✅ Supabase (fonte real)
import { supabase, DEFAULT_AVATAR_URL } from "@/services/supabaseClient";

const OVERLAY_OPEN_EVENT = "tradepro:overlay-open";
const OVERLAY_CLOSE_EVENT = "tradepro:overlay-close";

const BOTTOM_BAR_PX = 26;
const REMOTE_POLL_MS = 15000;

// ✅ Hard rule: não permitir fallback local automático (evita valores fora das regras)
const ENABLE_LOCAL_FALLBACK = false;

// ✅ Buckets candidatos (não precisa você confirmar agora)
const AVATAR_BUCKET_CANDIDATES = ["avatar", "avatars", "profile-avatars", "profile_avatars"];

function clampNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isHttpUrl(s) {
  return typeof s === "string" && (s.startsWith("http://") || s.startsWith("https://"));
}

// ✅ resolve avatar_path -> signedUrl (valida existência). NÃO trava render.
async function resolveAvatarPathToSignedUrl(path) {
  const v = String(path || "").trim();
  if (!v) return null;
  if (isHttpUrl(v)) return v;

  for (const bucket of AVATAR_BUCKET_CANDIDATES) {
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(v, 60 * 60);
      if (!error && data?.signedUrl) return data.signedUrl;
    } catch {
      // tenta próximo
    }
  }
  return null;
}

function normalizeRankingRow(row, index) {
  const id =
    row?.id ??
    row?.profile_id ??
    row?.user_id ??
    row?.uid ??
    row?.account_id ??
    index + 1;

  const name =
    row?.name ??
    row?.display_name ??
    row?.username ??
    row?.nickname ??
    `Trader ${index + 1}`;

  const profit =
    row?.profit ??
    row?.net_pnl ??
    row?.pnl ??
    row?.day_profit ??
    row?.value ??
    0;

  // RPC te entrega "avatar" (REAL=avatar_path, FAKE=http avatar_url)
  const avatarRaw =
    row?.avatar ??
    row?.avatar_url ??
    row?.avatarUrl ??
    row?.photo_url ??
    row?.photoUrl ??
    "";

  // ✅ Render imediato:
  // - se http, usa
  // - se path, cai no default por enquanto (e resolve async depois)
  const avatarImmediate = isHttpUrl(String(avatarRaw || "").trim()) ? String(avatarRaw).trim() : DEFAULT_AVATAR_URL;

  return {
    id: String(id),
    name: String(name),
    profit: clampNumber(profit, 0),
    avatarRaw: String(avatarRaw || "").trim(),
    avatar: avatarImmediate,
  };
}

async function fetchRankingTop200FromSupabase() {
  // ✅ chamada correta (evita erro e cair em fallback)
  const { data, error } = await supabase.rpc("get_ranking_day", { p_day: null });
  if (error) throw error;

  const list = Array.isArray(data) ? data : [];
  const normalized = list.slice(0, 200).map((row, i) => normalizeRankingRow(row, i));

  normalized.sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0));
  return normalized.slice(0, 200);
}

export default function RankingPanel({ onClose }) {
  const [ranking, setRanking] = useState([]);
  const [lastPositions, setLastPositions] = useState([]);

  const prevIndexByIdRef = useRef(new Map());
  const usingLocalFallbackRef = useRef(false);

  const portalTarget = useMemo(() => {
    if (typeof document === "undefined") return null;
    return (
      document.getElementById("overlay-root") ||
      document.getElementById("trading-overlay-host") ||
      document.body
    );
  }, []);

  const isInTradingHost = useMemo(() => {
    return Boolean(portalTarget && portalTarget.id === "trading-overlay-host");
  }, [portalTarget]);

  const handleClose = () => {
    SoundManager.uiClick?.();
    window.dispatchEvent(new CustomEvent(OVERLAY_CLOSE_EVENT, { detail: { id: "ranking" } }));
    onClose?.();
  };

  useEffect(() => {
    ensureDailySnapshot();

    let alive = true;
    let remoteInterval = null;
    let localInterval = null;
    let channel = null;
    let retryTimer = null;

    const applyRanking = (nextRanking) => {
      const prevMap = prevIndexByIdRef.current;

      const nextLastPositions = nextRanking.map((u, idx) => {
        const prevIdx = prevMap.get(String(u.id));
        return Number.isFinite(prevIdx) ? prevIdx : idx;
      });

      const newMap = new Map();
      nextRanking.forEach((u, idx) => newMap.set(String(u.id), idx));
      prevIndexByIdRef.current = newMap;

      setRanking(nextRanking);
      setLastPositions(nextLastPositions);
    };

    // ✅ resolve avatares em background SEM travar
    const hydrateAvatarsAsync = async (list) => {
      try {
        // pega só os que são path (não http) e ainda estão default
        const targets = list
          .map((u, idx) => ({ u, idx }))
          .filter(({ u }) => u && u.avatar === DEFAULT_AVATAR_URL && u.avatarRaw && !isHttpUrl(u.avatarRaw));

        if (targets.length === 0) return;

        // resolve em paralelo (limite simples por batches)
        const batchSize = 25;
        for (let i = 0; i < targets.length; i += batchSize) {
          if (!alive) return;

          const chunk = targets.slice(i, i + batchSize);
          const resolved = await Promise.all(
            chunk.map(async ({ u }) => {
              const url = await resolveAvatarPathToSignedUrl(u.avatarRaw);
              return url ? { id: u.id, url } : null;
            })
          );

          if (!alive) return;

          const map = new Map();
          for (const r of resolved) if (r?.id && r?.url) map.set(String(r.id), String(r.url));

          if (map.size === 0) continue;

          // aplica patch mínimo no state atual
          setRanking((curr) => {
            if (!Array.isArray(curr) || curr.length === 0) return curr;
            let changed = false;

            const next = curr.map((u) => {
              const url = map.get(String(u.id));
              if (!url) return u;
              if (u.avatar === url) return u;
              changed = true;
              return { ...u, avatar: url };
            });

            return changed ? next : curr;
          });
        }
      } catch {
        // silencioso
      }
    };

    const startLocalFallback = () => {
      usingLocalFallbackRef.current = true;

      const state = getRankingState();
      applyRanking(state.ranking);

      localInterval = setInterval(() => {
        const updated = tickRanking();
        applyRanking(updated.ranking);
      }, 5000);
    };

    const scheduleRetryRemote = () => {
      if (retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        startRemote();
      }, 2500);
    };

    const startRemote = async () => {
      try {
        const first = await fetchRankingTop200FromSupabase();
        if (!alive) return;

        usingLocalFallbackRef.current = false;

        // ✅ só aplica se vier lista
        if (Array.isArray(first) && first.length > 0) {
          applyRanking(first);
          hydrateAvatarsAsync(first);
        } else {
          // remoto vazio -> retry (sem inventar números)
          scheduleRetryRemote();
        }

        try {
          channel = supabase
            .channel("ranking_day_entries_live")
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "ranking_day_entries" },
              async () => {
                if (!alive) return;
                try {
                  const next = await fetchRankingTop200FromSupabase();
                  if (!alive) return;
                  if (Array.isArray(next) && next.length > 0) {
                    applyRanking(next);
                    hydrateAvatarsAsync(next);
                  }
                } catch {
                  scheduleRetryRemote();
                }
              }
            )
            .subscribe();
        } catch {
          channel = null;
        }

        remoteInterval = setInterval(async () => {
          try {
            const next = await fetchRankingTop200FromSupabase();
            if (!alive) return;
            if (Array.isArray(next) && next.length > 0) {
              applyRanking(next);
              hydrateAvatarsAsync(next);
            }
          } catch {
            scheduleRetryRemote();
          }
        }, REMOTE_POLL_MS);
      } catch {
        if (!alive) return;

        if (ENABLE_LOCAL_FALLBACK) startLocalFallback();
        else scheduleRetryRemote();
      }
    };

    startRemote();

    return () => {
      alive = false;
      if (remoteInterval) clearInterval(remoteInterval);
      if (localInterval) clearInterval(localInterval);
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {}
      }
    };
  }, []);

  useEffect(() => {
    const myId = "ranking";

    const onOtherOpen = (e) => {
      const otherId = e?.detail?.id;
      if (!otherId) return;
      if (otherId !== myId) handleClose();
    };

    window.addEventListener(OVERLAY_OPEN_EVENT, onOtherOpen);
    window.dispatchEvent(new CustomEvent(OVERLAY_OPEN_EVENT, { detail: { id: myId } }));

    return () => window.removeEventListener(OVERLAY_OPEN_EVENT, onOtherOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bottomCut = BOTTOM_BAR_PX;

  const content = (
    <div
      style={{
        position: isInTradingHost ? "absolute" : "fixed",
        inset: 0,
        zIndex: 30000,
        pointerEvents: "none",
      }}
    >
      <div
        className={styles.backdrop}
        onClick={handleClose}
        style={{
          position: isInTradingHost ? "absolute" : "fixed",
          top: 0,
          right: 0,
          bottom: bottomCut,
          left: isInTradingHost ? 0 : 64,
          width: isInTradingHost ? "100%" : "calc(100% - 64px)",
          padding: 0,
          margin: 0,
          display: "flex",
          alignItems: "stretch",
          justifyContent: "flex-start",
          pointerEvents: "auto",
        }}
      >
        <aside
          className={styles.panel}
          onClick={(e) => e.stopPropagation()}
          style={{
            marginLeft: 0,
            transform: "none",
            left: 0,
            top: isInTradingHost ? 0 : 60,
            bottom: bottomCut,
            height: isInTradingHost
              ? `calc(100% - ${bottomCut}px)`
              : `calc(100vh - 60px - ${bottomCut}px)`,
          }}
        >
          <header className={styles.header}>
            <div className={styles.titleContainer}>
              <div className={styles.liveDot}></div>
              <span className={styles.titleText}>TOP 200 MELHORES DO DIA</span>
            </div>

            <button
              className={styles.closeBtn}
              onClick={handleClose}
              type="button"
              aria-label="Fechar"
              title="Fechar"
            >
              ✕
            </button>
          </header>

          <div className={styles.list}>
            {ranking.slice(0, 200).map((user, index) => {
              const last = lastPositions[index] ?? index;
              const diff = last - index;

              return (
                <div
                  key={user.id}
                  className={`${styles.row} ${diff > 0 ? styles.up : diff < 0 ? styles.down : ""}`}
                >
                  <span className={styles.rank}>{index + 1}º</span>
                  <img src={user.avatar} className={styles.avatar} alt="" />
                  <span className={styles.name}>{user.name}</span>
                  <span className={styles.profit}>
                    +R$ {Math.floor(user.profit).toLocaleString("pt-BR")}
                  </span>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );

  if (!portalTarget) return content;
  return createPortal(content, portalTarget);
}