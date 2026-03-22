import { useTournament } from "../../context/TournamentContext";

export default function AdminTournamentHistory() {
  const { history } = useTournament();

  return (
    <div style={{ marginTop: 40 }}>
      <h3>Histórico de Torneios</h3>

      {history.length === 0 && (
        <p style={{ opacity: 0.6 }}>Nenhum torneio encerrado ainda.</p>
      )}

      {history.map((t) => (
        <div
          key={t.id}
          style={{
            background: "#111",
            padding: 16,
            borderRadius: 8,
            marginBottom: 20,
          }}
        >
          <h4>{t.name}</h4>
          <p>
            Encerrado em:{" "}
            {new Date(t.finishedAt).toLocaleString("pt-BR")}
          </p>

          <h5>Premiação</h5>
          <ul>
            {t.prizes.map((p) => (
              <li key={p.position}>
                {p.position}º lugar — ${p.amount.toLocaleString()}
              </li>
            ))}
          </ul>

          <h5>Ranking Final</h5>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: 10,
            }}
          >
            <thead>
              <tr>
                <th>#</th>
                <th>Usuário</th>
                <th>Saldo</th>
                <th>Tipo</th>
              </tr>
            </thead>
            <tbody>
              {t.ranking.map((u, i) => (
                <tr key={u.id}>
                  <td>{i + 1}</td>
                  <td>{u.name}</td>
                  <td>${u.balance.toLocaleString()}</td>
                  <td>
                    {u.locked
                      ? "Fake Pro"
                      : u.id === "user"
                      ? "Usuário"
                      : "Fake"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
