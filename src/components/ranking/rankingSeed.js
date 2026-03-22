import { RANKING_NAMES } from "./rankingNames";

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

export function generateInitialRanking() {
  const base = shuffle(RANKING_NAMES);

  const ranking = [];

  for (let i = 0; i < 200; i++) {
    const ref = base[i % base.length];

    ranking.push({
      id: i + 1,
      name: ref.name,
      profit: Math.round(50 + Math.random() * 150),
      avatar: `https://randomuser.me/api/portraits/${ref.gender}/${(i % 80)}.jpg`,
    });
  }

  return ranking.sort((a, b) => b.profit - a.profit);
}
