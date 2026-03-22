import React from 'react';
import styles from './PageLoader.module.css';

const PageLoader = () => (
  <div className={styles.overlay}>
    <div className={styles.loader}>
      <div className={styles.spinner}></div>
      <div className={styles.logo}>Trade<span className={styles.pro}>Pro</span></div>
    </div>
  </div>
);

export default PageLoader;