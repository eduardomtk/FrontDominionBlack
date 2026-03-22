export const pairsList = [
  // === OPÇÕES BINÁRIAS ===
  { category: "Opções Binárias", symbol: "EUR/USD", name: "EUR/USD", yield: 87, icon: "💶" },
  { category: "Opções Binárias", symbol: "GBP/USD", name: "GBP/USD", yield: 85, icon: "💷" },
  { category: "Opções Binárias", symbol: "USD/JPY", name: "USD/JPY", yield: 86, icon: "💴" },
  { category: "Opções Binárias", symbol: "AUD/USD", name: "AUD/USD", yield: 84, icon: "🇦🇺" },
  { category: "Opções Binárias", symbol: "USD/CAD", name: "USD/CAD", yield: 83, icon: "🇨🇦" },

  // === CRIPTOMOEDAS ===
  { category: "Criptomoedas", symbol: "BTC/USDT", name: "Bitcoin", yield: 90, icon: "₿" },
  { category: "Criptomoedas", symbol: "ETH/USDT", name: "Ethereum", yield: 88, icon: "Ξ" },
  { category: "Criptomoedas", symbol: "XRP/USDT", name: "Ripple", yield: 85, icon: "✕" },
  { category: "Criptomoedas", symbol: "SOL/USDT", name: "Solana", yield: 87, icon: "◎" },

  // === METAIS ===
  { category: "Metais", symbol: "XAU/USD", name: "Ouro", yield: 82, icon: "🥇" },
  { category: "Metais", symbol: "XAG/USD", name: "Prata", yield: 80, icon: "🥈" },

  // === ENERGIA ===
  { category: "Energia", symbol: "OIL/USD", name: "Petróleo", yield: 83, icon: "🛢️" },
  { category: "Energia", symbol: "NGAS/USD", name: "Gás Natural", yield: 81, icon: "🔥" },
];

export const getCategories = () => {
  const categories = [];
  const seen = new Set();
  pairsList.forEach((p) => {
    if (!seen.has(p.category)) {
      seen.add(p.category);
      categories.push(p.category);
    }
  });
  return categories;
};