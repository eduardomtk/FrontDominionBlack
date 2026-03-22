import { useTournament } from "../../context/TournamentContext";

export default function AdminTournamentConfig() {
  const { tournaments, updateTournament } = useTournament();

  return (
    <div style={styles.container}>
      <h2>Configuração de Torneios</h2>

      <div style={styles.list}>
        {tournaments.map((t) => (
          <div key={t.id} style={styles.card}>
            <strong>{t.name}</strong>

            <div style={styles.row}>
              <label>Início</label>
              <input
                type="time"
                value={t.start}
                onChange={(e) =>
                  updateTournament(t.id, { start: e.target.value })
                }
              />
            </div>

            <div style={styles.row}>
              <label>Fim</label>
              <input
                type="time"
                value={t.end}
                onChange={(e) =>
                  updateTournament(t.id, { end: e.target.value })
                }
              />
            </div>

            <div style={styles.row}>
              <label>Status</label>
              <button
                onClick={() =>
                  updateTournament(t.id, { enabled: !t.enabled })
                }
              >
                {t.enabled ? "Ativo" : "Desativado"}
              </button>
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
  list: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 16,
    marginTop: 20,
  },
  card: {
    background: "#151515",
    padding: 16,
    borderRadius: 10,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
};
