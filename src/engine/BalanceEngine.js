// src/engine/BalanceEngine.js

class BalanceEngine {
  constructor() {
    this.balance = 10000; // Saldo inicial
    this.history = [];
  }

  deposit(amount) {
    this.balance += amount;
    this.addToHistory('DEPOSIT', amount);
  }

  withdraw(amount) {
    if (amount <= this.balance) {
      this.balance -= amount;
      this.addToHistory('WITHDRAW', amount);
      return true;
    }
    return false;
  }

  placeTrade(amount) {
    if (amount <= this.balance) {
      this.balance -= amount;
      this.addToHistory('TRADE', -amount);
      return true;
    }
    return false;
  }

  addPayout(payout) {
    this.balance += payout;
    this.addToHistory('PAYOUT', payout);
  }

  getBalance() {
    return this.balance;
  }

  addToHistory(type, amount) {
    this.history.push({
      id: Date.now(),
      type,
      amount,
      date: new Date().toLocaleString(),
    });
  }

  getHistory() {
    return this.history;
  }
}

export default new BalanceEngine();