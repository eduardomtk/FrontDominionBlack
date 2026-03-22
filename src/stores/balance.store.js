import { create } from "zustand";

function toNumberSafe(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * BalanceStore
 * Controle profissional de saldo
 */
export const useBalanceStore = create((set, get) => ({
  balance: 10000, // Saldo inicial
  history: [],

  /**
   * Crédito (adição de saldo)
   */
  credit: (amount) => {
    const a = toNumberSafe(amount);
    if (a === null || a <= 0) return false;

    set((state) => ({
      balance: state.balance + a,
      history: [
        {
          id: Date.now(),
          type: "CREDIT",
          amount: a,
          date: new Date().toISOString(),
        },
        ...state.history.slice(0, 99), // Mantém últimas 100 transações
      ],
    }));

    return true;
  },

  /**
   * Débito (subtração de saldo)
   */
  debit: (amount) => {
    const a = toNumberSafe(amount);
    if (a === null || a <= 0) return false;

    const { balance } = get();
    if (balance < a) return false;

    set((state) => ({
      balance: state.balance - a,
      history: [
        {
          id: Date.now(),
          type: "DEBIT",
          amount: -a,
          date: new Date().toISOString(),
        },
        ...state.history.slice(0, 99),
      ],
    }));

    return true;
  },

  /**
   * Depositar fundos
   */
  deposit: (amount) => {
    const a = toNumberSafe(amount);
    if (a === null || a <= 0) return false;

    set((state) => ({
      balance: state.balance + a,
      history: [
        {
          id: Date.now(),
          type: "DEPOSIT",
          amount: a,
          date: new Date().toISOString(),
        },
        ...state.history.slice(0, 99),
      ],
    }));

    return true;
  },

  /**
   * Sacar fundos
   */
  withdraw: (amount) => {
    const a = toNumberSafe(amount);
    if (a === null || a <= 0) return false;

    const { balance } = get();
    if (balance < a) return false;

    set((state) => ({
      balance: state.balance - a,
      history: [
        {
          id: Date.now(),
          type: "WITHDRAW",
          amount: -a,
          date: new Date().toISOString(),
        },
        ...state.history.slice(0, 99),
      ],
    }));

    return true;
  },

  /**
   * Resetar saldo (dev only)
   */
  reset: () => {
    set({
      balance: 10000,
      history: [],
    });
  },
}));
