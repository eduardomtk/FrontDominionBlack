import styles from "./AuthLayout.module.css";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function AuthLayout({ children, className = "" }) {
  const compact = String(className || "").includes("compactAuth");
  const mobilePortrait = String(className || "").includes("mobilePortraitLayout");

  return (
    <div className={cn(styles.page, className)}>
      <div className={styles.bg} aria-hidden="true" />

      <div className={cn(styles.shell, mobilePortrait && styles.shellMobilePortrait)}>
        <div
          className={cn(
            styles.card,
            compact && styles.cardCompact,
            mobilePortrait && styles.cardMobilePortrait
          )}
        >
          <div className={cn(styles.brandRow, mobilePortrait && styles.brandRowMobilePortrait)}>
            <div className={styles.brand} aria-label="TradePro">
              <span className={styles.brandTrade}>Trade</span>
              <span className={styles.brandPro}>Pro</span>
            </div>
          </div>

          <div className={styles.content}>{children}</div>

          <div
            className={cn(
              styles.footerNote,
              compact && styles.footerCompact,
              mobilePortrait && styles.footerMobilePortrait
            )}
          >
            <span className={styles.lock}>🔒</span> Conexão segura
          </div>
        </div>
      </div>
    </div>
  );
}