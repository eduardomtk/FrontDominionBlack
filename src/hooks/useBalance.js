import { useBalanceStore } from "../stores/balance.store";

/**
 * useBalance
 * Hook profissional para controle de saldo
 */
export function useBalance() {
  const balance = useBalanceStore((state) => state.balance);
  const credit = useBalanceStore((state) => state.credit);
  const debit = useBalanceStore((state) => state.debit);
  const deposit = useBalanceStore((state) => state.deposit);
  const withdraw = useBalanceStore((state) => state.withdraw);
  const reset = useBalanceStore((state) => state.reset);

  return {
    balance,
    credit,
    debit,
    deposit,
    withdraw,
    reset,
  };
}
