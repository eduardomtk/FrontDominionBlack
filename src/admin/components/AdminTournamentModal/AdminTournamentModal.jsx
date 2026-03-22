import { useState } from "react";
import { useTournament } from "../../../context/TournamentContext";
import styles from "./AdminTournamentModal.module.css";

const EMPTY_FORM = {
  name: "",
  start: "",
  end: "",
  prizes: [
    { position: 1, amount: 5000 },
    { position: 2, amount: 3000 },
    { position: 3, amount: 1500 },
  ],
};

export default function AdminTournamentModal({ open, onClose }) {
  const {
    tournaments,
    currentTournament,
    active,
    forceStart,
    forceFinish,
    resetRanking,
    createTournament,
    updateTournament,
    deleteTournament,
  } = useTournament();

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  if (!open) return null;

  function startCreate() {
    setEditing("new");
    setForm(EMPTY_FORM);
  }

  function startEdit(t) {
    setEditing(t.id);
    setForm({
      name: t.name,
      start: t.start,
      end: t.end,
      prizes: t.prizes ?? [],
    });
  }

  function save() {
    if (!form.name || !form.start || !form.end) return;

    if (editing === "new") {
      createTournament(form);
    } else {
      updateTournament(editing, form);
    }

    setEditing(null);
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <header className={styles.header}>
          <h2>Admin • Torneios</h2>
          <button onClick={onClose}>✕</button>
        </header>

        <div className={styles.content}>
          <button className={styles.create} onClick={startCreate}>
            + Criar Torneio
          </button>

          {(editing !== null) && (
            <div className={styles.form}>
              <input
                placeholder="Nome do torneio"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />

              <div className={styles.row}>
                <input
                  type="time"
                  value={form.start}
                  onChange={(e) =>
                    setForm({ ...form, start: e.target.value })
                  }
                />
                <input
                  type="time"
                  value={form.end}
                  onChange={(e) =>
                    setForm({ ...form, end: e.target.value })
                  }
                />
              </div>

              <div className={styles.prizes}>
                {form.prizes.map((p, i) => (
                  <div key={i} className={styles.row}>
                    <span>{p.position}º</span>
                    <input
                      type="number"
                      value={p.amount}
                      onChange={(e) => {
                        const prizes = [...form.prizes];
                        prizes[i] = { ...p, amount: Number(e.target.value) };
                        setForm({ ...form, prizes });
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className={styles.formActions}>
                <button onClick={save}>Salvar</button>
                <button onClick={() => setEditing(null)}>Cancelar</button>
              </div>
            </div>
          )}

          {tournaments.map((t) => {
            const isCurrent = currentTournament?.id === t.id;

            return (
              <div key={t.id} className={styles.card}>
                <div>
                  <strong>{t.name}</strong>
                  <span className={styles.status}>{t.status}</span>
                </div>

                <small>
                  {t.start} → {t.end}
                </small>

                <div className={styles.actions}>
                  <button onClick={() => forceStart(t.id)} disabled={active}>
                    Iniciar
                  </button>

                  <button
                    onClick={forceFinish}
                    disabled={!isCurrent || !active}
                  >
                    Encerrar
                  </button>

                  <button onClick={() => resetRanking(t.id)}>
                    Reset Ranking
                  </button>

                  <button onClick={() => startEdit(t)}>Editar</button>

                  <button
                    onClick={() => deleteTournament(t.id)}
                    disabled={isCurrent}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
