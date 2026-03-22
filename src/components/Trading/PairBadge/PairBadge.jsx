import styles from './PairBadge.module.css'

export default function PairBadge({ pair = 'EUR/USD' }) {
  return (
    <div className={styles.badge}>
      {pair}
    </div>
  )
}
