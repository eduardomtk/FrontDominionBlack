import styles from "./TournamentHistoryPanel.module.css";
import { useTournament } from "../../../context/TournamentContext";

export default function TournamentHistoryPanel({ onClose }) {
  const { history } = useTournament();

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <aside className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <span>📜 Histórico de Torneios</span>

          <button className={styles.close} onClick={onClose}>
            ✕
          </button>
        </header>

        <div className={styles.list}>
          {history.length === 0 && (
            <div className={styles.empty}>
              Nenhum torneio encerrado ainda
            </div>
          )}

          {history.map((t) => (
            <div key={t.id} className={styles.card}>
              <div className={styles.name}>{t.name}</div>

              <div className={styles.date}>
                Encerrado em{" "}
                {new Date(t.finishedAt).toLocaleString("pt-BR")}
              </div>

              <ul className={styles.ranking}>
                {t.ranking.map((u, i) => (
                  <li key={u.id}>
                    <span className={styles.pos}>#{i + 1}</span>
                    <span>{u.name}</span>
                    <span className={styles.balance}>
                      R$ {u.balance.toLocaleString("pt-BR")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
