import { useEffect, useRef, useState } from "react";
import styles from "./TournamentPanel.module.css";
import { useTournament } from "../../../context/TournamentContext";
import TournamentHistoryPanel from "./TournamentHistoryPanel";
import SoundManager from "@/sound/SoundManager.js";

export default function TournamentPanel({ onClose }) {
  const { tournaments = [], ranking = {}, active, remaining, balance } =
    useTournament();

  const [showHistory, setShowHistory] = useState(false);
  const prevRankingRef = useRef({});

  const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
  const seconds = String(remaining % 60).padStart(2, "0");

  useEffect(() => {
    prevRankingRef.current = ranking;
  }, [ranking]);

  function getMovement(tid, uid, index) {
    const prev = prevRankingRef.current[tid];
    if (!prev) return null;

    const oldIndex = prev.findIndex(u => u.id === uid);
    if (oldIndex === -1) return null;

    if (oldIndex > index) return "up";
    if (oldIndex < index) return "down";
    return null;
  }

  function getBalanceDiff(tid, uid, balance) {
    const prev = prevRankingRef.current[tid];
    if (!prev) return null;

    const old = prev.find(u => u.id === uid);
    if (!old) return null;

    if (balance > old.balance) return "gain";
    if (balance < old.balance) return "loss";
    return null;
  }

  return (
    <>
      <div className={styles.backdrop} onClick={onClose}>
        <aside className={styles.panel} onClick={e => e.stopPropagation()}>
          <header className={styles.header}>
            <div className={styles.title}>🏆 Torneios</div>
            <button
              onClick={() => {
                SoundManager.uiClick?.();
                onClose?.();
              }}
            >
              ✕
            </button>
          </header>

          <div className={styles.grid}>
            {tournaments.map(t => (
              <div key={t.id} className={styles.card}>
                <div className={styles.cardTitle}>{t.name}</div>
                <div className={styles.time}>
                  {t.start} - {t.end}
                </div>

                <div
                  className={`${styles.status} ${
                    t.status === "Em andamento"
                      ? styles.running
                      : t.status === "Próximo"
                      ? styles.upcoming
                      : styles.finished
                  }`}
                >
                  {t.status}
                </div>

                <ul className={styles.ranking}>
                  {(ranking[t.id] || []).slice(0, 10).map((u, i) => {
                    const move = getMovement(t.id, u.id, i);
                    const diff = getBalanceDiff(t.id, u.id, u.balance);

                    return (
                      <li
                        key={u.id}
                        className={`${move ? styles[move] : ""} ${
                          diff ? styles[diff] : ""
                        }`}
                      >
                        <span className={styles.pos}>
                          {i === 0 && "🥇"}
                          {i === 1 && "🥈"}
                          {i === 2 && "🥉"}
                          {i > 2 && `#${i + 1}`}
                        </span>

                        <span>{u.name}</span>

                        <strong>
                          R$ {u.balance.toLocaleString("pt-BR")}
                        </strong>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div className={styles.footer}>
            {active && (
              <>
                <span>
                  ⏱ {minutes}:{seconds}
                </span>
                <span>
                  💰 R$ {balance.toLocaleString("pt-BR")}
                </span>
              </>
            )}

            <button
              className={styles.historyBtn}
              onClick={() => {
                SoundManager.uiClick?.();
                setShowHistory(true);
              }}
            >
              📜 Histórico de Torneios
            </button>
          </div>
        </aside>
      </div>

      {showHistory && (
        <TournamentHistoryPanel
          onClose={() => {
            SoundManager.uiClick?.();
            setShowHistory(false);
          }}
        />
      )}
    </>
  );
}
