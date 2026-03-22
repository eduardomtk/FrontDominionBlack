import { NAMES } from "../data/rankingNames";

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

export function generateInitialRanking() {
  const ranking = [];
  let id = 1;

  while (ranking.length < 100) {
    const batch = shuffle(NAMES);

    for (const person of batch) {
      if (ranking.length >= 100) break;

      ranking.push({
        id: id,
        name: person.name,
        gender: person.gender,
        profit: Math.floor(42000 - ranking.length * 120 + Math.random() * 300),
        avatar: `https://randomuser.me/api/portraits/${person.gender}/${id % 80}.jpg`,
      });

      id++;
    }
  }

  return ranking;
}

