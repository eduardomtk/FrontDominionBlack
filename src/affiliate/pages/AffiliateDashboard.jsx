import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/services/supabaseClient";
import BrandLogo from "@/components/BrandLogo/BrandLogo";

function isActiveStatus(status) {
  const s = String(status || "").trim().toUpperCase();
  return s === "ACTIVE" || s === "ATIVO";
}

function commissionStatusLabel(status) {
  const s = String(status || "").trim().toUpperCase();
  if (s === "PENDING") return "Variando";
  if (s === "PAID") return "Creditado";
  if (s === "NO_PROFIT") return "Sem comissão";
  if (s === "CANCELLED" || s === "CANCELED") return "Cancelado";
  if (s === "FAILED") return "Falhou";
  return s || "—";
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function formatDateOnly(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function shortId(id) {
  const s = String(id || "");
  if (!s) return "—";
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function formatInt(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR") : "0";
}

function formatBRL(v) {
  const n = Number(v || 0);
  return Number.isFinite(n)
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "R$ 0,00";
}

function normalizePctForDisplay(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return 0;
  if (n > 0 && n <= 1) return n * 100;
  return n;
}

function chipStyle(status, isMobile) {
  const s = String(status || "").trim().toUpperCase();
  const base = isMobile ? styles.chipBaseMobile : null;

  if (s === "PAID") return { ...(base || {}), ...styles.chipPaid };
  if (s === "PENDING") return { ...(base || {}), ...styles.chipPending };
  if (s === "NO_PROFIT") return { ...(base || {}), ...styles.chipNoProfit };
  if (s === "FAILED") return { ...(base || {}), ...styles.chipFailed };
  return { ...(base || {}), ...styles.chipDefault };
}

function shallowSameKeyed(a, b, keyFn) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (keyFn(a[i]) !== keyFn(b[i])) return false;
  }
  return true;
}

function normalizeErrorMessage(err, fallback) {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err?.message) return String(err.message);
  if (err?.error_description) return String(err.error_description);
  if (err?.details) return String(err.details);
  try {
    return JSON.stringify(err);
  } catch {
    return fallback || "Erro desconhecido";
  }
}

function AffiliateBrand({ isMobile = false }) {
  return (
    <div style={{ display: "grid", gap: isMobile ? 6 : 8, alignItems: "start" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          fontSize: isMobile ? 22 : 28,
          lineHeight: 1,
        }}
      >
        <BrandLogo />
      </div>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          width: "fit-content",
          padding: isMobile ? "6px 10px" : "7px 14px",
          borderRadius: 999,
          border: "1px solid rgba(0, 224, 255, 0.18)",
          background: "linear-gradient(180deg, rgba(7,16,30,0.86), rgba(7,16,30,0.58))",
          boxShadow: "0 10px 26px rgba(0,0,0,0.24)",
          color: "#9bd4ff",
          fontSize: isMobile ? 11 : 13,
          fontWeight: 800,
          letterSpacing: isMobile ? "0.12em" : "0.16em",
          textTransform: "uppercase",
        }}
      >
        Portal de Afiliados
      </div>
    </div>
  );
}

async function fetchAffiliateMyReferrals(limit = 50, offset = 0) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token || "";

  if (!accessToken) {
    throw new Error("Sessão inválida para carregar referidos");
  }

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/affiliate-my-referrals?limit=${limit}&offset=${offset}`;

  const res = await fetch(fnUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(payload?.error || payload?.message || "Erro ao carregar referidos");
  }

  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    total_count: Number(payload?.total_count || 0),
    last_7d_count: Number(payload?.last_7d_count || 0),
  };
}

export default function AffiliateDashboard() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [copyOk, setCopyOk] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [me, setMe] = useState(null);

  const [affSettings, setAffSettings] = useState(null);
  const [refCode, setRefCode] = useState("");
  const [rollups, setRollups] = useState(null);

  const [referrals, setReferrals] = useState([]);
  const [dailyCommissions, setDailyCommissions] = useState([]);

  const [cards, setCards] = useState({
    referred_total: 0,
    referred_7d: 0,
    trades_count: 0,
    win_count: 0,
    loss_count: 0,
    commission_pending: 0,
    commission_paid: 0,
  });

  const [diag, setDiag] = useState({
    settings: { ok: true, message: "" },
    codes: { ok: true, message: "" },
    rollups: { ok: true, message: "" },
    daily: { ok: true, message: "" },
    referrals: { ok: true, message: "" },
  });

  const pollRef = useRef(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    function updateViewport() {
      const mobilePortrait =
        window.matchMedia("(max-width: 767px) and (orientation: portrait)").matches;
      setIsMobile(mobilePortrait);
    }

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  async function fetchDashboard({ initial = false } = {}) {
    try {
      if (initial) setLoading(true);

      const { data: u, error: userErr } = await supabase.auth.getUser();

      if (!aliveRef.current) return;

      if (userErr) {
        throw userErr;
      }

      const user = u?.user || null;
      setMe(user);

      if (!user?.id) {
        setAffSettings(null);
        setRefCode("");
        setRollups(null);
        setReferrals([]);
        setDailyCommissions([]);
        setCards({
          referred_total: 0,
          referred_7d: 0,
          trades_count: 0,
          win_count: 0,
          loss_count: 0,
          commission_pending: 0,
          commission_paid: 0,
        });
        setDiag({
          settings: { ok: true, message: "" },
          codes: { ok: true, message: "" },
          rollups: { ok: true, message: "" },
          daily: { ok: true, message: "" },
          referrals: { ok: true, message: "" },
        });
        return;
      }

      const affiliateId = user.id;

      const results = await Promise.allSettled([
        supabase
          .from("affiliate_settings")
          .select("affiliate_id,status,payout_pct,destination_email,destination_user_id,updated_at")
          .eq("affiliate_id", affiliateId)
          .maybeSingle(),

        supabase
          .from("affiliate_codes")
          .select("code,created_at")
          .eq("affiliate_id", affiliateId)
          .order("created_at", { ascending: true }),

        supabase
          .from("affiliate_rollups")
          .select("affiliate_id,trades_count,loss_count,win_count,first_trade_at,last_trade_at,updated_at")
          .eq("affiliate_id", affiliateId)
          .maybeSingle(),

        supabase
          .from("affiliate_daily_commissions")
          .select("id,commission_date,trades_count,house_net_total,commission_pct,commission_amount,broker_net_profit,status,paid_at,updated_at")
          .eq("affiliate_id", affiliateId)
          .order("commission_date", { ascending: false })
          .limit(120),

        fetchAffiliateMyReferrals(50, 0),
      ]);

      if (!aliveRef.current) return;

      const settingsRes =
        results[0].status === "fulfilled"
          ? results[0].value
          : { data: null, error: results[0].reason };

      const codesRes =
        results[1].status === "fulfilled"
          ? results[1].value
          : { data: [], error: results[1].reason };

      const rollupsRes =
        results[2].status === "fulfilled"
          ? results[2].value
          : { data: null, error: results[2].reason };

      const dailyRes =
        results[3].status === "fulfilled"
          ? results[3].value
          : { data: [], error: results[3].reason };

      const referralsEdge =
        results[4].status === "fulfilled"
          ? results[4].value
          : { items: [], total_count: 0, last_7d_count: 0, error: results[4].reason };

      const nextDiag = {
        settings: {
          ok: !settingsRes?.error,
          message: settingsRes?.error
            ? normalizeErrorMessage(settingsRes.error, "Erro ao consultar affiliate_settings")
            : "",
        },
        codes: {
          ok: !codesRes?.error,
          message: codesRes?.error
            ? normalizeErrorMessage(codesRes.error, "Erro ao consultar affiliate_codes")
            : "",
        },
        rollups: {
          ok: !rollupsRes?.error,
          message: rollupsRes?.error
            ? normalizeErrorMessage(rollupsRes.error, "Erro ao consultar affiliate_rollups")
            : "",
        },
        daily: {
          ok: !dailyRes?.error,
          message: dailyRes?.error
            ? normalizeErrorMessage(dailyRes.error, "Erro ao consultar affiliate_daily_commissions")
            : "",
        },
        referrals: {
          ok: !referralsEdge?.error,
          message: referralsEdge?.error
            ? normalizeErrorMessage(referralsEdge.error, "Erro ao consultar affiliate-my-referrals")
            : "",
        },
      };

      setDiag(nextDiag);

      if (settingsRes?.error) {
        if (import.meta.env.DEV) {
          console.error("[AffiliateDashboard] settingsErr:", settingsRes.error);
        }
        setAffSettings(null);
      } else {
        setAffSettings(settingsRes?.data || null);
      }

      let nextRefCode = "";
      if (codesRes?.error) {
        if (import.meta.env.DEV) {
          console.error("[AffiliateDashboard] codesErr:", codesRes.error);
        }
      } else {
        nextRefCode = String(codesRes?.data?.[0]?.code || "").trim();
      }
      setRefCode(nextRefCode);

      if (rollupsRes?.error) {
        if (import.meta.env.DEV) {
          console.error("[AffiliateDashboard] rollupsErr:", rollupsRes.error);
        }
        setRollups(null);
      } else {
        setRollups(rollupsRes?.data || null);
      }

      const dailyList =
        dailyRes?.error || !Array.isArray(dailyRes?.data) ? [] : dailyRes.data;

      if (dailyRes?.error && import.meta.env.DEV) {
        console.error("[AffiliateDashboard] dailyResErr:", dailyRes.error);
      }

      const referralRowsForUI = Array.isArray(referralsEdge?.items) ? referralsEdge.items : [];

      let referredTotal = Number(referralsEdge?.total_count || 0);
      let referred7d = Number(referralsEdge?.last_7d_count || 0);

      if (!Number.isFinite(referredTotal) || referredTotal < 0) referredTotal = 0;
      if (!Number.isFinite(referred7d) || referred7d < 0) referred7d = 0;

      const tradesCount = Number(rollupsRes?.data?.trades_count || 0);
      const winCount = Number(rollupsRes?.data?.win_count || 0);
      const lossCount = Number(rollupsRes?.data?.loss_count || 0);

      let commissionPending = 0;
      let commissionPaid = 0;

      for (const d of dailyList) {
        const amt = Number(d.commission_amount || 0);
        const st = String(d.status || "").toUpperCase();
        if (!Number.isFinite(amt)) continue;

        if (st === "PAID") commissionPaid += amt;
        else if (st === "PENDING") commissionPending += amt;
      }

      setCards({
        referred_total: referredTotal,
        referred_7d: referred7d,
        trades_count: Number.isFinite(tradesCount) ? tradesCount : 0,
        win_count: Number.isFinite(winCount) ? winCount : 0,
        loss_count: Number.isFinite(lossCount) ? lossCount : 0,
        commission_pending: commissionPending,
        commission_paid: commissionPaid,
      });

      setReferrals((prev) => {
        const same = shallowSameKeyed(
          prev,
          referralRowsForUI,
          (r) =>
            `${r.id}_${r.referred_user_id}_${r.referred_email || ""}_${r.created_at || ""}_${r.ref_code || ""}`
        );
        return same ? prev : referralRowsForUI;
      });

      setDailyCommissions((prev) => {
        const same = shallowSameKeyed(
          prev,
          dailyList,
          (d) =>
            `${d.id}_${d.status || ""}_${d.commission_amount || 0}_${d.trades_count || 0}_${d.updated_at || ""}`
        );
        return same ? prev : dailyList;
      });
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error("[AffiliateDashboard] fetchDashboard fatal:", e);
      }

      if (!aliveRef.current) return;

      setDiag({
        settings: { ok: false, message: normalizeErrorMessage(e, "Falha geral ao carregar o painel") },
        codes: { ok: false, message: normalizeErrorMessage(e, "Falha geral ao carregar o painel") },
        rollups: { ok: false, message: normalizeErrorMessage(e, "Falha geral ao carregar o painel") },
        daily: { ok: false, message: normalizeErrorMessage(e, "Falha geral ao carregar o painel") },
        referrals: { ok: false, message: normalizeErrorMessage(e, "Falha geral ao carregar o painel") },
      });
    } finally {
      if (!aliveRef.current) return;
      if (initial) setLoading(false);
    }
  }

  useEffect(() => {
    aliveRef.current = true;

    fetchDashboard({ initial: true });

    pollRef.current = setInterval(() => {
      fetchDashboard({ initial: false });
    }, 8000);

    return () => {
      aliveRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const affiliateLink = useMemo(() => {
    const base = window.location.origin;
    if (!refCode) return `${base}/?ref=SEU_CODIGO`;
    return `${base}/?ref=${encodeURIComponent(refCode)}`;
  }, [refCode]);

  const affiliateStatusLabel = useMemo(() => {
    const st = affSettings?.status;
    if (!st) return "—";
    return String(st);
  }, [affSettings?.status]);

  const affiliateActive = useMemo(() => {
    return isActiveStatus(affSettings?.status);
  }, [affSettings?.status]);

  const winRate = useMemo(() => {
    const w = Number(cards.win_count || 0);
    const l = Number(cards.loss_count || 0);
    const total = w + l;
    if (!total) return "—";
    const pct = (w / total) * 100;
    return `${pct.toFixed(1)}%`;
  }, [cards.win_count, cards.loss_count]);

  const hasAnyDiagError = useMemo(() => {
    return !diag.settings.ok || !diag.codes.ok || !diag.rollups.ok || !diag.daily.ok || !diag.referrals.ok;
  }, [diag]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(affiliateLink);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1200);
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = affiliateLink;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        setCopyOk(true);
        setTimeout(() => setCopyOk(false), 1200);
      } catch {}
    }
  }

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } finally {
      navigate("/affiliate/login", { replace: true });
    }
  }

  return (
    <div style={{ ...styles.page, ...(isMobile ? styles.pageMobile : null) }}>
      <div style={{ ...styles.topbar, ...(isMobile ? styles.topbarMobile : null) }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <AffiliateBrand isMobile={isMobile} />
          <div style={{ ...styles.sub, ...(isMobile ? styles.subMobile : null) }}>
            {me?.email ? (
              <>
                Logado como{" "}
                <b style={styles.emailBlue} title={me.email}>
                  {me.email}
                </b>
                <span style={{ opacity: 0.6 }}> • </span>
                Status:{" "}
                <span style={affiliateActive ? styles.statusActive : styles.statusInactive}>
                  <b style={{ fontWeight: 900 }}>{affiliateStatusLabel}</b>
                </span>
              </>
            ) : (
              "—"
            )}
          </div>
        </div>

        <button
          style={{ ...styles.btnGhost, ...(isMobile ? styles.btnGhostMobile : null) }}
          onClick={handleLogout}
        >
          Sair
        </button>
      </div>

      {loading ? (
        <div style={styles.loading}>Carregando seu painel…</div>
      ) : (
        <>
          {hasAnyDiagError && (
            <div style={styles.warnError}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>
                ⚠️ Algumas partes do painel falharam ao carregar.
              </div>

              {!diag.settings.ok && (
                <div style={styles.warnLine}>
                  <b>affiliate_settings:</b> erro de leitura • {diag.settings.message}
                </div>
              )}

              {!diag.codes.ok && (
                <div style={styles.warnLine}>
                  <b>affiliate_codes:</b> erro de leitura • {diag.codes.message}
                </div>
              )}

              {!diag.rollups.ok && (
                <div style={styles.warnLine}>
                  <b>affiliate_rollups:</b> erro de leitura • {diag.rollups.message}
                </div>
              )}

              {!diag.daily.ok && (
                <div style={styles.warnLine}>
                  <b>affiliate_daily_commissions:</b> erro de leitura • {diag.daily.message}
                </div>
              )}

              {!diag.referrals.ok && (
                <div style={styles.warnLine}>
                  <b>affiliate-my-referrals:</b> erro de leitura • {diag.referrals.message}
                </div>
              )}
            </div>
          )}

          {diag.settings.ok && (!affSettings || !affiliateActive) && (
            <div style={styles.warn}>
              ⚠️ Sua conta não está marcada como afiliado ativo em <b>affiliate_settings</b>.
              <div style={{ marginTop: 6, opacity: 0.9 }}>
                affiliate_settings: <b>{affSettings ? "encontrado" : "não encontrado"}</b> • status:{" "}
                <b>{affiliateStatusLabel}</b>
              </div>
            </div>
          )}

          <div style={{ ...styles.grid, ...(isMobile ? styles.gridMobile : null) }}>
            <Card
              title="Referidos (total)"
              value={formatInt(cards.referred_total)}
              hint="Total vinculados"
              isMobile={isMobile}
            />
            <Card
              title="Novos (7d)"
              value={formatInt(cards.referred_7d)}
              hint="Últimos 7 dias"
              isMobile={isMobile}
            />
            <Card
              title="Trades (total)"
              value={formatInt(cards.trades_count)}
              hint="Somatório dos referidos"
              isMobile={isMobile}
            />
            <Card
              title="Win rate"
              value={winRate}
              hint={`${formatInt(cards.win_count)} win / ${formatInt(cards.loss_count)} loss`}
              isMobile={isMobile}
            />
          </div>

          <div style={{ ...styles.grid2, ...(isMobile ? styles.grid2Mobile : null) }}>
            <Card
              title="Comissão pendente"
              value={formatBRL(cards.commission_pending)}
              hint="Valor dinâmico: varia conforme a movimentação dos referidos"
              valueStyle={styles.valueMoneyGreen}
              isMobile={isMobile}
            />
            <Card
              title="Comissão paga"
              value={formatBRL(cards.commission_paid)}
              hint="Total já creditado"
              valueStyle={styles.valueMoneyGreen}
              isMobile={isMobile}
            />
          </div>

          <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : null) }}>
            <div style={{ ...styles.panelTitle, ...(isMobile ? styles.panelTitleMobile : null) }}>
              Seu link de afiliado
            </div>

            <div style={{ ...styles.linkRow, ...(isMobile ? styles.linkRowMobile : null) }}>
              <div style={styles.linkInputWrap}>
                <input
                  style={{ ...styles.linkInput, ...(isMobile ? styles.linkInputMobile : null) }}
                  value={affiliateLink}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
                <div style={styles.linkGlowLine} />
              </div>

              <button
                style={{ ...styles.btnPrimary, ...(isMobile ? styles.btnPrimaryMobile : null) }}
                onClick={handleCopy}
              >
                {copyOk ? "Copiado ✅" : "Copiar"}
              </button>
            </div>

            <div style={{ ...styles.mini, ...(isMobile ? styles.miniMobile : null) }}>
              Código: <b style={styles.miniStrong}>{refCode || "—"}</b>
              {affSettings?.payout_pct != null && (
                <>
                  <span style={{ opacity: 0.6 }}> • </span>
                  Comissão:{" "}
                  <b style={styles.miniStrong}>
                    {normalizePctForDisplay(affSettings.payout_pct).toFixed(0)}%
                  </b>
                </>
              )}
              {affSettings?.destination_email && (
                <>
                  <span style={{ opacity: 0.6 }}> • </span>
                  Destino:{" "}
                  <b style={styles.emailBlue} title={affSettings.destination_email}>
                    {affSettings.destination_email}
                  </b>
                </>
              )}
            </div>

            {diag.codes.ok && !refCode && (
              <div style={styles.warn}>
                ⚠️ Não encontrei o <b>code</b> em <b>affiliate_codes</b> para este usuário.
                <div style={{ marginTop: 6, opacity: 0.9 }}>
                  Solução: criar um registro em <b>affiliate_codes</b> com <b>affiliate_id = user.id</b>.
                </div>
              </div>
            )}
          </div>

          <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : null) }}>
            <div style={{ ...styles.panelTitle, ...(isMobile ? styles.panelTitleMobile : null) }}>
              Atividade
            </div>

            <div style={{ ...styles.kvGrid, ...(isMobile ? styles.kvGridMobile : null) }}>
              <KV label="Primeiro trade" value={formatDateTime(rollups?.first_trade_at)} isMobile={isMobile} />
              <KV label="Último trade" value={formatDateTime(rollups?.last_trade_at)} isMobile={isMobile} />
              <KV label="Atualizado em" value={formatDateTime(rollups?.updated_at)} isMobile={isMobile} />
              <KV label="Trades" value={formatInt(cards.trades_count)} isMobile={isMobile} />
            </div>
          </div>

          <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : null) }}>
            <div style={{ ...styles.panelTitle, ...(isMobile ? styles.panelTitleMobile : null) }}>
              Novos referidos
            </div>

            {referrals.length === 0 ? (
              <div style={styles.empty}>Nenhum referido ainda.</div>
            ) : (
              <div style={{ ...styles.tableWrap, ...(isMobile ? styles.tableWrapMobile : null) }}>
                <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : null) }}>
                  <thead>
                    <tr>
                      <th style={{ ...styles.th, ...styles.thCenter, ...(isMobile ? styles.thMobile : null) }}>
                        Data
                      </th>
                      <th style={{ ...styles.th, ...styles.thCenter, ...(isMobile ? styles.thMobile : null) }}>
                        Referido
                      </th>
                      <th style={{ ...styles.th, ...styles.thCenter, ...(isMobile ? styles.thMobile : null) }}>
                        Código
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.slice(0, 20).map((r) => (
                      <tr key={`${r.id}_${r.referred_user_id}_${r.created_at || ""}`}>
                        <td style={{ ...styles.td, ...styles.tdCenter, ...(isMobile ? styles.tdMobile : null) }}>
                          {formatDateTime(r.created_at)}
                        </td>
                        <td style={{ ...styles.td, ...styles.tdCenter, ...(isMobile ? styles.tdMobile : null) }}>
                          {r.referred_email ? (
                            <span style={styles.emailBlue} title={r.referred_email}>
                              {r.referred_email}
                            </span>
                          ) : (
                            <span style={styles.tdMonoInline}>{shortId(r.referred_user_id)}</span>
                          )}
                        </td>
                        <td style={{ ...styles.td, ...styles.tdCenter, ...(isMobile ? styles.tdMobile : null) }}>
                          <span style={{ ...styles.codePill, ...(isMobile ? styles.codePillMobile : null) }}>
                            {r.ref_code || refCode || "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={styles.hint}>
                  Mostrando os 20 mais recentes. (Total carregado: {formatInt(referrals.length)})
                </div>
              </div>
            )}
          </div>

          <div style={{ ...styles.panel, ...(isMobile ? styles.panelMobile : null) }}>
            <div style={{ ...styles.panelTitle, ...(isMobile ? styles.panelTitleMobile : null) }}>
              Comissões / movimentação
            </div>

            <div style={{ ...styles.panelNote, ...(isMobile ? styles.panelNoteMobile : null) }}>
              As comissões variam em tempo real conforme a movimentação dos referidos no dia. O valor só se consolida
              quando houver lucro líquido da corretora naquele fechamento diário.
            </div>

            {dailyCommissions.length === 0 ? (
              <div style={styles.empty}>Nenhuma comissão registrada.</div>
            ) : (
              <div style={{ ...styles.tableWrap, ...(isMobile ? styles.tableWrapMobile : null) }}>
                <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : null) }}>
                  <thead>
                    <tr>
                      <th style={{ ...styles.th, ...styles.thCenter, ...(isMobile ? styles.thMobile : null) }}>
                        Dia
                      </th>
                      <th style={{ ...styles.th, ...styles.thCenter, ...(isMobile ? styles.thMobile : null) }}>
                        Trades
                      </th>
                      <th style={{ ...styles.th, ...styles.thCenter, ...(isMobile ? styles.thMobile : null) }}>
                        House net
                      </th>
                      <th style={{ ...styles.th, ...styles.thCenter, ...(isMobile ? styles.thMobile : null) }}>
                        Comissão
                      </th>
                      <th style={{ ...styles.th, ...styles.thCenter, ...(isMobile ? styles.thMobile : null) }}>
                        Lucro corretora
                      </th>
                      <th style={{ ...styles.th, ...styles.thCenter, ...(isMobile ? styles.thMobile : null) }}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyCommissions.slice(0, 20).map((d) => (
                      <tr key={d.id}>
                        <td style={{ ...styles.td, ...styles.tdCenter, ...(isMobile ? styles.tdMobile : null) }}>
                          {formatDateOnly(d.commission_date)}
                        </td>
                        <td style={{ ...styles.td, ...styles.tdCenter, ...(isMobile ? styles.tdMobile : null) }}>
                          {formatInt(d.trades_count)}
                        </td>
                        <td style={{ ...styles.td, ...styles.tdCenter, ...(isMobile ? styles.tdMobile : null) }}>
                          <span style={styles.moneyBlue}>{formatBRL(d.house_net_total)}</span>
                        </td>
                        <td style={{ ...styles.td, ...styles.tdCenter, ...(isMobile ? styles.tdMobile : null) }}>
                          <span style={styles.moneyGreen}>{formatBRL(d.commission_amount)}</span>
                        </td>
                        <td style={{ ...styles.td, ...styles.tdCenter, ...(isMobile ? styles.tdMobile : null) }}>
                          <span style={styles.moneyBroker}>{formatBRL(d.broker_net_profit)}</span>
                        </td>
                        <td style={{ ...styles.td, ...styles.tdCenter, ...(isMobile ? styles.tdMobile : null) }}>
                          <span style={chipStyle(d.status, isMobile)}>
                            {commissionStatusLabel(d.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={styles.hint}>
                  Mostrando as 20 movimentações diárias mais recentes. (Total carregado: {formatInt(dailyCommissions.length)})
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Card({ title, value, hint, valueStyle, isMobile }) {
  return (
    <div style={{ ...styles.card, ...(isMobile ? styles.cardMobile : null) }}>
      <div style={{ ...styles.cardTitle, ...(isMobile ? styles.cardTitleMobile : null) }}>{title}</div>
      <div style={{ ...styles.cardValue, ...(valueStyle || null), ...(isMobile ? styles.cardValueMobile : null) }}>
        {value}
      </div>
      <div style={{ ...styles.cardHint, ...(isMobile ? styles.cardHintMobile : null) }}>{hint}</div>
    </div>
  );
}

function KV({ label, value, isMobile }) {
  return (
    <div style={{ ...styles.kv, ...(isMobile ? styles.kvMobile : null) }}>
      <div style={{ ...styles.kvLabel, ...(isMobile ? styles.kvLabelMobile : null) }}>{label}</div>
      <div style={{ ...styles.kvValue, ...(isMobile ? styles.kvValueMobile : null) }}>{value}</div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: 20,
    background: "#070b12",
    color: "#e9eefc",
    backgroundImage:
      "radial-gradient(900px 420px at 20% -10%, rgba(120,180,255,0.10), transparent 60%), radial-gradient(700px 380px at 85% 0%, rgba(0,255,160,0.08), transparent 55%), radial-gradient(800px 400px at 60% 120%, rgba(255,60,90,0.06), transparent 55%)",
    boxSizing: "border-box",
  },

  pageMobile: {
    padding: 14,
  },

  topbar: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 14px",
    borderRadius: 12,
    background: "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.028))",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    marginBottom: 16,
  },

  topbarMobile: {
    alignItems: "stretch",
    flexDirection: "column",
    padding: "12px 12px",
    marginBottom: 14,
  },

  brandLogo: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    lineHeight: 1,
    gap: 0,
    userSelect: "none",
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: "0.6px",
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
  },

  brandLogoMobile: {
    fontSize: 18,
  },

  brandMain: {
    display: "inline-flex",
    alignItems: "center",
    lineHeight: 1,
  },

  brandPWrap: {
    position: "relative",
    display: "inline-block",
    lineHeight: 1,
  },

  brandP: {
    display: "inline-block",
    backgroundImage:
      "linear-gradient(180deg, #ffffff 0%, #e9e9e9 35%, #bdbdbd 70%, #ffffff 100%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
    WebkitTextStroke: "0.6px rgba(255, 255, 255, 0.14)",
    textShadow:
      "0 1px 0 rgba(255, 255, 255, 0.08), 0 10px 22px rgba(0, 0, 0, 0.55), 0 0 18px rgba(255, 255, 255, 0.08)",
    fontWeight: 800,
  },

  brandRest: {
    display: "inline-block",
    backgroundImage:
      "linear-gradient(180deg, #ffffff 0%, #e9e9e9 35%, #bdbdbd 70%, #ffffff 100%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
    WebkitTextStroke: "0.6px rgba(255, 255, 255, 0.14)",
    textShadow:
      "0 1px 0 rgba(255, 255, 255, 0.08), 0 10px 22px rgba(0, 0, 0, 0.55), 0 0 18px rgba(255, 255, 255, 0.08)",
    fontWeight: 800,
  },

  brandCutTriangle: {
    position: "absolute",
    left: "-0.04em",
    top: "-0.055em",
    width: "0.68em",
    height: "0.68em",
    backgroundImage: "linear-gradient(180deg, #0b121e 0%, #050812 100%)",
    clipPath: "polygon(0% 0%, 100% 0%, 0% 100%)",
    zIndex: 3,
    pointerEvents: "none",
  },

  brandCutDot: {
    position: "absolute",
    left: "0.16em",
    top: "0.15em",
    width: "0.14em",
    height: "0.14em",
    backgroundImage: "linear-gradient(180deg, #0b121e 0%, #050812 100%)",
    borderRadius: "0.07em",
    opacity: 0.86,
    zIndex: 3,
    pointerEvents: "none",
  },

  brandAccent: {
    color: "#c1121f",
    WebkitTextStroke: "0.6px rgba(255, 255, 255, 0.14)",
    textShadow:
      "0 1px 0 rgba(255, 255, 255, 0.08), 0 10px 22px rgba(0, 0, 0, 0.55), 0 0 18px rgba(255, 255, 255, 0.08), 0 0 8px rgba(193, 18, 31, 0.35), 0 0 18px rgba(193, 18, 31, 0.25)",
    marginLeft: 8,
    fontWeight: 800,
  },

  crownContainer: {
    position: "absolute",
    top: "-0.57em",
    left: "-0.62em",
    transformOrigin: "98% 92%",
    transform: "rotate(-43deg) translate(0.08em, 0.48em) scale(0.82)",
    pointerEvents: "none",
    zIndex: 10,
  },

  particles: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: "0.95em",
    height: "0.95em",
    transform: "translate(-50%, -50%)",
    background: "radial-gradient(circle, rgba(255,204,0,0.14) 0%, transparent 70%)",
    opacity: 0.85,
    zIndex: 2,
    borderRadius: 999,
  },

  crown: {
    position: "relative",
    width: "0.62em",
    height: "0.44em",
    background: "#ffcc00",
    clipPath:
      "polygon(0% 100%, 0% 20%, 25% 60%, 50% 0%, 75% 60%, 100% 20%, 100% 100%)",
    filter:
      "drop-shadow(0 0 0.16em rgba(255, 220, 80, 0.85)) drop-shadow(0 0 0.34em rgba(255, 204, 0, 0.45)) drop-shadow(0 0.18em 0.30em rgba(0, 0, 0, 0.45))",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-end",
    paddingBottom: "0.06em",
    zIndex: 3,
    overflow: "hidden",
  },

  diamond: {
    width: "0.09em",
    height: "0.09em",
    margin: "0 0.03em",
    borderRadius: "50%",
  },
  diamondBlue: { background: "#00d4ff", boxShadow: "0 0 0.18em #00d4ff" },
  diamondRed: { background: "#ff0000", boxShadow: "0 0 0.18em #ff0000" },
  diamondGreen: { background: "#00ff44", boxShadow: "0 0 0.18em #00ff44" },

  sub: { fontSize: 12, opacity: 0.78, marginTop: 6, lineHeight: 1.5 },
  subMobile: { fontSize: 11, marginTop: 8, wordBreak: "break-word" },

  emailBlue: {
    color: "#7EC8FF",
    textShadow: "0 0 10px rgba(126,200,255,0.22)",
    fontWeight: 900,
    wordBreak: "break-word",
  },

  statusActive: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid rgba(0,255,160,0.30)",
    background: "rgba(0,255,160,0.12)",
    color: "#caffea",
    boxShadow: "0 0 18px rgba(0,255,160,0.10)",
  },
  statusInactive: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255, 185, 0, 0.28)",
    background: "rgba(255, 185, 0, 0.10)",
    color: "#ffd88a",
  },

  loading: {
    padding: 18,
    borderRadius: 12,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
  },

  grid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 },
  gridMobile: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 },

  grid2: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 12 },
  grid2Mobile: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 10 },

  card: {
    padding: 14,
    borderRadius: 12,
    background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.028))",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 10px 26px rgba(0,0,0,0.28)",
    minWidth: 0,
  },
  cardMobile: { padding: 12, borderRadius: 11 },

  cardTitle: { fontSize: 12, opacity: 0.78, lineHeight: 1.35 },
  cardTitleMobile: { fontSize: 11 },

  cardValue: {
    fontSize: 22,
    fontWeight: 900,
    marginTop: 6,
    textShadow: "0 2px 0 rgba(0,0,0,0.55)",
    wordBreak: "break-word",
  },
  cardValueMobile: { fontSize: 18, marginTop: 5 },

  cardHint: { fontSize: 11, opacity: 0.6, marginTop: 6, lineHeight: 1.35 },
  cardHintMobile: { fontSize: 10 },

  valueMoneyGreen: {
    color: "#00ff44",
    textShadow: "0 0 10px rgba(0,255,68,0.18), 0 2px 0 rgba(0,0,0,0.55)",
  },
  moneyGreen: {
    color: "#00ff44",
    fontWeight: 900,
    textShadow: "0 0 10px rgba(0,255,68,0.18)",
  },
  moneyBlue: {
    color: "#7EC8FF",
    fontWeight: 900,
    textShadow: "0 0 10px rgba(126,200,255,0.18)",
  },
  moneyBroker: {
    color: "#10b981",
    fontWeight: 900,
    textShadow: "0 0 10px rgba(16,185,129,0.18)",
  },

  panel: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.026))",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.30)",
    minWidth: 0,
  },
  panelMobile: { marginTop: 10, padding: 12, borderRadius: 11 },

  panelTitle: {
    fontSize: 14,
    fontWeight: 900,
    marginBottom: 10,
    letterSpacing: 0.2,
    textShadow: "0 1px 0 rgba(0,0,0,0.6)",
  },
  panelTitleMobile: { fontSize: 13, marginBottom: 9 },

  panelNote: {
    fontSize: 12,
    opacity: 0.78,
    marginBottom: 12,
    color: "#cbd5e1",
    lineHeight: 1.45,
  },
  panelNoteMobile: { fontSize: 11, marginBottom: 10 },

  linkRow: { display: "flex", gap: 10, alignItems: "center" },
  linkRowMobile: { flexDirection: "column", alignItems: "stretch", gap: 10 },

  linkInputWrap: { position: "relative", flex: 1, borderRadius: 12, minWidth: 0 },
  linkInput: {
    width: "100%",
    height: 42,
    borderRadius: 12,
    border: "1px solid rgba(120, 180, 255, 0.22)",
    background: "linear-gradient(180deg, rgba(0,0,0,0.30), rgba(0,0,0,0.20))",
    color: "#bfe6ff",
    padding: "0 12px",
    outline: "none",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.03)",
    boxSizing: "border-box",
  },
  linkInputMobile: { height: 40, fontSize: 11, borderRadius: 11 },

  linkGlowLine: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 6,
    height: 1,
    borderRadius: 999,
    background:
      "linear-gradient(90deg, transparent, rgba(126,200,255,0.40), rgba(0,255,160,0.22), transparent)",
    opacity: 0.9,
    pointerEvents: "none",
  },

  mini: { fontSize: 12, opacity: 0.82, marginTop: 10, lineHeight: 1.55, wordBreak: "break-word" },
  miniMobile: { fontSize: 11, marginTop: 9 },

  miniStrong: { fontWeight: 900, color: "#e9eefc" },

  warn: {
    marginTop: 10,
    fontSize: 12,
    padding: 10,
    borderRadius: 10,
    background: "rgba(255, 185, 0, 0.08)",
    border: "1px solid rgba(255, 185, 0, 0.18)",
    color: "#ffd88a",
    lineHeight: 1.45,
  },

  warnError: {
    marginTop: 10,
    marginBottom: 10,
    fontSize: 12,
    padding: 10,
    borderRadius: 10,
    background: "rgba(255, 90, 90, 0.08)",
    border: "1px solid rgba(255, 90, 90, 0.18)",
    color: "#ffd0d0",
    lineHeight: 1.5,
  },

  warnLine: {
    marginTop: 4,
    wordBreak: "break-word",
  },

  kvGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 },
  kvGridMobile: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },

  kv: {
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "linear-gradient(180deg, rgba(0,0,0,0.22), rgba(0,0,0,0.16))",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.02)",
    minWidth: 0,
  },
  kvMobile: { padding: 10, borderRadius: 10 },

  kvLabel: { fontSize: 11, opacity: 0.7, lineHeight: 1.35 },
  kvLabelMobile: { fontSize: 10 },

  kvValue: { marginTop: 6, fontSize: 13, fontWeight: 900, lineHeight: 1.4, wordBreak: "break-word" },
  kvValueMobile: { marginTop: 5, fontSize: 12 },

  tableWrap: { width: "100%", overflowX: "auto" },
  tableWrapMobile: {
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
  },

  table: { width: "100%", borderCollapse: "collapse", minWidth: 760 },
  tableMobile: { minWidth: 680 },

  th: {
    textAlign: "left",
    fontSize: 12,
    opacity: 0.78,
    padding: "10px 8px",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    letterSpacing: 0.2,
    whiteSpace: "nowrap",
  },
  thMobile: { fontSize: 11, padding: "9px 8px" },
  thCenter: { textAlign: "center" },

  td: {
    padding: "10px 8px",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    fontSize: 12,
    verticalAlign: "middle",
    lineHeight: 1.4,
  },
  tdMobile: { fontSize: 11, padding: "9px 8px" },
  tdCenter: { textAlign: "center" },

  tdMonoInline: {
    fontSize: 12,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    opacity: 0.9,
    color: "#d9e4ff",
  },

  codePill: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(120,180,255,0.22)",
    background: "rgba(120,180,255,0.10)",
    color: "#bfe6ff",
    fontWeight: 900,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    boxShadow: "0 0 16px rgba(120,180,255,0.06)",
    whiteSpace: "nowrap",
  },
  codePillMobile: { padding: "4px 8px", fontSize: 10 },

  empty: { fontSize: 12, opacity: 0.75, padding: "8px 2px" },
  hint: { marginTop: 8, fontSize: 11, opacity: 0.65, lineHeight: 1.4 },

  chipBaseMobile: {
    minWidth: 94,
    padding: "6px 10px",
    fontSize: 11,
  },

  chipDefault: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 110,
    padding: "6px 14px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    fontSize: 12.5,
    fontWeight: 900,
    letterSpacing: 0.25,
    whiteSpace: "nowrap",
    lineHeight: 1,
  },
  chipPaid: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 110,
    padding: "6px 14px",
    borderRadius: 999,
    border: "1px solid rgba(0,255,160,0.30)",
    background: "rgba(0,255,160,0.12)",
    fontSize: 12.5,
    fontWeight: 900,
    letterSpacing: 0.25,
    color: "#caffea",
    boxShadow: "0 0 18px rgba(0,255,160,0.08)",
    whiteSpace: "nowrap",
    lineHeight: 1,
  },
  chipPending: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 110,
    padding: "6px 14px",
    borderRadius: 999,
    border: "1px solid rgba(255, 185, 0, 0.28)",
    background: "rgba(255, 185, 0, 0.10)",
    fontSize: 12.5,
    fontWeight: 900,
    letterSpacing: 0.25,
    color: "#ffd88a",
    whiteSpace: "nowrap",
    lineHeight: 1,
  },
  chipNoProfit: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 110,
    padding: "6px 14px",
    borderRadius: 999,
    border: "1px solid rgba(120, 180, 255, 0.28)",
    background: "rgba(120, 180, 255, 0.12)",
    fontSize: 12.5,
    fontWeight: 900,
    letterSpacing: 0.25,
    color: "#bfe6ff",
    whiteSpace: "nowrap",
    lineHeight: 1,
  },
  chipFailed: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 110,
    padding: "6px 14px",
    borderRadius: 999,
    border: "1px solid rgba(255, 90, 90, 0.28)",
    background: "rgba(255, 90, 90, 0.10)",
    fontSize: 12.5,
    fontWeight: 900,
    letterSpacing: 0.25,
    color: "#ffd0d0",
    whiteSpace: "nowrap",
    lineHeight: 1,
  },

  btnPrimary: {
    height: 42,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,255,160,0.28)",
    background: "linear-gradient(180deg, rgba(0,255,160,0.18), rgba(0,255,160,0.10))",
    color: "#caffea",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 10px 22px rgba(0,0,0,0.30), 0 0 18px rgba(0,255,160,0.10)",
    whiteSpace: "nowrap",
  },
  btnPrimaryMobile: {
    width: "100%",
    height: 40,
    borderRadius: 11,
    fontSize: 12,
  },

  btnGhost: {
    height: 36,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
    color: "#e9eefc",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(0,0,0,0.25)",
    alignSelf: "flex-start",
  },
  btnGhostMobile: {
    width: "100%",
    alignSelf: "stretch",
    height: 38,
    fontSize: 12,
  },
};