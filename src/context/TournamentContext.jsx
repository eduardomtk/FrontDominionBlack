import { createContext, useContext, useEffect, useRef, useState } from "react";

const TournamentContext = createContext(null);

/* ================= CONFIG ================= */

const TOURNAMENT_DURATION = 30 * 60;
const INITIAL_BALANCE = 10000;

const TOTAL_PLAYERS = 100;
const LOCKED_FAKES = 5;

const HISTORY_STORAGE_KEY = "tournament_history_v2";

/* ================= TORNEIOS ================= */

const TOURNAMENTS = [
  { id: 1, name: "Torneio Flash 14:00", start: "14:00", end: "14:30" },
  { id: 2, name: "Torneio Flash 14:30", start: "14:30", end: "15:00" },
  { id: 3, name: "Torneio Flash 15:00", start: "15:00", end: "15:30" },
  { id: 4, name: "Torneio Flash 15:30", start: "15:30", end: "16:00" },
  { id: 5, name: "Torneio Flash 16:00", start: "16:00", end: "16:30" },
];

/* ================= HELPERS ================= */

const rand = (min, max) => Math.random() * (max - min) + min;

function getStatus(t) {
  const now = new Date();
  const [sh, sm] = t.start.split(":").map(Number);
  const [eh, em] = t.end.split(":").map(Number);

  const start = new Date(now);
  start.setHours(sh, sm, 0, 0);

  const end = new Date(now);
  end.setHours(eh, em, 0, 0);

  if (now < start) return "Próximo";
  if (now > end) return "Encerrado";
  return "Em andamento";
}

function generateInitialRanking() {
  const usedNames = new Set();
  const list = [];

  for (let i = 0; i < LOCKED_FAKES; i++) {
    const name = `Profissional ${i + 1}`;
    usedNames.add(name);

    list.push({
      id: `pro-${i}`,
      name,
      locked: true,
      balance: 14000 - i * 600,
    });
  }

  list.push({
    id: "user",
    name: "Você",
    locked: false,
    balance: INITIAL_BALANCE,
  });

  while (list.length < TOTAL_PLAYERS) {
    const name = `Trader ${list.length + 1}`;
    if (usedNames.has(name)) continue;

    usedNames.add(name);

    list.push({
      id: `open-${list.length}`,
      name,
      locked: false,
      balance: Math.floor(rand(5000, 9000)),
    });
  }

  return list.sort((a, b) => b.balance - a.balance);
}

/* ================= PROVIDER ================= */

export function TournamentProvider({ children }) {
  const [tournaments] = useState(
    TOURNAMENTS.map(t => ({ ...t, status: getStatus(t) }))
  );

  const [currentTournament, setCurrentTournament] = useState(null);
  const [ranking, setRanking] = useState({});
  const [remaining, setRemaining] = useState(0);
  const [active, setActive] = useState(false);
  const [balance, setBalance] = useState(INITIAL_BALANCE);

  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  });

  const tickRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (!active || !currentTournament) return;

    tickRef.current = setInterval(() => {
      setRemaining(r => Math.max(r - 1, 0));

      setRanking(prev => {
        const list = prev[currentTournament.id] || [];

        const updated = list.map((u, idx) => {
          if (u.locked) {
            return { ...u, balance: Math.floor(u.balance + rand(-20, 80)) };
          }

          if (u.id === "user") {
            const cap = list[LOCKED_FAKES - 1]?.balance - 50;
            return {
              ...u,
              balance: Math.min(
                Math.floor(u.balance + rand(-30, 90)),
                cap
              ),
            };
          }

          return { ...u, balance: Math.floor(u.balance + rand(-40, 60)) };
        });

        return {
          ...prev,
          [currentTournament.id]: updated.sort((a, b) => b.balance - a.balance),
        };
      });
    }, 1000);

    return () => clearInterval(tickRef.current);
  }, [active, currentTournament]);

  function startTournament(t) {
    setCurrentTournament(t);
    setRemaining(TOURNAMENT_DURATION);
    setBalance(INITIAL_BALANCE);

    setRanking(prev => ({
      ...prev,
      [t.id]: generateInitialRanking(),
    }));

    setActive(true);
  }

  function finishTournament() {
    if (!currentTournament) return;

    const final = ranking[currentTournament.id] || [];

    setHistory(prev => [
      {
        id: `${currentTournament.id}-${Date.now()}`,
        name: currentTournament.name,
        finishedAt: Date.now(),
        ranking: final.slice(0, 10),
      },
      ...prev,
    ]);

    setActive(false);
    setCurrentTournament(null);
  }

  return (
    <TournamentContext.Provider
      value={{
        tournaments,
        ranking,
        active,
        remaining,
        balance,
        history,
        startTournament,
        finishTournament,
      }}
    >
      {children}
    </TournamentContext.Provider>
  );
}

export function useTournament() {
  return useContext(TournamentContext);
}
