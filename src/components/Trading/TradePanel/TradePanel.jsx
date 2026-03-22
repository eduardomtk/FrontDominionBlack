import styles from './TradePanel.module.css'

export default function TradePanel() {
  function openTrade(type) {
    window.openTrade?.(type, 60)
  }

  return (
    <div className={styles.panel}>

      {/* ⏱ Timeframe */}
      <div className={styles.timeframes}>
        <button>1m</button>
        <button>5m</button>
        <button>15m</button>
      </div>

      {/* 💰 Valor */}
      <div className={styles.field}>
        <label>Investimento</label>
        <input type="number" defaultValue={20} />
      </div>

      {/* ⏳ Expiração */}
      <div className={styles.field}>
        <label>Expiração</label>
        <select>
          <option>1 min</option>
          <option>5 min</option>
          <option>15 min</option>
        </select>
      </div>

      {/* 📈 Payout */}
      <div className={styles.payout}>
        Lucro: <strong>+87%</strong>
      </div>

      {/* 🔘 Ações */}
      <button
        className={`${styles.action} ${styles.call}`}
        onClick={() => openTrade('CALL')}
      >
        CALL
      </button>

      <button
        className={`${styles.action} ${styles.put}`}
        onClick={() => openTrade('PUT')}
      >
        PUT
      </button>
    </div>
  )
}
