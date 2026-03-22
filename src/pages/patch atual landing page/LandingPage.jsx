import { Link } from "react-router-dom";
import styles from "./LandingPage.module.css";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";

export default function LandingPage() {
  const { t } = useTranslation(["common", "landing"]);
  const [openFaq, setOpenFaq] = useState(null);

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
    const base = [...assets, { name: "+50\nATIVOS", icon: null, isCount: true }];
    return [...base, ...base];
  }, [assets]);

  return (
    <div className={styles.page}>
      {/* BACKGROUND EFFECTS */}
      <div className={styles.bgImage} aria-hidden="true" />
      <div className={styles.gridOverlay} aria-hidden="true" />
      <div className={styles.mainGlow} aria-hidden="true" />

      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logo}>
            ON <span>BROKER</span>
          </div>

          <nav className={styles.nav}>
            <Link to="/sobre" className={styles.navLink}>
              Comece a Investir
            </Link>
            <Link to="/beneficios" className={styles.navLink}>
              Premiações
            </Link>
            <Link to="/como-funciona" className={styles.navLink}>
              Benefícios ON
            </Link>
            <Link to="/faq" className={styles.navLink}>
              Como Operar
            </Link>

            <div className={styles.langSelector}>
              <img
                src="/assets/landing/pt.png"
                alt="PT"
                className={styles.flag}
                loading="eager"
              />
              <span>PT</span>
            </div>

            <div className={styles.authButtons}>
              <Link to="/login" className={styles.loginLink}>
                {t("common:login")}
              </Link>
              <Link to="/register" className={styles.headerCta}>
                Registre-se
              </Link>
            </div>
          </nav>
        </div>
      </header>

      <main className={styles.container}>
        {/* HERO SECTION */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.badge}>TECNOLOGIA EXCLUSIVA</div>
            <h1 className={styles.heroTitle}>
              Invista de forma <br />
              <span className={styles.whiteText}>simples e segura</span> em <br />
              <span className={styles.greenText}>ações, criptos e opções</span>
            </h1>
            <p className={styles.heroSubtitle}>
              Registre-se e receba <span className={styles.greenText}>$ 10.000</span> na sua conta de treinamento.
            </p>
            <Link to="/register" className={styles.mainBtn}>
              Abra sua conta gratuitamente
            </Link>
          </div>

          <div className={styles.heroImageWrapper}>
            <img
              src="/assets/landing/laptop.png"
              alt="Trading Platform"
              className={styles.laptopImg}
              loading="eager"
            />
            <div className={styles.heroHands} aria-hidden="true" />
          </div>
        </section>

        {/* REVIEWS SECTION */}
        <section className={styles.reviewsSection}>
          <h2 className={styles.sectionTitle}>Avaliações</h2>
          <div className={styles.reviewsGrid}>
            <div className={styles.reviewCard}>
              <div className={styles.reviewHeader}>
                <img
                  className={styles.avatarImg}
                  src="/assets/landing/user1.png"
                  alt="Juliana Soares"
                  loading="lazy"
                />
                <div>
                  <div className={styles.reviewName}>Juliana Soares</div>
                  <div className={styles.reviewDate}>15/10/2024</div>
                  <div className={styles.stars}>★★★★★</div>
                </div>
              </div>
              <p>
                A plataforma é mttt fácil de usar! Em menos de 10 minutos eu já estava operando e lucrando! Kkkk
              </p>
            </div>

            <div className={styles.reviewCard}>
              <div className={styles.reviewHeader}>
                <img
                  className={styles.avatarImg}
                  src="/assets/landing/empc.jpg"
                  alt="Carlos Eduardo"
                  loading="lazy"
                />
                <div>
                  <div className={styles.reviewName}>Carlos Eduardo</div>
                  <div className={styles.reviewDate}>02/10/2024</div>
                  <div className={styles.stars}>★★★★★</div>
                </div>
              </div>
              <p>
                A ON BROKER oferece um payout excelente! Isso me fez conquistar a plaquinha de 10k em menos de 1 mês operando lá,
                sou fã dessa corretora e não troco por nada!!!
              </p>
            </div>

            <div className={styles.reviewCard}>
              <div className={styles.reviewHeader}>
                <img
                  className={styles.avatarImg}
                  src="/assets/landing/channels4_profile.jpg"
                  alt="Fernando Martins"
                  loading="lazy"
                />
                <div>
                  <div className={styles.reviewName}>Fernando Martins</div>
                  <div className={styles.reviewDate}>25/09/2024</div>
                  <div className={styles.stars}>★★★★★</div>
                </div>
              </div>
              <p>
                Fiquei com receio quando vi a corretora nova, mas quando meu saque caiu em poucos minutos e o suporte respondeu
                rápido quando precisei, já vi que a ON BROKER é diferente de qualquer uma que já operei, mil vezes melhor.
              </p>
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
              <p>
                Adoro a transparência da ON BROKER! Finalmente uma plataforma onde sei que estou operando contra outros traders,
                e não contra a corretora.
              </p>
            </div>
          </div>
        </section>

        {/* FEATURES SECTION */}
        <section className={styles.featuresSection}>
          <h2 className={styles.sectionTitle}>
            Inovações e benefícios <span className={styles.greenText}>ON BROKER</span>
          </h2>

          <div className={styles.featuresGrid}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>⚡</div>
              <h3>Plataforma Intuitiva e fácil de usar</h3>
              <p>
                Desenvolvida para iniciantes e experientes, a plataforma é intuitiva e permite que você realize operações com facilidade.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🎧</div>
              <h3>Suporte 24/7 Humanizado</h3>
              <p>
                Conte com um suporte disponível todos os dias, o tempo todo, composto por uma equipe treinada e pronta para ajudar você.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🛡️</div>
              <h3>Transparência e confiança</h3>
              <p>
                A ON BROKER não lucra com as perdas dos clientes. Operações são feitas contra outros traders, e nossa receita vem da taxa por operação.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>💰</div>
              <h3>Payout acima da média do mercado</h3>
              <p>
                Com um payout fixo de 92%, você maximiza seus lucros em cada operação, aproveitando uma das melhores taxas de retorno disponíveis.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🚀</div>
              <h3>Depósitos e saques super rápidos</h3>
              <p>
                Opções diversas para depósitos e retiradas rápidas, com um valor mínimo acessível de $ 60 para começar a investir.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>📊</div>
              <h3>Indicadores exclusivos de negociação</h3>
              <p>
                A ON BROKER oferece indicadores exclusivos que podem ser testados na conta demo, para encontrar a estratégia ideal para seu perfil.
              </p>
            </div>
          </div>

          <div className={styles.ctaCenter}>
            <Link to="/register" className={styles.mainBtn}>
              Comece a investir e seja premiado
            </Link>
          </div>
        </section>

        {/* ASSETS SECTION (Webflow style) */}
        <section className={styles.assetsSection}>
          <div className={styles.assetsHeader}>
            <div className={styles.assetsBadge}>Os maiores ativos do mercado para você lucrar</div>
            <h2 className={styles.sectionTitleLeft}>
              Escolha um dos ativos <span className={styles.greenText}>e comece a investir</span>
            </h2>
          </div>

          <div className={styles.marqueeWrap}>
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
            Como começar em <span className={styles.greenText}>3 PASSOS</span>
          </h2>

          <div className={styles.stepsGrid}>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>01</div>
              <div className={styles.stepIcon}>👤</div>
              <h3>Cadastrar</h3>
              <p>
                Crie sua conta na <span className={styles.greenText}>ON BROKER</span> rapidamente, apenas com dados básicos.
              </p>
            </div>

            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>02</div>
              <div className={styles.stepIcon}>💳</div>
              <h3>Depositar</h3>
              <p>
                Deposite a partir de <span className={styles.greenText}>$ 60</span> ou experimente com{" "}
                <span className={styles.greenText}>$ 10.000</span> virtuais na demo.
              </p>
            </div>

            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>03</div>
              <div className={styles.stepIcon}>📈</div>
              <h3>Investir</h3>
              <p>Com sua conta ativa, comece a investir e explore as opções disponíveis.</p>
            </div>
          </div>

          <div className={styles.ctaCenter}>
            <Link to="/register" className={styles.mainBtnSmall}>
              Abra sua conta em menos de 1 min →
            </Link>
          </div>
        </section>

        {/* TRADING SECTION (parallax: texto SOBRE a imagem, não lateral) */}
        <section className={styles.tradingSection}>
          <div className={styles.tradeStage}>
            <div className={styles.tradeBg} aria-hidden="true" />
            <img
              src="/assets/landing/pngcellon.png"
              alt="Mobile Trading"
              className={styles.tradePhone}
              loading="lazy"
            />

            <div className={styles.tradeText}>
              <div className={styles.parallaxTag}>Você sempre ON!</div>
              <h2 className={styles.parallaxTitle}>
                Negocie em <span className={styles.greenText}>qualquer lugar do mundo</span> 24h por dia.
              </h2>
              <p className={styles.parallaxText}>
                Nossa plataforma de negociação poderosa e acessível permite que você aproveite cada oportunidade de negociação. Onde
                quer que você esteja. Negocie agora!
              </p>
              <Link to="/register" className={styles.mainBtn}>
                Abra sua conta gratuitamente
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ SECTION */}
        <section className={styles.faqSection}>
          <h2 className={styles.sectionTitle}>
            Perguntas <span className={styles.greenText}>FREQUENTES</span>
          </h2>

          <div className={styles.faqList}>
            <div className={styles.faqItem}>
              <button className={styles.faqQuestion} onClick={() => toggleFaq(0)}>
                <span>Como faço para abrir uma conta na ON BROKER?</span>
                <span className={styles.faqIcon}>{openFaq === 0 ? "−" : "+"}</span>
              </button>
              {openFaq === 0 && (
                <div className={styles.faqAnswer}>
                  <p>
                    Fornecemos um processo rápido e simples de cadastro que pode ser concluído em poucos minutos. Apenas alguns dados
                    básicos são necessários para criar sua conta.
                  </p>
                </div>
              )}
            </div>

            <div className={styles.faqItem}>
              <button className={styles.faqQuestion} onClick={() => toggleFaq(1)}>
                <span>Qual é o valor mínimo para depósito e retirada?</span>
                <span className={styles.faqIcon}>{openFaq === 1 ? "−" : "+"}</span>
              </button>
              {openFaq === 1 && (
                <div className={styles.faqAnswer}>
                  <p>
                    O depósito mínimo é de $ 60. Para retiradas, você também pode escolher valores conforme sua conveniência, com
                    transferências rápidas e seguras.
                  </p>
                </div>
              )}
            </div>

            <div className={styles.faqItem}>
              <button className={styles.faqQuestion} onClick={() => toggleFaq(2)}>
                <span>Posso operar em quais ativos pela plataforma?</span>
                <span className={styles.faqIcon}>{openFaq === 2 ? "−" : "+"}</span>
              </button>
              {openFaq === 2 && (
                <div className={styles.faqAnswer}>
                  <p>
                    Oferecemos uma ampla gama de ativos, incluindo ações, criptomoedas e opções, com mais de 50 opções disponíveis para
                    investimento.
                  </p>
                </div>
              )}
            </div>

            <div className={styles.faqItem}>
              <button className={styles.faqQuestion} onClick={() => toggleFaq(3)}>
                <span>Qual é o horário de atendimento do suporte?</span>
                <span className={styles.faqIcon}>{openFaq === 3 ? "−" : "+"}</span>
              </button>
              {openFaq === 3 && (
                <div className={styles.faqAnswer}>
                  <p>Nosso suporte está disponível 24/7 para atender suas dúvidas e necessidades, com atendimento humanizado sempre à sua disposição.</p>
                </div>
              )}
            </div>

            <div className={styles.faqItem}>
              <button className={styles.faqQuestion} onClick={() => toggleFaq(4)}>
                <span>A ON BROKER lucra com as perdas dos clientes?</span>
                <span className={styles.faqIcon}>{openFaq === 4 ? "−" : "+"}</span>
              </button>
              {openFaq === 4 && (
                <div className={styles.faqAnswer}>
                  <p>
                    Não. Na ON BROKER, você opera contra outros traders. Nossa receita é gerada por uma taxa sobre cada operação,
                    mantendo a transparência e a confiança em nossas transações.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerGrid}>
            <div className={styles.footerBrand}>
              <div className={styles.logo}>
                ON <span>BROKER</span>
              </div>
            </div>

            <div className={styles.footerColumn}>
              <h4>Navegação</h4>
              <Link to="/">Home</Link>
              <Link to="/sobre">Comece a Investir</Link>
              <Link to="/beneficios">Premiações</Link>
              <Link to="/como-funciona">Benefícios ON</Link>
              <Link to="/faq">Como Operar</Link>
            </div>

            <div className={styles.footerColumn}>
              <h4>Siga-nos</h4>
              <a href="#">Instagram</a>
              <a href="#">Twitter</a>
            </div>

            <div className={styles.footerColumn}>
              <h4>Suporte</h4>
              <a href="#">Documentos legais</a>
              <a href="#">Termos de uso</a>
              <a href="#">Ordem de execução</a>
              <a href="#">Política de privacidade</a>
            </div>
          </div>

          <div className={styles.footerBottom}>
            <div className={styles.disclaimer}>
              <p><strong>DISCLAIMER</strong></p>
              <p>
                A ON BROKER não está autorizada pela Comissão de Valores Mobiliários ("CVM") a oferecer diretamente serviços de intermediação
                e/ou distribuição de valores mobiliários emitidos no exterior a investidores residentes na República Federativa do Brasil,
                motivo pelo qual nenhuma referência feita aqui deve ser entendida como uma oferta direta de serviços a esses investidores
                pela ON BROKER. Embora a ON BROKER avalie cuidadosamente os retornos potenciais com base no comportamento histórico e atual do
                mercado, não há nenhuma representação quanto à probabilidade de que qualquer alocação real ou proposta irá de fato atingir um
                determinado resultado ou objetivo de investimento.
              </p>
              <p>
                A performance passada não é garantia de resultado futuro e, de fato, a volatilidade significa que os retornos em qualquer
                período podem ser muito superiores ou inferiores aos de um período anterior. Alguns clientes podem ter resultados de investimento
                materialmente diferentes daqueles indicados por ferramentas de investimento disponibilizadas pela ON BROKER.
              </p>
              <p>
                Derivativos são instrumentos financeiros complexos e de alto risco, há que se considerar a possibilidade de perda de valores,
                inclusive em sua totalidade.
              </p>
              <p>Suporte: support@onbroker.co</p>
            </div>
            <p className={styles.copyright}>© 2024 ON BROKER. All rights reserved</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
