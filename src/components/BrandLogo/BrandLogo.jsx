import React from "react";
import logoImage from "@/assets/images/branding/dominionblack_transparent.png";
import styles from "./BrandLogo.module.css";

export default function BrandLogo({ className = "", alt = "Dominion Black" }) {
  return (
    <span className={`${styles.logo} ${className}`.trim()} aria-label={alt}>
      <img className={styles.image} src={logoImage} alt={alt} draggable="false" />
    </span>
  );
}
