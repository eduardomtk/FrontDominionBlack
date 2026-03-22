import React, { useState } from 'react';
import styles from './TopRightPanel.module.css';

export default function TopRightPanel() {
  const [expiration, setExpiration] = useState(5);
  const [amount, setAmount] = useState(100);
  const payoutRate = 0.82; 

  const historyMock = [
    { id: 1, asset: 'BTC/USD', type: 'CALL', result: 'WIN', profit: '+ R$ 8.20' },
    { id: 2, asset: 'EUR/USD', type: 'PUT', result: 'LOSS', profit: '- R$ 10.00' },
  ];

  return (
    <div className={styles.panelContainer}>
        {/* Botão de Depósito focado em ação */}
        <div className={styles.sideHeaderOnly}>
            <button className={styles.depositButtonFull}>
                <i className="fas fa-plus-circle"></i> EFETUAR DEPÓSITO
            </button>
        </div>

        {/* Seleção de Tempo */}
        <div className={styles.expirationSection}>
            <span className={styles.sectionTitle}>Tempo de Expiração</span>
            <div className={styles.timeframeSelector}>
                {[1, 5, 15].map((t) => (
                    <button 
                        key={t}
                        className={`${styles.timeButton} ${expiration === t ? styles.activeTime : ''}`}
                        onClick={() => setExpiration(t)}
                    >
                        M{t}
                    </button>
                ))}
            </div>
        </div>

        {/* Entrada de Valor Centralizada */}
        <div className={styles.tradeControls}>
            <div className={styles.inputGroupCentralized}>
                <label className={styles.inputLabel}>Valor da Operação (R$)</label>
                <input 
                    type="number" 
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value)}
                    className={styles.tradeInputCenter} 
                />
            </div>

            {/* Payout com Destaque Profissional */}
            <div className={styles.payoutHighlightCard}>
                <div className={styles.payoutMain}>
                    <span className={styles.payoutPercent}>+{payoutRate * 100}%</span>
                    <span className={styles.payoutProfit}>R$ {(amount * payoutRate).toFixed(2)}</span>
                </div>
                <span className={styles.payoutLabel}>Rendimento Estimado</span>
            </div>

            <div className={styles.buttonGroup}>
                <button className={`${styles.tradeButton} ${styles.btnCall}`}>
                    <i className="fas fa-arrow-up"></i> COMPRAR
                </button>
                <button className={`${styles.tradeButton} ${styles.btnPut}`}>
                    <i className="fas fa-arrow-down"></i> VENDER
                </button>
            </div>
        </div>

        {/* Histórico fixado abaixo dos botões */}
        <div className={styles.historySection}>
            <div className={styles.historyHeader}>Histórico Recente</div>
            <div className={styles.historyList}>
                {historyMock.map((trade) => (
                    <div key={trade.id} className={styles.historyItem}>
                        <div className={styles.tradeInfo}>
                            <span className={styles.assetName}>{trade.asset}</span>
                            <span className={trade.type === 'CALL' ? styles.typeCall : styles.typePut}>
                                {trade.type === 'CALL' ? 'Compra' : 'Venda'}
                            </span>
                        </div>
                        <span className={trade.result === 'WIN' ? styles.winValue : styles.lossValue}>
                            {trade.profit}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    </div>
  );
}