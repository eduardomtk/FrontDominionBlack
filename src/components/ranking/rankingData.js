const NAMES = [
  "Lucas Andrade","Mariana Souza","Rafael Costa","Beatriz Nunes","Felipe Rocha",
  "Julia Martins","André Lima","Camila Pereira","Carlos Mendes","Renato Alves",
  "Larissa Dias","Gustavo Henrique","Fernanda Lima","Tiago Silva","Aline Santos",
];

function generateRanking() {
  const used = new Set();
  const list = [];

  function uniqueName(base) {
    let name = base;
    let i = 1;
    while (used.has(name)) {
      name = `${base} ${i++}`;
    }
    used.add(name);
    return name;
  }

  // Top 15 "fortes"
  NAMES.forEach((n, i) => {
    list.push({
      id: i,
      name: uniqueName(n),
      profit: 12500 - i * 600,
      avatar: `https://randomuser.me/api/portraits/${i % 2 ? "women" : "men"}/${i + 10}.jpg`,
    });
  });

  // Resto até 100
  for (let i = 15; i < 100; i++) {
    list.push({
      id: i,
      name: uniqueName(i % 2 ? `Investidora ${i}` : `Trader Pro ${i}`),
      profit: 4000 - i * 20,
      avatar: `https://randomuser.me/api/portraits/${i % 2 ? "women" : "men"}/${i % 80}.jpg`,
    });
  }

  return list;
}

export default generateRanking;
