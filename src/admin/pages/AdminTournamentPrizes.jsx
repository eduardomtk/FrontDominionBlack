import { useParams, useNavigate } from "react-router-dom";
import { useTournament } from "../../context/TournamentContext";
import { useState } from "react";

export default function AdminTournamentPrizes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tournaments, updatePrizes } = useTournament();

  const tournament = tournaments.find((t) => String(t.id) === id);
  const [values, setValues] = useState({ ...tournament.prizes });

  function handleChange(pos, value) {
    setValues((v) => ({ ...v, [pos]: Number(value) || 0 }));
  }

  function handleSave() {
    updatePrizes(tournament.id, values);
    navigate(-1);
  }

  return (
    <div style={styles.container}>
      <h2>Premiação — {tournament.name}</h2>

      <div style={styles.list}>
        {Object.keys(values).map((pos) => (
          <div key={pos} style={styles.row}>
            <span>{pos}º lugar</span>
            <input
              type="number"
              value={values[pos]}
              onChange={(e) => handleChange(pos, e.target.value)}
            />
          </div>
        ))}
      </div>

      <button style={styles.save} onClick={handleSave}>
        💾 Salvar Premiação
      </button>
    </div>
  );
}

const styles = {
  container: {
    padding: 20,
    color: "#fff",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginTop: 20,
    marginBottom: 20,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    background: "#151515",
    padding: 12,
    borderRadius: 8,
  },
  save: {
    padding: "10px 16px",
    borderRadius: 8,
    border: "none",
    background: "#22c55e",
    fontWeight: 600,
    cursor: "pointer",
  },
};
