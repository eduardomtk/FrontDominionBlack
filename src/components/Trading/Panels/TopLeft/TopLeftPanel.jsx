import styles from "./Panels.module.css";

export default function TopLeftPanel() {
  return (
    <div className={`${styles.panel} ${styles.topLeft}`}>
      <span>EUR/USD</span>
    </div>
  );
}
