import React from "react";
import styles from "./BrandLogo.module.css";

export default function BrandLogo({ className = "" }) {
  return (
    <div className={`${styles.logo} ${className}`}>
      <span className={styles.logoMain}>
        <span className={styles.logoDWrap}>
          <span className={styles.logoD}>D</span>

          <span className={styles.crownContainer} aria-hidden="true">
            <span className={styles.particles} />
            <span className={styles.crown}>
              <span className={`${styles.diamond} ${styles.blue}`} />
              <span className={`${styles.diamond} ${styles.red}`} />
              <span className={`${styles.diamond} ${styles.green}`} />
            </span>
          </span>
        </span>

        {/* ✅ mesmíssimo texto, só que com os "i" embrulhados pra aplicar o corte */}
        <span className={styles.logoRest}>
          om<span className={styles.iFix}>i</span>n<span className={styles.iFix}>i</span>on
        </span>
      </span>

      <span className={styles.logoAccent}>Black</span>
    </div>
  );
}
