import React, { useMemo, useState } from "react";
import styles from "./CopyTradePage.module.css";
import { MOCK_COPY_TRADERS } from "@/data/mockCopyTraders";

function formatFollowers(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("pt-BR");
}

export default function CopyTradePage() {
  const [tab, setTab] = useState("top"); // top | copying | want
  const [q, setQ] = useState("");

  const supportEmail = "support@seudominio.com"; // ✅ troque pro seu domínio quando quiser

  const filtered = useMemo(() => {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return MOCK_COPY_TRADERS;
    return MOCK_COPY_TRADERS.filter((t) => String(t.name).toLowerCase().includes(s));
  }, [q]);

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>Copy Trade</div>
      <div className={styles.sub}>Lucre junto com os melhores Traders da sua corretora!</div>

      <div className={styles.hintLine}>
        <span className={styles.lock}>🔒</span>
        <span>Seguro, simples e 100% automático</span>
      </div>

      <div className={styles.tabsRow}>
        <button
          type="button"
          className={`${styles.tab} ${tab === "top" ? styles.tabActive : ""}`}
          onClick={() => setTab("top")}
        >
          Top Traders
        </button>

        <button
          type="button"
          className={`${styles.tab} ${tab === "copying" ? styles.tabActive : ""}`}
          onClick={() => setTab("copying")}
        >
          Copiando
        </button>

        <button
          type="button"
          className={`${styles.tab} ${tab === "want" ? styles.tabActive : ""}`}
          onClick={() => setTab("want")}
        >
          Quero Ser Copiado
        </button>
      </div>

      <div className={styles.divider} />

      {tab === "top" && (
        <>
          <div className={styles.topControls}>
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}>🔎</span>
              <input
                className={styles.search}
                placeholder="Pesquisar"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoComplete="off"
              />
            </div>

            <button type="button" className={styles.followBtn} onClick={() => {}}>
              Seguidores
            </button>
          </div>

          <div className={styles.grid}>
            {filtered.map((t, idx) => (
              <div
                key={t.id}
                className={`${styles.card} ${idx === 1 ? styles.cardHighlight : ""}`}
              >
                <div className={styles.cardTop}>
                  <div className={styles.avatar}>{t.avatarText || "TR"}</div>

                  <div>
                    <p className={styles.cardName}>{t.name}</p>
                    <div className={styles.followersRow}>
                      <span className={styles.peopleIcon}>👥</span>
                      <span>{formatFollowers(t.followers)} Seguidores</span>
                    </div>
                  </div>
                </div>

                <div className={styles.metrics}>
                  <div>
                    <div className={styles.metricLabel}>Ganhos (7 Dias)</div>
                    <div className={`${styles.metricValue} ${styles.valueGreen}`}>{t.profit7d}</div>
                  </div>
                  <div>
                    <div className={styles.metricLabel}>Capital Conectado</div>
                    <div className={`${styles.metricValue} ${styles.valueWhite}`}>{t.connectedCapital}</div>
                  </div>
                </div>

                <div className={styles.bottomMetrics}>
                  <div>
                    <div className={styles.metricLabel}>Lucro Trader</div>
                    <div className={`${styles.metricValue} ${styles.valueGreen}`}>{t.traderProfit}</div>
                  </div>
                  <div>
                    <div className={styles.metricLabel}>Lucro Investidores</div>
                    <div className={`${styles.metricValue} ${styles.valueWhite}`}>{t.investorsProfit}</div>
                  </div>
                </div>

                <div className={styles.actions}>
                  <button type="button" className={styles.btnGhost} onClick={() => {}}>
                    Perfil
                  </button>
                  <button type="button" className={styles.btnPrimary} onClick={() => {}}>
                    Copiar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "copying" && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>👥</div>
          <div className={styles.emptyText}>Você ainda não está seguindo nenhum trader.</div>
        </div>
      )}

      {tab === "want" && (
        <div className={styles.wantWrap}>
          <h3 className={styles.wantTitle}>
            <span>🎯</span>
            <span>Quer ser um TRADER do COPY na nossa corretora?</span>
          </h3>

          <p className={styles.wantSub}>
            Essa é sua chance de ser seguido por centenas de pessoas e ganhar visibilidade na nossa plataforma!
          </p>

          <p className={styles.wantText}>
            Se você manda bem nas operações e quer ser um dos traders oficiais do nosso sistema de Copy Trader, siga o passo:
          </p>

          <div className={styles.mailBox}>
            <p className={styles.mailLine}>
              📩 Envie um e-mail para{" "}
              <span className={`${styles.mailAddr}`}>{supportEmail}</span>{" "}
              com o título: <span className={styles.mailStrong}>"Quero ser Trader do Copy"</span>
            </p>
            <p className={styles.mailLine} style={{ marginTop: 6, opacity: 0.75 }}>
              No corpo do e-mail, informe:
            </p>

            <div className={styles.list}>
              <div className={styles.item}>
                <span className={styles.check}>✓</span>
                <span>Seu e-mail de cadastro na corretora</span>
              </div>
              <div className={styles.item}>
                <span className={styles.check}>✓</span>
                <span>Por que você quer ser um Top Trader do Copy</span>
              </div>
            </div>

            <div className={styles.footerHint}>
              Assim que recebermos, nossa equipe entrará em contato com mais informações.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
