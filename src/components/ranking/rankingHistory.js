import { getRankingState } from "./rankingEngine";

const STORAGE_KEY = "ranking_daily_history_v1";
const MAX_DAYS = 30;

/**
 * Retorna YYYY-MM-DD
 */
function todayKey() {
  return new Date().toISOString().split("T")[0];
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

/**
 * Cria snapshot diário do TOP 10
 * Só salva 1 vez por dia
 */
export function ensureDailySnapshot() {
  const history = loadHistory();
  const today = todayKey();

  const alreadySaved = history.some((item) => item.date === today);
  if (alreadySaved) return;

  const { ranking } = getRankingState();

  const top10 = ranking.slice(0, 10).map((user, index) => ({
    position: index + 1,
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    profit: Math.floor(user.profit),
  }));

  const entry = {
    date: today,
    top10,
    createdAt: Date.now(),
  };

  const updated = [entry, ...history].slice(0, MAX_DAYS);
  saveHistory(updated);
}

/**
 * Retorna histórico diário
 */
export function getDailyHistory() {
  return loadHistory();
}
