import { useTournament } from "../../context/TournamentContext";

export default function AdminBalance() {
  const { balance, history } = useTournament();

  return (
    <div style={styles.container}>
      <h2>Financeiro</h2>

      <div style={styles.cards}>
        <div style={styles.card}>
          <span>Saldo atual do usuário</span>
          <strong>R$ {balance.toLocaleString()}</strong>
        </div>

        <div style={styles.card}>
          <span>Torneios encerrados</span>
          <strong>{history.length}</strong>
        </div>
      </div>

      <h3 style={{ marginTop: 30 }}>Histórico de Torneios</h3>

      {history.length === 0 && (
        <p style={{ opacity: 0.6 }}>Nenhum torneio finalizado ainda.</p>
      )}

      <div style={styles.history}>
        {history.map((h) => (
          <div key={h.id} style={styles.historyCard}>
            <strong>{h.name}</strong>

            <div style={styles.prizes}>
              {(Array.isArray(h.prizes) ? h.prizes : []).map((p) => (
                <div key={p.position} style={styles.prize}>
                  {p.position}º lugar — R$ {p.amount.toLocaleString()}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: 20,
    color: "#fff",
  },

  cards: {
    display: "flex",
    gap: 20,
    flexWrap: "wrap",
  },

  card: {
    background: "#151515",
    padding: 16,
    borderRadius: 10,
    minWidth: 220,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },

  history: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginTop: 16,
  },

  historyCard: {
    background: "#151515",
    padding: 14,
    borderRadius: 10,
  },

  prizes: {
    marginTop: 8,
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },

  prize: {
    fontSize: 13,
    opacity: 0.85,
  },
};
