// src/components/chart/chart.config.js

export const chartConfig = {
  layout: {
    background: { color: "#0b0f14" },
    textColor: "#d1d4dc",
  },
  grid: {
    vertLines: { color: "rgba(42,46,57,0.05)" },
    horzLines: { color: "rgba(42,46,57,0.05)" },
  },
  rightPriceScale: {
    autoScale: true,
    borderVisible: false,
    visible: true,

    // ✅ FIX: manter o eixo com largura mínima fixa (igual panes)
    // evita “pular”/criar faixa de respiro ao adicionar indicadores/panes
    minimumWidth: 110,
  },
  timeScale: {
    timeVisible: true,
    secondsVisible: true,

    /**
     * ✅ Não definir rightOffset/barSpacing aqui.
     * O ChartBridge aplica o preset profissional (velas invisíveis) de forma soberana:
     *   RIGHT_OFFSET / BAR_SPACING
     * Isso evita corrida e dessync com panes.
     */

    fixLeftEdge: false,
    rightBarStaysOnScroll: true,
    minBarSpacing: 2.45,
    lockVisibleTimeRangeOnResize: true,

    // ✅ Evita o timeScale empurrar ranges de formas diferentes entre panes.
    // O Bridge já faz scrollToRealTime quando necessário.
    shiftVisibleRangeOnNewBar: false,
  },
  candleSeries: {
    upColor: "#00c176",
    downColor: "#ff4d4d",
    borderVisible: false,
    wickUpColor: "#00c176",
    wickDownColor: "#ff4d4d",
    priceLineVisible: true,
    lastValueVisible: true,
    priceFormat: {
      type: "price",
      precision: 5,
      minMove: 0.00001,
    },
  },
};
