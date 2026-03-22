import { Link } from "react-router-dom";
import styles from "./LandingPage.module.css";
import { useTranslation } from "react-i18next";
import { useMemo, useRef, useState, useEffect } from "react";

// ✅ Logo premium (coroa no D + recortes)
import BrandLogo from "../components/BrandLogo/BrandLogo.jsx";

export default function LandingPage() {
  const { t, i18n } = useTranslation(["common", "landing"]);
  const [openFaq, setOpenFaq] = useState(null);

  // ✅ Language selector (dropdown)
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef(null);

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const assets = useMemo(
    () => [
      { name: "Penzack", icon: "/assets/landing/penzack-logo.4b18a81c.svg" },
      { name: "Apple", icon: "/assets/landing/apple.1c9ce2c4.svg" },
      { name: "Bitcoin", icon: "/assets/landing/bitcoin.6ca73965.svg" },
      { name: "Dogecoin", icon: "/assets/landing/dogecoin.91bac4e7.svg" },
      { name: "Ethereum", icon: "/assets/landing/ethereum.0efeb814.svg" },
      { name: "Mc Donald's", icon: "/assets/landing/mcdonalds.e24e1dad.svg" },
      { name: "Meta", icon: "/assets/landing/meta.36f10b76.svg" },
    ],
    []
  );

  const marqueeItems = useMemo(() => {
    const base = [...assets, { name: t("landing:assets.count"), icon: null, isCount: true }];
    return [...base, ...base];
  }, [assets, t]);

  // ✅ Supported languages
  const languages = useMemo(
    () => [
      { code: "pt", label: "PT", flag: "/assets/landing/pt.png" },
      { code: "en", label: "EN", flag: "/assets/landing/gb.png" },
      { code: "es", label: "ES", flag: "/assets/landing/es.png" },
    ],
    []
  );

  const currentLang = useMemo(() => {
    const cur = (i18n.language || "pt").toLowerCase();
    return languages.find((l) => cur.startsWith(l.code)) || languages[0];
  }, [i18n.language, languages]);

  const onPickLang = async (code) => {
    try {
      await i18n.changeLanguage(code);
    } finally {
      setLangOpen(false);
    }
  };

  // ✅ Close dropdown on outside click / ESC
  useEffect(() => {
    if (!langOpen) return;

    const onDown = (e) => {
      if (!langRef.current) return;
      if (!langRef.current.contains(e.target)) setLangOpen(false);
    };

    const onKey = (e) => {
      if (e.key === "Escape") setLangOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [langOpen]);

  // ✅ Nav items: keep same hover/visual, but do NOTHING
  const onNavNoop = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className={styles.page}>
      {/* BACKGROUND EFFECTS */}
      <div className={styles.bgImage} aria-hidden="true" />
      <div className={styles.gridOverlay} aria-hidden="true" />
      <div className={styles.mainGlow} aria-hidden="true" />

      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brandLogoWrap} aria-label="Dominion Black">
            <BrandLogo className={styles.brandLogoHeader} />
          </div>

          <Link to="/login" className={styles.mobileLoginBtn}>
            {t("common:login")}
          </Link>

          <nav className={styles.nav}>
            {/* ✅ Display-only actions (no navigation, no fallback) */}
            <button type="button" className={styles.navLink} onClick={onNavNoop}>
              {t("landing:nav.start")}
            </button>
            <button type="button" className={styles.navLink} onClick={onNavNoop}>
              {t("landing:nav.awards")}
            </button>
            <button type="button" className={styles.navLink} onClick={onNavNoop}>
              {t("landing:nav.benefits")}
            </button>
            <button type="button" className={styles.navLink} onClick={onNavNoop}>
              {t("landing:nav.how")}
            </button>

            {/* ✅ Language selector dropdown */}
            <div className={styles.langWrap} ref={langRef}>
              <button
                type="button"
                className={styles.langSelector}
                onClick={() => setLangOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={langOpen ? "true" : "false"}
              >
                <img
                  src={currentLang.flag}
                  alt={currentLang.label}
                  className={styles.flag}
                  loading="eager"
                />
                <span>{currentLang.label}</span>
              </button>

              {langOpen && (
                <div className={styles.langDropdown} role="menu">
                  {languages
                    .filter((l) => l.code !== (currentLang.code || "pt"))
                    .map((l) => (
                      <button
                        key={l.code}
                        type="button"
                        className={styles.langOption}
                        onClick={() => onPickLang(l.code)}
                        role="menuitem"
                      >
                        <img
                          src={l.flag}
                          alt={l.label}
                          className={styles.flag}
                          loading="eager"
                        />
                        <span>{l.label}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            <div className={styles.authButtons}>
              <Link to="/login" className={styles.loginLink}>
                {t("common:login")}
              </Link>
              <Link to="/register" className={styles.headerCta}>
                {t("landing:nav.register")}
              </Link>
            </div>
          </nav>
        </div>
      </header>

      <main className={styles.container}>
        {/* HERO SECTION */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.badge}>{t("landing:hero.badge")}</div>
            <h1 className={styles.heroTitle}>
              {t("landing:hero.title_a")} <br />
              <span className={styles.whiteText}>{t("landing:hero.title_b")}</span>{" "}
              {t("landing:hero.title_c")} <br />
              <span className={styles.greenText}>{t("landing:hero.title_d")}</span>
            </h1>
            <p className={styles.heroSubtitle}>
              {t("landing:hero.subtitle_a")}{" "}
              <span className={styles.greenText}>{t("landing:hero.subtitle_b")}</span>{" "}
              {t("landing:hero.subtitle_c")}
            </p>
            <Link to="/register" className={styles.mainBtn}>
              {t("landing:hero.cta")}
            </Link>
          </div>

          <div className={styles.heroImageWrapper}>
            <img
              src="/assets/landing/laptop.png"
              alt={t("landing:hero.img_alt")}
              className={styles.laptopImg}
              loading="eager"
            />
            <div className={styles.heroHands} aria-hidden="true" />
          </div>
        </section>

        {/* REVIEWS SECTION */}
        <section className={styles.reviewsSection}>
          <h2 className={styles.sectionTitle}>{t("landing:reviews.title")}</h2>
          <div className={styles.reviewsGrid}>
            <div className={styles.reviewCard}>
              <div className={styles.reviewHeader}>
                <img
                  className={styles.avatarImg}
                  src="/assets/landing/user1.png"
                  alt="Ana Soares"
                  loading="lazy"
                />
                <div>
                  <div className={styles.reviewName}>Ana Soares</div>
                  <div className={styles.reviewDate}>15/10/2024</div>
                  <div className={styles.stars}>★★★★★</div>
                </div>
              </div>
              <p>{t("landing:reviews.items.0.text")}</p>
            </div>

            <div className={styles.reviewCard}>
              <div className={styles.reviewHeader}>
                <img
                  className={styles.avatarImg}
                  src="/assets/landing/empc.jpg"
                  alt="Jhonatan Martins"
                  loading="lazy"
                />
                <div>
                  <div className={styles.reviewName}>Jhonatan Martins</div>
                  <div className={styles.reviewDate}>02/10/2024</div>
                  <div className={styles.stars}>★★★★★</div>
                </div>
              </div>
              <p>{t("landing:reviews.items.1.text")}</p>
            </div>

            <div className={styles.reviewCard}>
              <div className={styles.reviewHeader}>
                <img
                  className={styles.avatarImg}
                  src="/assets/landing/channels4_profile.jpg"
                  alt="Davi Brito"
                  loading="lazy"
                />
                <div>
                  <div className={styles.reviewName}>Davi Brito</div>
                  <div className={styles.reviewDate}>25/09/2024</div>
                  <div className={styles.stars}>★★★★★</div>
                </div>
              </div>
              <p>{t("landing:reviews.items.2.text")}</p>
            </div>

            <div className={styles.reviewCard}>
              <div className={styles.reviewHeader}>
                <img
                  className={styles.avatarImg}
                  src="/assets/landing/1-7.webp"
                  alt="Lucas Andrade"
                  loading="lazy"
                />
                <div>
                  <div className={styles.reviewName}>Lucas Andrade</div>
                  <div className={styles.reviewDate}>05/09/2024</div>
                  <div className={styles.stars}>★★★★★</div>
                </div>
              </div>
              <p>{t("landing:reviews.items.3.text")}</p>
            </div>
          </div>
        </section>

        {/* FEATURES SECTION */}
        <section className={styles.featuresSection}>
          <h2 className={styles.sectionTitle}>
            {t("landing:features.title_a")}{" "}
            <span className={styles.greenText}>{t("landing:features.title_b")}</span>
          </h2>

          <div className={styles.featuresGrid}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div className={styles.featureCard} key={i}>
                <div className={styles.featureIcon}>{["⚡", "🎧", "🛡️", "💰", "🚀", "📊"][i]}</div>
                <h3>{t(`landing:features.cards.${i}.h`)}</h3>
                <p>{t(`landing:features.cards.${i}.p`)}</p>
              </div>
            ))}
          </div>

          <div className={styles.ctaCenter}>
            <Link to="/register" className={styles.mainBtn}>
              {t("landing:features.cta")}
            </Link>
          </div>
        </section>

        {/* ASSETS SECTION (Webflow style) */}
        <section className={styles.assetsSection}>
          <div className={styles.assetsHeader}>
            <div className={styles.assetsBadge}>{t("landing:assets.badge")}</div>
            <h2 className={styles.sectionTitleLeft}>
              {t("landing:assets.title_a")}{" "}
              <span className={styles.greenText}>{t("landing:assets.title_b")}</span>
            </h2>
          </div>

          <div className={`${styles.marqueeWrap} ${styles.marqueeFullBleed}`}>
            <div className={styles.shadowMarquee} aria-hidden="true" />
            <div className={styles.marquee}>
              <div className={styles.marqueeTrack}>
                {marqueeItems.map((it, idx) => {
                  if (it.isCount) {
                    return (
                      <div key={`count_${idx}`} className={`${styles.cxAtvs} ${styles.cxAtvsLast}`}>
                        <h2 className={styles.countH1}>
                          <strong>+50</strong>
                          <br />
                          <span className={styles.greenText}>
                            <strong>ATIVOS</strong>
                          </span>
                        </h2>
                      </div>
                    );
                  }
                  return (
                    <div key={`${it.name}_${idx}`} className={styles.cxAtvs}>
                      <img
                        src={it.icon}
                        alt={it.name}
                        className={styles.imgAtiv}
                        loading={idx < 6 ? "eager" : "lazy"}
                      />
                      <h3 className={styles.assetCardName}>{it.name}</h3>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS SECTION */}
        <section className={styles.howItWorksSection}>
          <h2 className={styles.sectionTitle}>
            {t("landing:steps.title_a")}{" "}
            <span className={styles.greenText}>{t("landing:steps.title_b")}</span>
          </h2>

          <div className={styles.stepsGrid}>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>01</div>
              <div className={styles.stepIcon}>👤</div>
              <h3>{t("landing:steps.cards.0.h")}</h3>
              <p>
                {t("landing:steps.cards.0.p_a")}{" "}
                <span className={styles.greenText}>{t("landing:steps.cards.0.p_b")}</span>{" "}
                {t("landing:steps.cards.0.p_c")}
              </p>
            </div>

            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>02</div>
              <div className={styles.stepIcon}>💳</div>
              <h3>{t("landing:steps.cards.1.h")}</h3>
              <p>
                {t("landing:steps.cards.1.p_a")}{" "}
                <span className={styles.greenText}>{t("landing:steps.cards.1.p_b")}</span>{" "}
                {t("landing:steps.cards.1.p_c")}{" "}
                <span className={styles.greenText}>{t("landing:steps.cards.1.p_d")}</span>{" "}
                {t("landing:steps.cards.1.p_e")}
              </p>
            </div>

            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>03</div>
              <div className={styles.stepIcon}>📈</div>
              <h3>{t("landing:steps.cards.2.h")}</h3>
              <p>{t("landing:steps.cards.2.p")}</p>
            </div>
          </div>

          <div className={styles.ctaCenter}>
            <Link to="/register" className={styles.mainBtnSmall}>
              {t("landing:steps.cta")}
            </Link>
          </div>
        </section>

        {/* TRADING SECTION */}
        <section className={styles.tradingSection}>
          <div className={styles.tradeStage}>
            <div className={styles.tradeText}>
              <div className={styles.tradeInner}>
                <div className={styles.parallaxTag}>{t("landing:trade.tag")}</div>
                <h2 className={styles.parallaxTitle}>
                  {t("landing:trade.title_a")}{" "}
                  <span className={styles.greenText}>{t("landing:trade.title_b")}</span>{" "}
                  {t("landing:trade.title_c")}
                </h2>
                <p className={styles.parallaxText}>
                  {t("landing:trade.p_a")} {t("landing:trade.p_b")}
                </p>
                <Link to="/register" className={styles.mainBtn}>
                  {t("landing:trade.cta")}
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ SECTION */}
        <section className={styles.faqSection}>
          <h2 className={styles.sectionTitle}>
            {t("landing:faq.title_a")}{" "}
            <span className={styles.greenText}>{t("landing:faq.title_b")}</span>
          </h2>

          <div className={styles.faqList}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div className={styles.faqItem} key={i}>
                <button className={styles.faqQuestion} onClick={() => toggleFaq(i)}>
                  <span>{t(`landing:faq.q.${i}.q`)}</span>
                  <span className={styles.faqIcon}>{openFaq === i ? "−" : "+"}</span>
                </button>
                {openFaq === i && (
                  <div className={styles.faqAnswer}>
                    <p>{t(`landing:faq.q.${i}.a`)}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerGrid}>
            <div className={styles.footerBrand}>
              <BrandLogo className={styles.brandLogoFooter} />
            </div>

            <div className={styles.footerColumn}>
              <h4>{t("landing:footer.nav_title")}</h4>
              <a href="#" className={styles.footerLink} onClick={onNavNoop}>
                {t("landing:footer.nav_home")}
              </a>
              <a href="#" className={styles.footerLink} onClick={onNavNoop}>
                {t("landing:footer.nav_start")}
              </a>
              <a href="#" className={styles.footerLink} onClick={onNavNoop}>
                {t("landing:footer.nav_awards")}
              </a>
              <a href="#" className={styles.footerLink} onClick={onNavNoop}>
                {t("landing:footer.nav_benefits")}
              </a>
              <a href="#" className={styles.footerLink} onClick={onNavNoop}>
                {t("landing:footer.nav_how")}
              </a>
            </div>

            <div className={styles.footerColumn}>
              <h4>{t("landing:footer.follow_title")}</h4>
              <a href="#">Instagram</a>
              <a href="#">Twitter</a>
            </div>

            <div className={styles.footerColumn}>
              <h4>{t("landing:footer.support_title")}</h4>
              <a
                href="/legal/Politica_anti_fraude_e_lavagem_de_dinheiro.pdf"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("landing:footer.legal_docs")}
              </a>
              <a
                href="/legal/Termos_de_Uso_Oficial.pdf"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("landing:footer.terms")}
              </a>
              <a
                href="/legal/Ordem_Execution_Policy.pdf"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("landing:footer.execution")}
              </a>
              <a
                href="/legal/Privacy_Policy.pdf"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("landing:footer.privacy")}
              </a>
            </div>
          </div>

          <div className={styles.footerBottom}>
            <div className={styles.disclaimer}>
              <p>
                <strong>{t("landing:footer.disclaimer_title")}</strong>
              </p>
              <p>{t("landing:footer.disclaimer_p1")}</p>
              <p>{t("landing:footer.disclaimer_p2")}</p>
              <p>{t("landing:footer.disclaimer_p3")}</p>
              <p>{t("landing:footer.support_email")}</p>
            </div>
            <p className={styles.copyright}>{t("landing:footer.copyright")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}