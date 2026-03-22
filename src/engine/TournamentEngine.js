// src/engine/TournamentEngine.js

/**
 * MOTOR DE TORNEIOS
 * Regra fixa:
 * - Top 5 = FAKES PROFISSIONAIS (imutáveis por usuários reais)
 * - Usuários reais só entram do 6º ao 10º
 * - Cada torneio tem ranking próprio
 */

export default class TournamentEngine {
  constructor(tournament) {
    this.id = tournament.id;
    this.name = tournament.name;
    this.startTime = tournament.startTime;
    this.endTime = tournament.endTime;

    this.fakes = this._generateFakePros();
    this.users = [];

    this.status = this._calculateStatus();
  }

  /* ================= STATUS ================= */

  _calculateStatus() {
    const now = Date.now();
    if (now < this.startTime) return "upcoming";
    if (now > this.endTime) return "finished";
    return "running";
  }

  refreshStatus() {
    this.status = this._calculateStatus();
    return this.status;
  }

  /* ================= FAKES ================= */

  _generateFakePros() {
    const names = [
      { name: "Victor Hale", country: "US" },
      { name: "Lucas Monteiro", country: "BR" },
      { name: "André Kovac", country: "HR" },
      { name: "Mikhail Orlov", country: "RU" },
      { name: "Daniel Weiss", country: "DE" }
    ];

    return names.map((pro, index) => ({
      id: `fake-${index + 1}`,
      name: pro.name,
      country: pro.country,
      profit: this._randomProfit(800, 2500),
      isFake: true
    }));
  }

  _randomProfit(min, max) {
    return Number((Math.random() * (max - min) + min).toFixed(2));
  }

  /* ================= USUÁRIOS ================= */

  addUser(user) {
    if (this.status !== "running") return false;

    const exists = this.users.find(u => u.id === user.id);
    if (exists) return false;

    if (this.users.length >= 5) return false; // limite 6º ao 10º

    this.users.push({
      ...user,
      profit: this._randomProfit(10, 400),
      isFake: false
    });

    return true;
  }

  updateUserProfit(userId, delta) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    user.profit = Math.max(0, user.profit + delta);
  }

  /* ================= RANKING ================= */

  getRanking() {
    const sortedFakes = [...this.fakes].sort((a, b) => b.profit - a.profit);
    const sortedUsers = [...this.users].sort((a, b) => b.profit - a.profit);

    return [
      ...sortedFakes.slice(0, 5),
      ...sortedUsers.slice(0, 5)
    ].map((item, index) => ({
      position: index + 1,
      ...item
    }));
  }
}
