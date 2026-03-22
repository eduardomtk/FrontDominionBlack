import { useState } from "react";
import { useTournament } from "../../context/TournamentContext";
import AdminTournamentModal from "../components/AdminTournamentModal/AdminTournamentModal";

function StatusBadge({ status }) {
  const colors = {
    Próximo: "#3b82f6",
    "Em andamento": "#22c55e",
    Encerrado: "#ef4444",
  };

  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        background: colors[status],
        color: "#fff",
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}

export default function AdminTournaments() {
  const {
    tournaments,
    active,
    currentTournament,
    forceStart,
    forceFinish,
    resetRanking,
  } = useTournament();

  const [openModal, setOpenModal] = useState(false);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2>Torneios</h2>

        <button
          style={styles.manage}
          onClick={() => setOpenModal(true)}
        >
          ⚙ Gerenciar Torneios
        </button>
      </div>

      <div style={styles.grid}>
        {tournaments.map((t) => {
          const isCurrent = currentTournament?.id === t.id;

          return (
            <div key={t.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <strong>{t.name}</strong>
                <StatusBadge status={t.status} />
              </div>

              <div style={styles.info}>
                Horário: {t.start} → {t.end}
              </div>

              <div style={styles.actions}>
                {t.status !== "Em andamento" && (
                  <button
                    style={styles.primary}
                    onClick={() => forceStart(t.id)}
                  >
                    Iniciar
                  </button>
                )}

                {isCurrent && active && (
                  <button
                    style={styles.danger}
                    onClick={forceFinish}
                  >
                    Encerrar
                  </button>
                )}

                <button
                  style={styles.secondary}
                  onClick={() => resetRanking(t.id)}
                >
                  Reset Ranking
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL ADMIN REAL */}
      <AdminTournamentModal
        open={openModal}
        onClose={() => setOpenModal(false)}
      />
    </div>
  );
}

const styles = {
  container: {
    padding: 20,
    color: "#fff",
    height: "100%",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  manage: {
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    background: "#2563eb",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 16,
    flex: 1,
    overflowY: "auto",
  },
  card: {
    background: "#151515",
    borderRadius: 14,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  info: { fontSize: 14, opacity: 0.9 },
  actions: {
    display: "flex",
    gap: 8,
    marginTop: "auto",
  },
  primary: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    border: "none",
    background: "#22c55e",
    fontWeight: 600,
    cursor: "pointer",
  },
  danger: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    border: "none",
    background: "#ef4444",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  },
  secondary: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    border: "none",
    background: "#2a2a2a",
    color: "#fff",
    cursor: "pointer",
  },
};
