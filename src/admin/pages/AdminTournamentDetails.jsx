import { useParams, useNavigate } from "react-router-dom";
import { useTournament } from "../../context/TournamentContext";

export default function AdminTournamentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const {
    tournaments,
    ranking,
    active,
    remaining,
    currentTournament,
    forceStart,
    forceFinish,
    resetRanking,
  } = useTournament();

  const tournament = tournaments.find((t) => String(t.id) === id);
  const list = ranking[id] || [];
  const isCurrent = currentTournament?.id === tournament?.id;

  function formatTime(sec) {
    if (!sec && sec !== 0) return "--";
    const m = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button onClick={() => navigate(-1)}>← Voltar</button>
        <div>
          <h2>{tournament?.name}</h2>
          <span style={styles.status}>{tournament?.status}</span>
        </div>
      </header>

      <div style={styles.meta}>
        <div>
          <strong>Status:</strong>{" "}
          {isCurrent && active ? "Em andamento" : tournament?.status}
        </div>
        <div>
          <strong>Tempo restante:</strong>{" "}
          {isCurrent && active ? formatTime(remaining) : "--"}
        </div>
      </div>

      {/* 🔐 CONTROLES ADMIN */}
      <div style={styles.actions}>
        {!active && (
          <button style={styles.primary} onClick={() => forceStart(tournament.id)}>
            ▶️ Iniciar
          </button>
        )}

        {isCurrent && active && (
          <button style={styles.danger} onClick={forceFinish}>
            ⛔ Encerrar
          </button>
        )}

        <button style={styles.secondary} onClick={() => resetRanking(tournament.id)}>
          🔄 Resetar Ranking
        </button>
      </div>

      {/* 💰 PREMIAÇÃO */}
      <div style={styles.prizes}>
        <h4>Premiação</h4>
        {Object.entries(tournament.prizes).map(([pos, val]) => (
          <div key={pos}>
            {pos}º lugar — <strong>R$ {val.toLocaleString()}</strong>
          </div>
        ))}
      </div>

      <div style={styles.list}>
        {list.map((u, index) => {
          const isLocked = index < 5;
          const isUser = u.id === "user";

          return (
            <div
              key={u.id}
              style={{
                ...styles.row,
                borderLeft: isLocked
                  ? "4px solid #ef4444"
                  : isUser
                  ? "4px solid #22c55e"
                  : "4px solid transparent",
              }}
            >
              <span>{index + 1}º</span>
              <span>{u.name}</span>
              <span>R$ {u.balance.toLocaleString()}</span>
              <span>{isLocked ? "🔒" : isUser ? "👤" : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  container: { padding: 20, color: "#fff", height: "100%" },
  header: { display: "flex", gap: 16, alignItems: "center", marginBottom: 16 },
  status: { fontSize: 12, opacity: 0.7 },
  meta: { display: "flex", gap: 30, marginBottom: 20 },
  actions: { display: "flex", gap: 10, marginBottom: 20 },
  prizes: {
    background: "#151515",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  primary: { background: "#22c55e", padding: "8px 14px", borderRadius: 8 },
  danger: { background: "#ef4444", padding: "8px 14px", borderRadius: 8 },
  secondary: { background: "#2a2a2a", padding: "8px 14px", borderRadius: 8 },
  list: { display: "flex", flexDirection: "column", gap: 6 },
  row: {
    display: "grid",
    gridTemplateColumns: "60px 1fr 160px 60px",
    padding: "10px 12px",
    background: "#151515",
    borderRadius: 8,
  },
};
