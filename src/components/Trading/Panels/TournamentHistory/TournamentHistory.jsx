import styles from "./TournamentHistory.module.css";
import { useTournament } from "../../../../context/TournamentContext";

export default function TournamentHistory({ onClose }) {
  const { history } = useTournament();

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <aside className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.title}>🏆 Histórico de Torneios</div>
          <button onClick={onClose}>✕</button>
        </header>

        {history.length === 0 && (
          <div className={styles.empty}>
            Nenhum torneio encerrado ainda
          </div>
        )}

        {history.map((t) => (
          <div key={t.id} className={styles.card}>
            <div className={styles.name}>{t.name}</div>
            <div className={styles.subtitle}>
              Status: <strong>Encerrado</strong>
            </div>

            <ul className={styles.podium}>
              {t.ranking.slice(0, 3).map((u, i) => (
                <li key={u.id}>
                  <span className={styles.medal}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                  </span>
                  <img src={u.avatar} />
                  <span>{u.name}</span>
                </li>
              ))}
            </ul>

            <div className={styles.prizeInfo}>
              Premiação automática processada (visual)
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
