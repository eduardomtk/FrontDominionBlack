import React from "react";
import styles from "./BrandLogo.module.css";
import logoSrc from "@/assets/images/branding/dominionblack_transparent.png";

export default function BrandLogo({ className = "", alt = "Dominion Black" }) {
  return (
    <span className={`${styles.logo} ${className}`.trim()} aria-label={alt}>
      <img className={styles.image} src={logoSrc} alt={alt} draggable="false" />
    </span>
  );
}
