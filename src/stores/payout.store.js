import { create } from "zustand";

/**
 * PayoutStore
 * Mantém payout dinâmico por símbolo (0..1)
 */
export const usePayoutStore = create((set, get) => ({
  payouts: {},

  /**
   * Define payout de um ativo
   */
  setPayout(symbol, payout) {
    const s = String(symbol || "").trim().toUpperCase();
    const p = Number(payout);

    if (!s) return;
    if (!Number.isFinite(p)) return;
    if (p <= 0 || p >= 1) return;

    set((state) => ({
      payouts: {
        ...state.payouts,
        [s]: p,
      },
    }));
  },

  /**
   * Bulk update (admin / bootstrap)
   */
  setMany(payoutMap = {}) {
    const next = {};
    for (const [symbol, payout] of Object.entries(payoutMap || {})) {
      const s = String(symbol || "").trim().toUpperCase();
      const p = Number(payout);
      if (!s) continue;
      if (!Number.isFinite(p)) continue;
      if (p <= 0 || p >= 1) continue;
      next[s] = p;
    }

    if (Object.keys(next).length === 0) return;

    set((state) => ({
      payouts: {
        ...state.payouts,
        ...next,
      },
    }));
  },

  /**
   * Remove payout dinâmico
   */
  clear(symbol) {
    const s = String(symbol || "").trim().toUpperCase();
    if (!s) return;

    set((state) => {
      const copy = { ...(state.payouts || {}) };
      delete copy[s];
      return { payouts: copy };
    });
  },
}));
