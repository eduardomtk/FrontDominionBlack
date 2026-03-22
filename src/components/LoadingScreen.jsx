import React from "react";
import styles from "./LoadingScreen.module.css";

export default function LoadingScreen() {
  return (
    <div
      className={styles.root}
      role="status"
      aria-live="polite"
      aria-busy="true"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => e.preventDefault()}
    >
      <div className={styles.brandWrap}>
        <div className={styles.logo} aria-label="DominionBlack">
          <span className={styles.logoMain}>
            <span className={styles.logoDWrap}>
              <span className={styles.logoD}>D</span>

              {/* Coroa encaixada na quina do D */}
              <span className={styles.crownContainer} aria-hidden="true">
                <span className={styles.crown}>
                  <span className={`${styles.diamond} ${styles.blue}`} />
                  <span className={`${styles.diamond} ${styles.red}`} />
                  <span className={`${styles.diamond} ${styles.green}`} />
                </span>
                <span className={styles.particles} />
              </span>
            </span>

            <span className={styles.logoRest}>ominion</span>
          </span>

          <span className={styles.logoAccent}>Black</span>
        </div>

        <div className={styles.srOnly}>Carregando</div>

        <div className={styles.loaderWrap} aria-hidden="true">
          <div className={styles.spinner} />
        </div>
      </div>
    </div>
  );
}