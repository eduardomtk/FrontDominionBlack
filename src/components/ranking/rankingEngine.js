import { generateInitialRanking } from "./rankingSeed";

const STORAGE_KEY = "normal_ranking_state";
const DAY_MS = 1000 * 60 * 60 * 24;

const RANKING_SIZE = 200;

function now() {
  return Date.now();
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * PERFIL DIÁRIO
 * Alterna dias mais fortes e mais fracos de forma previsível porém não óbvia
 */
function getDailyProfile() {
  const seed = Math.floor(now() / DAY_MS) % 4;

  if (seed === 0) return { topMax: 28000 };
  if (seed === 1) return { topMax: 35000 };
  if (seed === 2) return { topMax: 42000 };
  return { topMax: 48000 };
}

/**
 * VARIAÇÃO REALISTA POR POSIÇÃO
 */
function getDeltaByPosition(index) {
  // chance de perder também
  const negativeChance = Math.random() < 0.25;

  if (index < 5) {
    return (Math.random() * 900 + 300) * (negativeChance ? -0.4 : 1);
  }

  if (index < 20) {
    return (Math.random() * 450 + 120) * (negativeChance ? -0.5 : 1);
  }

  if (index < 50) {
    return (Math.random() * 220 + 40) * (negativeChance ? -0.6 : 1);
  }

  if (index < 100) {
    return (Math.random() * 90 + 10) * (negativeChance ? -0.7 : 1);
  }

  // TOP 200 — bem baixo, acessível
  return (Math.random() * 15 + 1) * (negativeChance ? -0.8 : 1);
}

/**
 * SIMULA UM DIA REAL DE MERCADO
 */
function simulateDay(ranking) {
  const profile = getDailyProfile();

  const updated = ranking.map((u, index) => {
    let profit = u.profit + getDeltaByPosition(index);

    // piso mínimo
    if (profit < 0) profit = Math.random() * 20;

    // teto do top 1
    if (index === 0 && profit > profile.topMax) {
      profit = profile.topMax - Math.random() * 600;
    }

    return { ...u, profit };
  });

  // ordenação natural
  updated.sort((a, b) => b.profit - a.profit);

  return updated;
}

export function getRankingState() {
  let state = loadState();

  if (
    !state ||
    !Array.isArray(state.ranking) ||
    state.ranking.length !== RANKING_SIZE
  ) {
    const ranking = generateInitialRanking(RANKING_SIZE);

    state = {
      ranking,
      lastUpdate: now(),
      lastPositions: ranking.map((_, i) => i),
    };

    saveState(state);
    return state;
  }

  const daysPassed = Math.floor((now() - state.lastUpdate) / DAY_MS);

  if (daysPassed > 0) {
    let ranking = [...state.ranking];

    for (let i = 0; i < daysPassed; i++) {
      ranking = simulateDay(ranking);
    }

    state = {
      ranking,
      lastUpdate: now(),
      lastPositions: state.ranking.map((u) =>
        ranking.findIndex((r) => r.id === u.id)
      ),
    };

    saveState(state);
  }

  return state;
}

/**
 * TICK MANUAL (tempo real / polling)
 */
export function tickRanking() {
  const state = getRankingState();

  const updated = simulateDay(state.ranking);

  const lastPositions = state.ranking.map((u) =>
    updated.findIndex((r) => r.id === u.id)
  );

  const newState = {
    ranking: updated,
    lastUpdate: now(),
    lastPositions,
  };

  saveState(newState);
  return newState;
}
